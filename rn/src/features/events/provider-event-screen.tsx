import { fetchMeetupEventById, type NormalizedMeetupEvent } from './meetup-api';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '@/hooks/use-palette';
import { fetchLumaEventById } from './luma-api';
import { fetchEventbriteEventById } from './eventbrite-api';
import { toDisplayEvent, providerName, type EventProvider, type DisplayEvent } from './provider-event';
import { eventTimezone, eventPreview, registrationStatus, ticketPrice } from './event-presentation';

export default function ProviderEventScreen({ id, source }: { id: string; source: EventProvider }) {
  const colors = usePalette();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<DisplayEvent | null>(null);
  const [series, setSeries] = useState<NormalizedMeetupEvent['series']>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setEvent(null);
    setSeries(null);
    const fetchEvent = source === 'meetup' ? fetchMeetupEventById : source === 'eventbrite' ? fetchEventbriteEventById : fetchLumaEventById;
    fetchEvent(id, controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        setEvent(toDisplayEvent(value));
        setSeries(value.source === 'meetup' ? value.series : null);
      }
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, source, retry]);
  const back = () => router.canGoBack() ? router.back() : router.replace('/home');
  const preview = event ? eventPreview(event, true) : null;
  const body = { color: colors.secondary, fontSize: 16, lineHeight: 24 };
  const heading = { color: colors.text, fontSize: 20, fontWeight: '600' as const, marginBottom: 12 };
  const open = () => {
    if (event?.url) void Linking.openURL(event.url).catch(() => Alert.alert('Couldn’t open ' + providerName(source), 'Please try again.'));
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}><Text style={{ color: colors.text, fontSize: 28 }}>‹</Text></Pressable>
        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 17 }}>Event</Text>
        <Pressable disabled={!event} onPress={() => { if (event) void Share.share({ message: event.title + '\n' + (event.url ?? '') }).catch(() => {}); }} accessibilityRole="button" accessibilityLabel="Share event"><Text style={{ color: colors.text }}>Share</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator style={styles.state} accessibilityLabel="Loading event" color={colors.secondary} /> : !event || !preview ? <View style={styles.state}><Text style={heading}>Event unavailable</Text><Pressable onPress={() => setRetry((value) => value + 1)} accessibilityRole="button"><Text style={body}>Try again</Text></Pressable></View> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
          {preview.artwork ? <Image source={preview.artwork} style={styles.cover} /> : <View style={[styles.cover, styles.state, { backgroundColor: colors.surface }]}><Text style={heading}>{event.title}</Text></View>}
          <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>
          <Text style={body}>Hosted by {preview.host}</Text>
          <Text style={body}>{providerName(source)}</Text>
          <View style={styles.section}>
            <Text style={heading}>{preview.time}</Text>
            {!!event.endAt && <Text style={body}>Until {new Date(event.endAt).toLocaleString('en-US', { timeZone: eventTimezone(event), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</Text>}
            <Text style={body}>{registrationStatus(event)}</Text>
            {!!ticketPrice(event) && <Text style={body}>{ticketPrice(event)}</Text>}
            {event.tickets.isNearCapacity && <Text style={body}>Near capacity</Text>}
            {event.url && <Pressable accessibilityRole="link" onPress={open} style={[styles.primary, { backgroundColor: colors.text }]}><Text style={{ color: colors.background, fontWeight: '600', fontSize: 17 }}>View on {providerName(source)} ↗</Text></Pressable>}
          </View>
          <View style={[styles.section, { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={heading}>Location</Text>
            <Text style={body}>{preview.location}</Text>
            {event.locationType !== 'online' && <Text style={body}>{[event.location.visibility === 'public' && event.location.address !== preview.location ? event.location.address : null, event.location.city, event.location.region].filter(Boolean).join(', ')}</Text>}
          </View>
          {!!event.hosts.length && <View style={styles.section}><Text style={heading}>Hosts</Text>{event.hosts.map((host, index) => <View key={host.id || index} style={styles.host}>{host.avatarUrl && <Image source={{ uri: host.avatarUrl }} style={styles.avatar} />}<Text style={[body, { flex: 1 }]}>{host.name || host.username || 'Host'}</Text></View>)}</View>}
          {event.guestCount != null && event.guestCount > 0 && <View style={styles.section}><Text style={heading}>{event.guestCount} going</Text></View>}
          {series && <View style={styles.section}>
            <Text style={heading}>Recurring event</Text>
            {!!series.description && <Text style={body}>{series.description}</Text>}
            {series.occurrences.map(occurrence => <Text key={occurrence.id} style={body}>{new Date(occurrence.startAt).toLocaleString('en-US', { timeZone: eventTimezone(event), month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</Text>)}
          </View>}
          {!!event.description && <View style={styles.section}><Text style={heading}>About Event</Text><Text selectable style={body}>{event.description}</Text></View>}
        </ScrollView>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  header: { height: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cover: { width: '100%', aspectRatio: 1, borderRadius: 16, marginTop: 8 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8, marginTop: 24, marginBottom: 12 },
  section: { paddingTop: 24, paddingBottom: 12 },
  primary: { borderRadius: 26, alignItems: 'center', padding: 16, marginTop: 20 },
  host: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  state: { padding: 32, alignItems: 'center', justifyContent: 'center' },
});
