import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useScrollToTop } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '@/hooks/use-palette';
import { sessionStore } from '@/lib/session-store';
import { EventRow } from '../home/components/event-row';
import { groupEvents } from '../events/event-presentation';
import { mergeProviderEvents, toDisplayEvent } from '../events/provider-event';
import { fetchStartupEvents, type StartupEvents } from './discover-api';
import { fetchBootstrap, fetchCatalogPage } from './bootstrap-api';

type Segment = 'startups' | 'all';
const SEGMENTS: { key: Segment; label: string; search: string; loading: string; empty: string }[] = [
  { key: 'startups', label: 'Startups', search: 'Search startup events', loading: 'Finding startup events around Dallas…', empty: 'No upcoming startup events found. Check back soon.' },
  { key: 'all', label: 'All', search: 'Search all events', loading: 'Finding events around Dallas…', empty: 'No upcoming events found. Check back soon.' },
];

export default function DiscoverScreen() {
  const scroll = useRef<ScrollView>(null);
  useScrollToTop(scroll);
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('startups');
  const [pages, setPages] = useState<Record<Segment, StartupEvents | null>>({ startups: null, all: null });
  const page = pages[segment];
  const copy = SEGMENTS.find(item => item.key === segment)!;
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async (force = false, append = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const target = segment;
    setLoading(true);
    setError(false);
    try {
      // "All" is the chronological catalog that Home showed before it became For You.
      const result = append
        ? await fetchCatalogPage('', page?.next_cursor, target === 'startups')
        : target === 'startups'
          ? await fetchStartupEvents(controller.signal, force)
          : (await fetchBootstrap(sessionStore.get()?.access_token, force)).home;
      if (!controller.signal.aborted) setPages(previous => ({ ...previous, [target]: { ...result,
        items: append ? mergeProviderEvents([...(previous[target]?.items || []), ...result.items]) : result.items,
      } }));
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [segment, page?.next_cursor]);
  const loadRef = useRef(load);
  loadRef.current = load;
  useFocusEffect(useCallback(() => {
    void loadRef.current();
    return () => request.current?.abort();
  }, [segment]));
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groupEvents((page?.items ?? []).filter((raw) => {
      const event = toDisplayEvent(raw);
      return !needle || [event.title, event.description, event.organizer?.name, ...event.hosts.map((host) => host.name)]
        .filter(Boolean).join(' ').toLowerCase().includes(needle);
    }));
  }, [page, query]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={loading && !!page} onRefresh={() => void load(true)} tintColor={colors.secondary} />}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 115 }}>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Discover</Text>
        <View accessibilityRole="tablist" style={[styles.segments, { backgroundColor: colors.surface }]}>
          {SEGMENTS.map(item => {
            const selected = item.key === segment;
            return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setSegment(item.key)}
              style={[styles.segment, selected && [styles.segmentSelected, { backgroundColor: colors.background }]]}>
              <Text style={[styles.segmentText, { color: selected ? colors.text : colors.secondary }]}>{item.label}</Text>
            </Pressable>;
          })}
        </View>
        <TextInput accessibilityLabel={copy.search} value={query} onChangeText={setQuery}
          placeholder={copy.search} placeholderTextColor={colors.muted} autoCorrect={false}
          style={[styles.search, { color: colors.text, backgroundColor: colors.surface }]} />
        {loading && !page && <View style={styles.state}><ActivityIndicator color={colors.text} /><Text style={{ color: colors.secondary }}>{copy.loading}</Text></View>}
        {error && <View style={styles.state}><Text style={{ color: colors.secondary }}>Couldn’t refresh discovery. Please try again.</Text><Pressable accessibilityRole="button" onPress={() => void load(true)}><Text style={{ color: colors.text }}>Retry</Text></Pressable></View>}
        {page?.incomplete && <Text style={[styles.subtitle, { color: colors.secondary }]}>Some searches couldn’t finish. Showing the events we could verify.</Text>}
        {!loading && !error && !groups.length && <Text style={[styles.subtitle, { color: colors.secondary }]}>{query.trim() ? 'No matches. Try another keyword.' : copy.empty}</Text>}
        {groups.map((group) => <View key={group.key} style={styles.group}>
          <Text accessibilityRole="header" style={[styles.date, { color: colors.text }]}>{group.date}<Text style={{ color: colors.muted }}> / {group.weekday}</Text></Text>
          {group.events.map((event, index) => <EventRow key={event.id} event={event} separator={index !== group.events.length - 1} />)}
        </View>)}
        {!!page?.next_cursor && <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load(false, true)} style={styles.state}>
          <Text style={{ color: colors.text }}>{loading ? 'Loading…' : 'Load more events'}</Text>
        </Pressable>}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  segments: { flexDirection: 'row', borderRadius: 10, padding: 2, marginTop: 20 },
  segment: { flex: 1, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
  segmentText: { fontSize: 14, fontWeight: '600' },
  search: { borderRadius: 12, height: 44, paddingHorizontal: 14, marginTop: 16, fontSize: 17 },
  group: { marginTop: 24 },
  date: { fontSize: 17, fontWeight: '500' },
  state: { paddingVertical: 28, alignItems: 'center', gap: 12 },
});
