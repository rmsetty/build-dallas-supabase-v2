import { supabase } from '@/lib/supabase';
import type { CurrentUser, EventPage } from '../events/community-api';
import { fetchCurrentUser } from '../events/community-api';
import type { ForYouPage, Interests } from '../interests/interests-api';
import type { StartupEvents } from './discover-api';

export type CatalogPage = StartupEvents & { next_cursor: string | null };
export type Bootstrap = {
  user: CurrentUser | null;
  home: CatalogPage;
  discover: CatalogPage;
  for_you?: ForYouPage | null;
  interests?: Interests | null;
  events: EventPage;
  cache_ttl: number;
};

let cached: { key: string; value: Bootstrap; until: number } | null = null;
let pending: { key: string; promise: Promise<Bootstrap> } | null = null;
let generation = 0;

export function clearBootstrap() {
  generation++;
  cached = null;
  pending = null;
}

export function updateBootstrapUser(user: CurrentUser) {
  if (cached?.value.user?.id === user.id) cached.value = { ...cached.value, user };
}

async function catalogPage(query = '', startup = false, limit = 100): Promise<CatalogPage> {
  let request = supabase
    .from('provider_events')
    .select('data')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(limit);

  if (startup) request = request.eq('startup', true);
  if (query.trim()) request = request.ilike('search_text', `%${query.trim().replace(/[%_]/g, '')}%`);

  const [{ data: rows, error }, { data: status, error: statusError }] = await Promise.all([
    request,
    supabase.from('ingestion_status').select('source,fetched_at,incomplete'),
  ]);
  if (error) throw error;
  if (statusError) throw statusError;

  const expected = ['luma', 'eventbrite', 'meetup'];
  const bySource = new Map((status ?? []).map(row => [row.source, row]));
  const failedProviders = expected.filter(source => !bySource.has(source));
  const stale = (status ?? []).some(row => Date.now() - Date.parse(row.fetched_at) > 24 * 60 * 60 * 1000);
  const incomplete = failedProviders.length > 0 || stale || (status ?? []).some(row => row.incomplete);

  return {
    items: (rows ?? []).map(row => row.data),
    queries: [],
    failedQueries: [],
    failedProviders,
    incomplete,
    fetchedAt: (status ?? []).map(row => row.fetched_at).sort()[0] ?? new Date().toISOString(),
    next_cursor: null,
  } as CatalogPage;
}

async function communityPage(): Promise<EventPage> {
  const { data, error } = await supabase.rpc('list_community_events', { page_limit: 20, mine: false });
  if (error) throw error;
  return (data ?? { items: [], next_cursor: null }) as EventPage;
}

async function currentUserOrNull(): Promise<CurrentUser | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  try {
    return await fetchCurrentUser(session.access_token);
  } catch {
    return null;
  }
}

async function interestsAndFeed() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { interests: null, for_you: null };

  const [{ data: interests }, { data: feed, error: feedError }] = await Promise.all([
    supabase.from('user_interests').select('interests,about,updated_at').maybeSingle(),
    supabase.rpc('my_recommended_provider_events', { offset_count: 0, limit_count: 30 }),
  ]);
  if (feedError && feedError.code !== 'P0001') throw feedError;
  return {
    interests: interests as Interests | null,
    for_you: feed ? ({ ...(feed as CatalogPage), personalized: true } as ForYouPage) : null,
  };
}

export async function fetchBootstrap(_token?: string | null, force = false): Promise<Bootstrap> {
  const { data: { session } } = await supabase.auth.getSession();
  const key = session?.access_token || 'public';
  if (!force && cached?.key === key && cached.until > Date.now()) return cached.value;
  if (pending?.key === key) return pending.promise;

  const current = generation;
  const promise = Promise.all([
    catalogPage('', false, 100),
    catalogPage('', true, 100),
    communityPage(),
    currentUserOrNull(),
    interestsAndFeed(),
  ]).then(([home, discover, events, user, personalized]) => {
    const value: Bootstrap = {
      user,
      home,
      discover,
      events,
      for_you: personalized.for_you,
      interests: personalized.interests,
      cache_ttl: 60,
    };
    if (current === generation) cached = { key, value, until: Date.now() + 60_000 };
    return value;
  }).finally(() => {
    if (pending?.promise === promise) pending = null;
  });

  pending = { key, promise };
  return promise;
}

export async function fetchCatalogPage(query = '', _cursor?: string | null, startup = false) {
  return catalogPage(query, startup, 100);
}
