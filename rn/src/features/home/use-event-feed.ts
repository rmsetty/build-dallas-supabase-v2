import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { sessionStore } from '@/lib/session-store';
import { fetchBootstrap, fetchCatalogPage, type CatalogPage } from '../discover/bootstrap-api';
import { eventKey, mergeProviderEvents, type ProviderEvent } from '../events/provider-event';
import { fetchForYouPage } from '../interests/interests-api';

type FeedPage = CatalogPage & { personalized?: boolean };

// Ranked pages keep the server's order; mergeProviderEvents would re-sort them by date.
function appendRanked(previous: ProviderEvent[], next: ProviderEvent[]) {
  const seen = new Set(previous.map(eventKey));
  return [...previous, ...next.filter(event => {
    const key = eventKey(event);
    if (seen.has(key) || !event.id || !Number.isFinite(Date.parse(event.startAt))) return false;
    seen.add(key);
    return true;
  })];
}

// With no query: the personalized "For You" ranking when the user has interests, else all upcoming events.
export function useEventFeed(query: string) {
  const [page, setPage] = useState<FeedPage | null>(null);
  const snapshot = useRef<FeedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const activeQuery = useRef('');

  const load = useCallback(async (append = false, refresh = false) => {
    const current = ++generation.current;
    busy.current = true;
    setLoading(true); setRefreshing(refresh); setError(null);
    try {
      const previous = snapshot.current;
      const token = sessionStore.get()?.access_token;
      const result: FeedPage = !append && !query
        ? await fetchBootstrap(token, refresh).then(data => data.for_you ? { ...data.for_you, personalized: true } : data.home)
        : append && !query && previous?.personalized
          ? await fetchForYouPage(token, previous.next_cursor)
          : await fetchCatalogPage(query, append ? previous?.next_cursor : null);
      if (current !== generation.current) return;
      const items = result.personalized ? appendRanked(append ? previous?.items || [] : [], result.items)
        : append ? mergeProviderEvents([...(previous?.items || []), ...result.items]) : result.items;
      const next = { ...result, items };
      snapshot.current = next; setPage(next);
    } catch {
      if (current === generation.current) setError('Couldn’t load events. Please try again.');
    } finally {
      if (current === generation.current) { busy.current = false; setLoading(false); setRefreshing(false); }
    }
  }, [query]);

  useFocusEffect(useCallback(() => {
    if (activeQuery.current !== query) { snapshot.current = null; setPage(null); activeQuery.current = query; }
    const timer = setTimeout(() => void load(), query ? 300 : 0);
    return () => { clearTimeout(timer); generation.current++; busy.current = false; };
  }, [query, load]));

  return {
    events: page?.items || [], loading, refreshing,
    error: error || (page?.incomplete ? 'Some event sources are awaiting a refresh.' : null),
    // null until the first page arrives, so Home doesn't flash the wrong layout.
    personalized: page ? !query && !!page.personalized : null,
    hasMore: !!page?.next_cursor,
    refresh: () => void load(false, true), retry: () => void load(false, true),
    loadMore: () => { if (snapshot.current?.next_cursor && !busy.current) void load(true); },
  };
}
