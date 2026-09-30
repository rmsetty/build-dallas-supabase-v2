import { usePalette } from '@/hooks/use-palette';
import { router, useScrollToTop } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { eventPreview, groupEvents } from '../events/event-presentation';
import { toDisplayEvent } from '../events/provider-event';
import { EventRow } from './components/event-row';
import { HomeHeader } from './components/home-chrome';
import { useEventFeed } from './use-event-feed';

export default function HomeScreen() {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  useScrollToTop(scroll);
  const search = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [query, setQuery] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const groupOffsets = useRef<Record<string, number>>({});
  const searching = !!query.trim();
  const feed = useEventFeed(query.trim());
  // Ranked results stay in rank order, each row carrying its own date.
  const ranked = useMemo(() => feed.personalized ? feed.events.map(event => eventPreview(toDisplayEvent(event), true)) : [], [feed.events, feed.personalized]);
  const groups = useMemo(() => feed.personalized ? [] : groupEvents(feed.events), [feed.events, feed.personalized]);
  const focusSearch = () => {
    scroll.current?.scrollTo({ y: 0, animated: true });
    search.current?.focus();
  };
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Animated.ScrollView
        ref={scroll}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.refresh} tintColor={colors.secondary} />}
        contentContainerStyle={{ paddingTop: insets.top + 66, paddingBottom: insets.bottom + 115 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
          listener: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
            const y = event.nativeEvent.contentOffset.y + insets.top + 80;
            const group = [...groups].reverse().find((item) => y >= (groupOffsets.current[item.key] ?? Infinity));
            setCurrentDate(group ? group.date + ' / ' + group.weekday : '');
          },
        })}
      >
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <SymbolView name="magnifyingglass" size={19} tintColor={colors.muted} fallback={<Text>⌕</Text>} />
          <TextInput ref={search} value={query} onChangeText={setQuery} placeholder="Search Dallas events" placeholderTextColor={colors.muted}
            accessibilityLabel="Search Dallas events" returnKeyType="search" autoCorrect={false}
            style={[styles.input, { color: colors.text }]} />
          {!!query && <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12}><Text style={{ color: colors.secondary, fontSize: 20 }}>×</Text></Pressable>}
        </View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{searching ? 'Search Results' : 'For You'}</Text>
          {feed.personalized && <Pressable onPress={() => router.push('/interests')} accessibilityRole="button" hitSlop={10}>
            <Text style={[styles.link, { color: colors.secondary }]}>Edit interests</Text>
          </Pressable>}
        </View>
        {!searching && feed.personalized === false && <Pressable onPress={() => router.push('/interests')} accessibilityRole="button"
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && { opacity: 0.7 }]}>
          <SymbolView name="sparkles" size={20} tintColor={colors.text} fallback={<Text style={{ color: colors.text }}>✦</Text>} />
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Personalize your feed</Text>
            <Text style={[styles.cardText, { color: colors.secondary }]}>Import your resume or pick a few interests to see events picked for you.</Text>
          </View>
          <SymbolView name="chevron.right" size={14} tintColor={colors.muted} fallback={<Text style={{ color: colors.muted }}>›</Text>} />
        </Pressable>}
        {feed.error && <View style={styles.message}><Text style={{ color: colors.secondary }}>{feed.error}</Text><Pressable onPress={feed.retry} accessibilityRole="button"><Text style={[styles.retry, { color: colors.text }]}>Try again</Text></Pressable></View>}
        {feed.loading && !feed.events.length && <ActivityIndicator accessibilityLabel="Loading events" style={styles.message} color={colors.secondary} />}
        {!feed.loading && !feed.error && !feed.events.length && <View style={styles.message}><Text style={[styles.title, { color: colors.text }]}>{searching ? 'No matching events' : feed.personalized ? 'Nothing matches yet' : 'No upcoming events'}</Text><Text style={[styles.subtitle, { color: colors.secondary }]}>{searching ? 'Try another keyword or clear your search.' : feed.personalized ? 'Try adding a few more interests.' : 'Check back soon for more around Dallas.'}</Text></View>}
        {ranked.length > 0 && <View style={styles.group}>
          {ranked.map((event, index) => <EventRow key={event.id} event={event} separator={index !== ranked.length - 1} />)}
        </View>}
        {groups.map((group) => <View key={group.key} style={styles.group} onLayout={({ nativeEvent }) => { groupOffsets.current[group.key] = nativeEvent.layout.y; }}>
          <Text accessibilityRole="header" style={[styles.date, { color: colors.text }]}>{group.date}<Text style={{ color: colors.muted }}> / {group.weekday}</Text></Text>
          {group.events.map((event, index) => <EventRow key={event.id} event={event} separator={index !== group.events.length - 1} />)}
        </View>)}
        {feed.hasMore && <Pressable disabled={feed.loading} onPress={feed.loadMore} accessibilityRole="button" style={styles.message}>{feed.loading ? <ActivityIndicator color={colors.secondary} /> : <Text style={[styles.retry, { color: colors.text }]}>Load more events</Text>}</Pressable>}
      </Animated.ScrollView>
      <HomeHeader scrollY={scrollY} date={currentDate} onSearchPress={focusSearch} />
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { marginHorizontal: 20, marginBottom: 24, borderRadius: 12, paddingHorizontal: 12, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, fontSize: 17, height: 44 },
  heading: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  link: { fontSize: 15, fontWeight: '500' },
  card: { marginHorizontal: 20, marginTop: 16, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardText: { fontSize: 14, lineHeight: 19 },
  title: { fontSize: 21, fontWeight: '600', letterSpacing: -0.55 },
  subtitle: { fontSize: 15, marginTop: 5 },
  group: { paddingHorizontal: 20, marginTop: 24 },
  date: { fontSize: 17, fontWeight: '500', letterSpacing: -0.2 },
  message: { padding: 24, alignItems: 'center', gap: 12 },
  retry: { fontSize: 16, fontWeight: '600', padding: 8 },
});
