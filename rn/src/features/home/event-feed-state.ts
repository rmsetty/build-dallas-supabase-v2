import type { NormalizedMeetupEvent, MeetupSearchPage } from '../events/meetup-api';
import type { NormalizedLumaEvent, LumaEventsPage } from '../events/luma-api';
import type { NormalizedEventbriteEvent, EventbriteSearchPage } from '../events/eventbrite-api';
import { mergeProviderEvents } from '../events/provider-event';

export type EventFeedState = {
  meetup: { items: NormalizedMeetupEvent[]; next: string | undefined | null; error: boolean };
  luma: { items: NormalizedLumaEvent[]; next: string | undefined | null; error: boolean };
  eventbrite: { items: NormalizedEventbriteEvent[]; next: number | null; error: boolean };
};

export function emptyFeed(): EventFeedState {
  return {
    meetup: { items: [], next: undefined, error: false },
    luma: { items: [], next: undefined, error: false },
    eventbrite: { items: [], next: 1, error: false },
  };
}

export function nextEventbritePage(page: EventbriteSearchPage): number | null {
  const { pagination } = page;
  const more = pagination.pageCount !== null
    ? pagination.page < pagination.pageCount
    : !!pagination.continuation;
  return more && page.items.length > 0 && pagination.page < 100 ? pagination.page + 1 : null;
}

export function applyFeedResults(
  current: EventFeedState,
  luma: PromiseSettledResult<LumaEventsPage | null>,
  eventbrite: PromiseSettledResult<EventbriteSearchPage | null>,
  append: boolean,
  meetup?: PromiseSettledResult<MeetupSearchPage | null>,
): EventFeedState {
  const next = { ...current };
  if (luma.status === 'rejected') next.luma = { ...current.luma, error: true };
  else if (luma.value) {
    const page = luma.value;
    next.luma = {
      items: [...(append ? current.luma.items : []), ...page.items],
      next: page.hasMore && page.nextCursor && (!append || page.nextCursor !== current.luma.next)
        ? page.nextCursor : null,
      error: false,
    };
  }
  if (eventbrite.status === 'rejected') next.eventbrite = { ...current.eventbrite, error: true };
  else if (eventbrite.value) next.eventbrite = {
    items: [...(append ? current.eventbrite.items : []), ...eventbrite.value.items],
    next: nextEventbritePage(eventbrite.value),
    error: false,
  };
  if (meetup?.status === 'rejected') next.meetup = { ...current.meetup, error: true };
  else if (meetup?.value) {
    const page = meetup.value;
    next.meetup = {
      items: [...new Map([...(append ? current.meetup.items : []), ...page.items].map(event => [event.id, event])).values()],
      next: page.pageInfo.hasNextPage && page.pageInfo.endCursor && (!append || page.pageInfo.endCursor !== current.meetup.next)
        ? page.pageInfo.endCursor : null,
      error: false,
    };
  }
  // Dedupe within each provider without mixing unrelated IDs.
  next.luma = { ...next.luma, items: [...new Map(next.luma.items.map((event) => [event.id, event])).values()] };
  next.eventbrite = { ...next.eventbrite, items: [...new Map(next.eventbrite.items.map((event) => [event.id, event])).values()] };
  return next;
}

export function feedEvents(state: EventFeedState) {
  return mergeProviderEvents([...state.luma.items, ...state.eventbrite.items, ...state.meetup.items]);
}

export function hasMoreEvents(state: EventFeedState) {
  return state.meetup.next !== null || state.luma.next !== null || state.eventbrite.next !== null;
}
