import { supabase } from '@/lib/supabase';
import type { NormalizedLumaEvent } from './luma-api';

export type NormalizedMeetupEvent = Pick<NormalizedLumaEvent,
  'id' | 'url' | 'title' | 'description' | 'startAt' | 'endAt' | 'timezone' |
  'imageUrl' | 'socialImageUrl' | 'locationType' | 'location' | 'organizer' |
  'hosts' | 'guestCount' | 'tickets' | 'registrationAvailability' | 'waitlistStatus' | 'fetchedAt'
> & {
  source: 'meetup';
  eventType: 'physical' | 'online' | 'unknown';
  rsvp: { status: string | null; count: number | null; capacity: number | null };
  pricing: { amount: number | null; currency: string | null; paymentMethod: string | null; hasKnownFee: boolean };
  series: {
    description: string | null;
    weeklyRecurrence: Record<string, unknown> | null;
    monthlyRecurrence: Record<string, unknown> | null;
    occurrences: { id: string; startAt: string }[];
  } | null;
};

export type MeetupSearchPage = {
  items: NormalizedMeetupEvent[];
  totalCount: number | null;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const records = new Map<string, NormalizedMeetupEvent>();

export function rememberMeetupEvents(events: NormalizedMeetupEvent[]) {
  for (const event of events) {
    records.delete(event.id);
    records.set(event.id, event);
  }
  while (records.size > 1000) records.delete(records.keys().next().value!);
}

export async function fetchMeetupEvents(
  params: { query?: string; cursor?: string } = {},
  _signal?: AbortSignal,
): Promise<MeetupSearchPage> {
  let query = supabase
    .from('provider_events')
    .select('data')
    .eq('source', 'meetup')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(50);
  if (params.query?.trim()) query = query.ilike('search_text', `%${params.query.trim().replace(/[%_]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw error;
  const items = (data ?? []).map(row => row.data as NormalizedMeetupEvent);
  rememberMeetupEvents(items);
  return { items, totalCount: items.length, pageInfo: { hasNextPage: false, endCursor: null } };
}

export async function fetchMeetupEventById(id: string): Promise<NormalizedMeetupEvent> {
  const remembered = records.get(id);
  if (remembered) return remembered;
  const { data, error } = await supabase
    .from('provider_events')
    .select('data')
    .eq('source', 'meetup')
    .eq('provider_event_id', id)
    .single();
  if (error) throw error;
  return data.data as NormalizedMeetupEvent;
}
