import { usePalette, type Palette } from '@/hooks/use-palette';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Attendance, EventPreview } from '../home-data';

const badgeColors: Record<Attendance, { color: string; backgroundColor: string }> = {
  Waitlisted: { color: '#bf8b24', backgroundColor: '#fbf2df' },
  Going: { color: '#37a844', backgroundColor: '#e7f6e4' },
  Invited: { color: '#6a36d8', backgroundColor: '#eee4ff' },
};

export function EventRow({ event, separator = true }: { event: EventPreview; separator?: boolean }) {
  const colors = usePalette();
  const styles = createStyles(colors);
  return (
    <Link href={{ pathname: '/event/[id]', params: { id: event.id } }} asChild><Pressable style={styles.row} accessible accessibilityRole="button" accessibilityLabel={`${event.title}. Hosted by ${event.host}. ${event.time}. ${event.location}.${event.attendance ? ` ${event.attendance}.` : ''}${event.price ? ` ${event.price}.` : ''}${event.nearCapacity ? ' Near capacity.' : ''}`}>
      <View style={styles.coverColumn}>
        <Link.AppleZoom>
          {event.artwork ? (
            <Image source={event.artwork} style={styles.cover} />
          ) : (
            <View style={styles.blackCover}>
              <Text style={styles.blackCoverText}>EVENT</Text>
              <View style={styles.blackCoverDot} />
            </View>
          )}
        </Link.AppleZoom>
        {event.attendance && <View style={[styles.badge, { backgroundColor: badgeColors[event.attendance].backgroundColor }]}><Text style={[styles.badgeText, { color: badgeColors[event.attendance].color }]}>{event.attendance}</Text></View>}
      </View>
      <View style={[styles.details, separator && styles.separator]}>
        <View style={styles.hostLine}>
          {event.hostAvatar ? (
            <Image source={event.hostAvatar} style={styles.hostAvatar} />
          ) : (
            <View style={[styles.hostAvatar, styles.hostAvatarPlaceholder]} />
          )}
          <Text numberOfLines={1} style={styles.host}>{event.host}</Text>
          {(event.status || event.price || event.nearCapacity) && <Text style={[styles.price, event.nearCapacity && styles.capacity]}>{event.status ?? event.price ?? 'Near Capacity'}</Text>}
        </View>
        <Text numberOfLines={2} style={styles.title}>{event.title}</Text>
        <View style={styles.metadata}>
          <SymbolView name="clock" tintColor="#bcbec0" size={15} fallback={<Text style={styles.fallback}>◷</Text>} />
          <Text style={styles.metaText}>{event.time}</Text>
        </View>
        <View style={styles.metadata}>
          <SymbolView name="mappin.circle" tintColor="#bcbec0" size={15} fallback={<Text style={styles.fallback}>⌖</Text>} />
          <Text numberOfLines={1} style={[styles.metaText, styles.location]}>{event.location}</Text>
        </View>
      </View>
    </Pressable></Link>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingTop: 16 },
  coverColumn: { width: 82, alignItems: 'center' },
  cover: { width: 82, height: 82, borderRadius: 9, backgroundColor: colors.surface },
  blackCover: { width: 82, height: 82, borderRadius: 9, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center', padding: 4 },
  blackCoverText: { color: '#ffffff', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' },
  blackCoverDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e11d48', marginTop: 4 },
  badge: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, marginTop: -10, borderWidth: 2, borderColor: colors.background },
  badgeText: { fontSize: 12, lineHeight: 15, fontWeight: '500' },
  details: { flex: 1, paddingBottom: 17, gap: 6 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  hostLine: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 17 },
  hostAvatar: { width: 15, height: 15, borderRadius: 4 },
  hostAvatarPlaceholder: { backgroundColor: '#000000' },
  host: { flex: 1, fontSize: 13, color: colors.secondary, letterSpacing: 0.1 },
  title: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '500', letterSpacing: -0.25 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 15, lineHeight: 19, color: colors.secondary },
  location: { flex: 1 },
  price: { color: '#3ea939', backgroundColor: '#f2fbef', paddingHorizontal: 5, borderRadius: 3, fontSize: 11, overflow: 'hidden' },
  capacity: { color: '#bd8a26', backgroundColor: '#fcf9ef' },
  fallback: { color: '#bcbec0', fontSize: 15 },
});
