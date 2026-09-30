import { supabase } from '@/lib/supabase';

export type NormalizedLocation = {
  visibility: 'public' | 'restricted' | 'unknown';
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type NormalizedOrganizer = {
  id: string | null;
  name: string | null;
  slug: string | null;
  avatarUrl: string | null;
};

export type NormalizedHost = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  linkedin: string | null;
  instagram: string | null;
  twitter: string | null;
};

export type NormalizedTickets = {
  isFree: boolean | null;
  price: number | null;
  maxPrice: number | null;
  currency: string | null;
  isSoldOut: boolean | null;
  spotsRemaining: number | null;
  isNearCapacity: boolean | null;
  requireApproval: boolean | null;
};

export type NormalizedDiscoverPlaceRef = {
  id: string | null;
  name: string | null;
  slug: string | null;
};

export type NormalizedLumaEvent = {
  source: 'luma';
  id: string;
  slug: string | null;
  url: string | null;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  timezone: string | null;
  imageUrl: string | null;
  socialImageUrl: string | null;
  locationType: string | null;
  location: NormalizedLocation;
  organizer: NormalizedOrganizer | null;
  hosts: NormalizedHost[];
  guestCount: number | null;
  ticketCount: number | null;
  tickets: NormalizedTickets;
  registrationAvailability: string | null;
  waitlistEnabled: boolean | null;
  waitlistStatus: string | null;
  discoverPlace: NormalizedDiscoverPlaceRef | null;
  fetchedAt: string;
};

export type LumaDiscoverPlace = {
  id: string;
  slug: string;
  name: string;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type LumaEventsPage = {
  items: NormalizedLumaEvent[];
  events: NormalizedLumaEvent[];
  hasMore: boolean;
  nextCursor?: string | null;
  place?: LumaDiscoverPlace | null;
  total?: number | null;
};

export type FetchLumaEventsParams = {
  city?: string;
  placeId?: string;
  query?: string;
  limit?: number;
  cursor?: string;
};

export async function fetchLumaEvents(
  params: FetchLumaEventsParams = {},
  _signal?: AbortSignal,
): Promise<LumaEventsPage> {
  let query = supabase
    .from('provider_events')
    .select('data')
    .eq('source', 'luma')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(params.limit ?? 50);
  if (params.query?.trim()) query = query.ilike('search_text', `%${params.query.trim().replace(/[%_]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []).map(row => row.data as NormalizedLumaEvent);
  return { items, events: items, hasMore: false, nextCursor: null, total: items.length };
}

export async function fetchLumaEventById(eventId: string): Promise<NormalizedLumaEvent> {
  const { data, error } = await supabase
    .from('provider_events')
    .select('data')
    .eq('source', 'luma')
    .eq('provider_event_id', eventId)
    .single();
  if (error) throw error;
  return data.data as NormalizedLumaEvent;
}

export async function fetchLumaPlace(_slug: string): Promise<LumaDiscoverPlace> {
  throw new Error('Place lookup is not required by the Supabase V2 event flow.');
}
