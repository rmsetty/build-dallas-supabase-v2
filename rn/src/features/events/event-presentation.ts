import type { EventPreview } from '../home/home-data';
import { eventKey, providerName, toDisplayEvent, mergeProviderEvents, type DisplayEvent, type ProviderEvent } from './provider-event';

export const DALLAS_TIMEZONE = 'America/Chicago';

export function eventTimezone(event: DisplayEvent) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: event.timezone ?? DALLAS_TIMEZONE });
    return event.timezone ?? DALLAS_TIMEZONE;
  } catch {
    return DALLAS_TIMEZONE;
  }
}

export function eventLocation(event: DisplayEvent) {
  if (event.locationType === 'online') return 'Online event';
  const location = event.location;
  if (location.visibility === 'restricted') return 'Register to see location';
  return location.venueName || location.address || location.city || 'Location to be announced';
}

export function ticketPrice(event: DisplayEvent) {
  const { isFree, price, maxPrice, currency } = event.tickets;
  if (isFree === true) return 'Free';
  if (price === null || !currency) return undefined;
  try {
    const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: Math.max(2, new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2) });
    return maxPrice !== null && maxPrice > price
      ? format.format(price) + '–' + format.format(maxPrice)
      : format.format(price);
  } catch {
    return undefined;
  }
}

export function registrationStatus(event: DisplayEvent) {
  if (event.waitlistStatus === 'active' || event.registrationAvailability === 'waitlist') return 'Waitlist open';
  if (event.tickets.isSoldOut) return 'Sold out';
  if (event.registrationAvailability === 'closed') return 'Registration closed';
  if (event.tickets.requireApproval) return 'Approval required';
  if (event.registrationAvailability === 'open') return 'Registration open';
  if (event.registrationAvailability === 'not_started') return 'Tickets not yet on sale';
  return 'See registration details on ' + providerName(event.source);
}

export function eventPreview(event: DisplayEvent, includeDate = false): EventPreview {
  const host = event.hosts.find((item) => item.name);
  const image = event.imageUrl || event.socialImageUrl;
  const avatar = host?.avatarUrl || event.organizer?.avatarUrl;
  const rawHost = event.hosts.map((item) => item.name).filter(Boolean).join(', ') || event.organizer?.name || '';
  const isProvider = /^(luma|eventbrite)$/i.test(rawHost.trim());
  return {
    id: eventKey(event),
    title: event.title,
    host: !isProvider && rawHost ? rawHost : 'Host to be announced',
    artwork: image ? { uri: image } : null,
    hostAvatar: avatar ? { uri: avatar } : undefined,
    time: new Date(event.startAt).toLocaleString('en-US', {
      timeZone: eventTimezone(event),
      ...(includeDate ? { month: 'short', day: 'numeric', weekday: 'short' } as const : {}),
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }),
    location: eventLocation(event),
    price: ticketPrice(event),
    nearCapacity: event.tickets.isNearCapacity === true,
    status: event.tickets.isSoldOut ? 'Sold out' : event.tickets.requireApproval ? 'Approval required' : undefined,
  };
}

export function groupEvents(events: ProviderEvent[], now = new Date()) {
  const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: DALLAS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  const today = dayKey(now);
  // Calendar arithmetic avoids DST transitions shifting tomorrow's date.
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: DALLAS_TIMEZONE, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const tomorrow = dayKey(new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 1, 18)));
  const groups = new Map<string, { key: string; date: string; weekday: string; events: EventPreview[] }>();
  const unique = mergeProviderEvents(events).map(toDisplayEvent);
  unique.filter((event) => Number.isFinite(Date.parse(event.startAt))).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).forEach((event) => {
    const date = new Date(event.startAt);
    const key = dayKey(date);
    if (!groups.has(key)) groups.set(key, {
      key,
      date: key === today ? 'Today' : key === tomorrow ? 'Tomorrow' : date.toLocaleDateString('en-US', { timeZone: DALLAS_TIMEZONE, month: 'long', day: 'numeric' }),
      weekday: date.toLocaleDateString('en-US', { timeZone: DALLAS_TIMEZONE, weekday: 'long' }),
      events: [],
    });
    groups.get(key)!.events.push(eventPreview(event));
  });
  return [...groups.values()];
}
