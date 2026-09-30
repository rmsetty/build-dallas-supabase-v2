import { supabase } from '@/lib/supabase';

export type NormalizedEventbriteVenue = {
  id: string | null;
  name: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
  displayAddress: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type NormalizedEventbriteOrganizer = {
  id: string | null;
  name: string | null;
  url: string | null;
  websiteUrl: string | null;
  summary: string | null;
};

export type NormalizedEventbriteTags = {
  categories: string[];
  subcategories: string[];
  formats: string[];
  organizerTags: string[];
};

export type NormalizedEventbriteTickets = {
  isFree: boolean | null;
  hasAvailableTickets: boolean | null;
  isSoldOut: boolean | null;
  hasBogoTickets: boolean | null;
  minimumPriceMinor: number | null;
  maximumPriceMinor: number | null;
  currency: string | null;
};

export type NormalizedEventbriteEvent = {
  source: 'eventbrite';
  id: string;
  url: string | null;
  title: string;
  summary: string | null;
  startAt: string;
  endAt: string | null;
  timezone: string | null;
  imageUrl: string | null;
  imageSmallUrl: string | null;
  imageMediumUrl: string | null;
  imageLargeUrl: string | null;
  isOnline: boolean | null;
  venue: NormalizedEventbriteVenue | null;
  organizer: NormalizedEventbriteOrganizer | null;
  tags: NormalizedEventbriteTags;
  tickets: NormalizedEventbriteTickets;
  salesStatus: string | null;
  seriesId: string | null;
  publishedAt: string | null;
  fetchedAt: string;
};

export type EventbritePagination = {
  page: number;
  pageSize: number;
  pageCount: number | null;
  objectCount: number | null;
  continuation: string | null;
};

export type EventbriteBootstrap = {
  placeId: string;
  placeName: string | null;
  placeType: string | null;
  locationSlug: string;
  csrfToken: string;
  csrfCookie: string | null;
  fetchedAt: string;
};

export type EventbriteSearchPage = {
  events: NormalizedEventbriteEvent[];
  items: NormalizedEventbriteEvent[];
  pagination: EventbritePagination;
  place: EventbriteBootstrap | null;
};

export type FetchEventbriteEventsParams = {
  query?: string;
  location?: string;
  placeId?: string;
  page?: number;
  pageSize?: number;
};

export async function fetchEventbriteEvents(
  params: FetchEventbriteEventsParams = {},
  _signal?: AbortSignal,
): Promise<EventbriteSearchPage> {
  let query = supabase
    .from('provider_events')
    .select('data')
    .eq('source', 'eventbrite')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(params.pageSize ?? 50);
  if (params.query?.trim()) query = query.ilike('search_text', `%${params.query.trim().replace(/[%_]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []).map(row => row.data as NormalizedEventbriteEvent);
  return {
    items,
    events: items,
    pagination: { page: params.page ?? 1, pageSize: params.pageSize ?? 50, pageCount: 1, objectCount: items.length, continuation: null },
    place: null,
  };
}

export async function fetchEventbritePlace(_locationSlug: string): Promise<EventbriteBootstrap> {
  throw new Error('Place lookup is not required by the Supabase V2 event flow.');
}

export async function fetchEventbriteEventById(id: string): Promise<NormalizedEventbriteEvent> {
  const { data, error } = await supabase
    .from('provider_events')
    .select('data')
    .eq('source', 'eventbrite')
    .eq('provider_event_id', id)
    .single();
  if (error) throw error;
  return data.data as NormalizedEventbriteEvent;
}
