import type { NormalizedMeetupEvent } from './meetup-api';
import type { NormalizedLumaEvent } from './luma-api';
import type { NormalizedEventbriteEvent } from './eventbrite-api';

export type EventProvider = 'luma' | 'eventbrite' | 'meetup';
export type ProviderEvent = NormalizedLumaEvent | NormalizedEventbriteEvent | NormalizedMeetupEvent;

// A display model only: original provider responses remain intact in the feeds.
export type DisplayEvent = Pick<NormalizedLumaEvent,
  'id' | 'url' | 'title' | 'description' | 'startAt' | 'endAt' | 'timezone' |
  'imageUrl' | 'socialImageUrl' | 'locationType' | 'location' | 'organizer' |
  'hosts' | 'guestCount' | 'tickets' | 'registrationAvailability' | 'waitlistStatus'
> & { source: EventProvider };

export function providerName(source: EventProvider) {
  return source === 'meetup' ? 'Meetup' : source === 'eventbrite' ? 'Eventbrite' : 'Luma';
}

export function eventKey(event: Pick<ProviderEvent, 'source' | 'id'>) {
  return event.source + ':' + event.id;
}

export function parseEventKey(key: string): { source: EventProvider; id: string } | null {
  if (/^evt-[a-zA-Z0-9]+$/.test(key)) return { source: 'luma', id: key };
  const separator = key.indexOf(':');
  const source = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (source === 'luma' && /^evt-[a-zA-Z0-9]+$/.test(id)) return { source, id };
  if (source === 'eventbrite' && /^[0-9]{1,30}$/.test(id)) return { source, id };
  if (source === 'meetup' && /^[a-zA-Z0-9_-]{1,100}$/.test(id)) return { source, id };
  return null;
}

export function minorToMajor(value: number | null, currency: string | null) {
  if (value === null || !currency || !Number.isFinite(value)) return null;
  try {
    const digits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    return value / 10 ** (digits ?? 2);
  } catch {
    return null;
  }
}

export function toDisplayEvent(event: ProviderEvent): DisplayEvent {
  if (event.source === 'luma' || event.source === 'meetup') return event;
  const venue = event.venue;
  const address = venue?.displayAddress || [venue?.address1, venue?.address2, venue?.city, venue?.region, venue?.postalCode].filter(Boolean).join(', ') || null;
  return {
    source: event.source, id: event.id, url: event.url, title: event.title,
    description: event.summary, startAt: event.startAt, endAt: event.endAt, timezone: event.timezone,
    imageUrl: event.imageLargeUrl || event.imageUrl || event.imageMediumUrl || event.imageSmallUrl,
    socialImageUrl: null,
    locationType: event.isOnline ? 'online' : 'offline',
    location: {
      visibility: venue ? 'public' : 'unknown', venueName: venue?.name ?? null,
      address, city: venue?.city ?? null, region: venue?.region ?? null, country: null,
      countryCode: venue?.countryCode ?? null, latitude: venue?.latitude ?? null, longitude: venue?.longitude ?? null,
    },
    organizer: event.organizer ? {
      id: event.organizer.id, name: event.organizer.name, slug: null, avatarUrl: null,
    } : null,
    hosts: [], guestCount: null,
    tickets: {
      isFree: event.tickets.isFree,
      price: minorToMajor(event.tickets.minimumPriceMinor, event.tickets.currency),
      maxPrice: minorToMajor(event.tickets.maximumPriceMinor, event.tickets.currency),
      currency: event.tickets.currency,
      isSoldOut: event.tickets.isSoldOut ?? (event.salesStatus === 'sold_out' ? true : null),
      spotsRemaining: null, isNearCapacity: null, requireApproval: null,
    },
    registrationAvailability: event.salesStatus === 'on_sale' ? 'open'
      : event.salesStatus === 'sales_ended' || event.salesStatus === 'unavailable' ? 'closed'
      : event.salesStatus === 'not_yet_on_sale' ? 'not_started' : null,
    waitlistStatus: null,
  };
}

export function mergeProviderEvents(events: ProviderEvent[]): ProviderEvent[] {
  return [...new Map(events.map((event) => [eventKey(event), event])).values()]
    .filter((event) => event.id && Number.isFinite(Date.parse(event.startAt)))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || eventKey(a).localeCompare(eventKey(b)));
}
