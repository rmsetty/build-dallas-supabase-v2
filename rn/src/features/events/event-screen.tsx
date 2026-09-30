import { UserAvatar } from '@/components/user-avatar';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, type Palette } from '@/hooks/use-palette';
import { useAuth } from '../auth/auth-provider';
import {
  fetchEventById,
  type CommunityEvent,
} from './community-api';
import { dogAbout, getEvent } from './event-details';
import ProviderEventScreen from './provider-event-screen';
import { parseEventKey } from './provider-event';

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const provider = parseEventKey(id ?? '');
  return provider ? <ProviderEventScreen key={id} id={provider.id} source={provider.source} /> : <CommunityEventScreen />;
}

function CommunityEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mockEvent = getEvent(id);
  const [liveEvent, setLiveEvent] = useState<CommunityEvent | null>(null);
  const [loading, setLoading] = useState(!mockEvent);
  const { token } = useAuth();

  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    if (!mockEvent && id) {
      setLoading(true);
      fetchEventById(id, token)
        .then((data) => setLiveEvent(data))
        .catch(() => setLiveEvent(null))
        .finally(() => setLoading(false));
    }
  }, [id, mockEvent, token]);

  const coverSize = width - 40;
  const collapsed = scrollY.interpolate({
    inputRange: [coverSize - 30, coverSize + 35],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.missing]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  const event =
    mockEvent ||
    (liveEvent
      ? {
          id: liveEvent.id,
          title: liveEvent.title,
          host: liveEvent.host?.name || 'Community Host',
          artwork: liveEvent.image_url ? { uri: liveEvent.image_url } : null,
          hostAvatar: liveEvent.host?.avatar_url
            ? { uri: liveEvent.host.avatar_url }
            : undefined,
          time: `${new Date(liveEvent.starts_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${new Date(liveEvent.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          location: liveEvent.location?.label || liveEvent.location?.area || 'Dallas, TX',
          attendance: undefined,
        }
      : null);

  if (!event) {
    return (
      <View style={[styles.screen, styles.missing]}>
        <Text style={styles.title}>Event unavailable</Text>
        <Pressable onPress={goBack}>
          <Text style={styles.body}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  const isDogs = id === 'dogs' || id === 'dogs-nearby';
  const isFounders = id === 'founders';
  const share = () => {
    void Share.share({
      message: `${event.title}\n${event.time}\n${event.location}`,
    });
  };

  return (
    <View style={styles.screen}>
      {event.artwork ? (
        <Image
          source={event.artwork}
          blurRadius={70}
          style={[
            StyleSheet.absoluteFill,
            { width: '100%', height: '100%', opacity: colors.dark ? 0.35 : 0.2 },
          ]}
        />
      ) : null}
      <LinearGradient
        colors={
          colors.dark
            ? ['#64666599', '#525656b3', isDogs ? '#28453fcc' : '#414a50cc']
            : ['#f2f2efcc', '#eff1efdd', '#e3ebe7ee']
        }
        style={StyleSheet.absoluteFill}
      />
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + 112,
        }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
      >
        <View style={styles.coverFrame}>
          <Link.AppleZoomTarget>
            {event.artwork ? (
              <Image
                source={event.artwork}
                style={{ width: coverSize, height: coverSize, borderRadius: 16 }}
              />
            ) : (
              <View
                style={{
                  width: coverSize,
                  height: coverSize,
                  borderRadius: 16,
                  backgroundColor: '#000000',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                }}
              >
                <Text
                  style={{
                    color: '#ffffff',
                    fontSize: 22,
                    fontWeight: '700',
                    letterSpacing: 2,
                    textAlign: 'center',
                    lineHeight: 30,
                  }}
                >
                  YOU ARE ON THE GUEST LIST
                </Text>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: '#e11d48',
                    marginTop: 20,
                  }}
                />
              </View>
            )}
          </Link.AppleZoomTarget>
          {isFounders && (
            <View style={styles.featured}>
              <Text style={styles.featuredText}>❧  Featured in San Francisco  ❧</Text>
            </View>
          )}
        </View>

        <Reanimated.View entering={FadeIn.delay(180).duration(400)}>
          <Text accessibilityRole="header" style={styles.title}>
            {event.title}
          </Text>
          <View style={styles.hostLine}>
            {event.hostAvatar ? (
              <Image source={event.hostAvatar} style={styles.smallAvatar} />
            ) : (
              <UserAvatar name={event.host} size={16} borderRadius={4} />
            )}
            <Text numberOfLines={1} style={[styles.secondary, { flex: 1 }]}>
              {event.host}
            </Text>
            <SymbolView name="chevron.right" size={12} tintColor={colors.secondary} />
          </View>
          <Text style={[styles.secondary, styles.time]}>
            {isFounders ? 'Today, 6:00 PM - 8:30 PM GMT-7' : event.time}
          </Text>
          <View style={styles.status}>
            <SymbolView
              name={isFounders ? 'line.3.horizontal.decrease' : 'checkmark.circle'}
              size={17}
              tintColor={colors.dark ? '#c6eff8' : '#427b83'}
            />
            <Text style={styles.statusText}>
              {isFounders
                ? 'Waitlist Open'
                : event.attendance === 'Going'
                  ? "You're Going"
                  : 'Registration Open'}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => setRegistered(true)}
              disabled={registered || event.attendance === 'Going'}
              accessibilityRole="button"
              accessibilityLabel={
                registered
                  ? isFounders
                    ? 'Waitlisted'
                    : 'Registered'
                  : isFounders
                    ? 'Join Waitlist'
                    : event.attendance === 'Going'
                      ? 'Registered'
                      : 'Register'
              }
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.7 }]}
            >
              <SymbolView
                name={
                  registered || event.attendance === 'Going'
                    ? 'checkmark'
                    : isFounders
                      ? 'line.3.horizontal.decrease'
                      : 'ticket'
                }
                size={20}
                tintColor={colors.dark ? '#141414' : '#fff'}
              />
              <Text style={styles.primaryLabel}>
                {registered
                  ? isFounders
                    ? 'Waitlisted'
                    : 'Registered'
                  : isFounders
                    ? 'Join Waitlist'
                    : event.attendance === 'Going'
                      ? 'Registered'
                      : 'Register'}
              </Text>
            </Pressable>
            <Action icon="envelope.fill" label="Contact" />
            <Action icon="ellipsis" label="More" />
          </View>

          <Section title="Location">
            <Text style={styles.body}>
              {isFounders
                ? 'Register to See Location'
                : liveEvent?.location?.label || event.location}
            </Text>
            <Text style={[styles.secondary, { marginTop: 3 }]}>
              {liveEvent
                ? liveEvent.location?.address || liveEvent.location?.area || 'Dallas, TX'
                : isDogs
                  ? '11609 Santa Monica Blvd, Los Angeles, CA 90025, USA'
                  : isFounders
                    ? 'Showplace Square, San Francisco'
                    : event.location}
            </Text>
            {liveEvent?.location?.instructions ? (
              <Text style={[styles.body, { marginTop: 8, fontStyle: 'italic' }]}>
                {liveEvent.location.instructions}
              </Text>
            ) : null}
            {isDogs && (
              <Image
                source={require('../../../assets/events/goodpeople-map.png')}
                accessibilityLabel="Map preview of GoodPeople"
                style={styles.map}
              />
            )}
            {liveEvent?.location && !isDogs && (
              <Image
                source={require('../../../assets/events/goodpeople-map.png')}
                accessibilityLabel="Location map preview"
                style={styles.map}
              />
            )}
          </Section>

          <Section title="Hosts">
            {isDogs ? (
              <>
                <Host
                  name="Dogs Only Social Club"
                  source={require('../../../assets/events/dogs-host.png')}
                />
                <Host
                  name="Big Dog Energy"
                  source={require('../../../assets/events/big-dog-host.png')}
                />
              </>
            ) : (
              <Host name={event.host} source={event.hostAvatar} />
            )}
          </Section>

          {isDogs && (
            <Section title="121 Going">
              <View style={styles.attendees}>
                <Image
                  source={require('../../../assets/events/attendees.png')}
                  style={{ width: 101, height: 38, borderRadius: 19 }}
                />
                <View style={styles.morePeople}>
                  <Text style={styles.morePeopleText}>+117</Text>
                </View>
              </View>
              <Text style={styles.body}>
                sequańa wh, Ricanel Luquia, Barbara Frye, Janet Lee, and 117 more
              </Text>
            </Section>
          )}

          {isDogs && (
            <Section title="About Event">
              <Text style={[styles.body, { fontWeight: '600' }]}>{dogAbout.heading}</Text>
              {dogAbout.paragraphs.map((paragraph) => (
                <Text key={paragraph} style={[styles.body, { marginTop: 16 }]}>
                  {paragraph}
                </Text>
              ))}
            </Section>
          )}

          {liveEvent?.description ? (
            <Section title="About Event">
              <Text style={styles.body}>{liveEvent.description}</Text>
            </Section>
          ) : null}
        </Reanimated.View>
      </Animated.ScrollView>

      <View
        pointerEvents="box-none"
        style={[styles.header, { height: insets.top + 70, paddingTop: insets.top }]}
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: collapsed }]}>
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={['#000', '#000', '#00000000']}
                locations={[0, 0.8, 1]}
                style={StyleSheet.absoluteFill}
              />
            }
          >
            <BlurView
              intensity={55}
              tint={colors.dark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        </Animated.View>
        <View style={styles.headerRow}>
          <GlassView colorScheme={colors.dark ? 'dark' : 'light'} isInteractive style={styles.circle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={goBack}
              style={styles.circleButton}
            >
              <SymbolView name="chevron.left" size={21} tintColor={colors.text} />
            </Pressable>
          </GlassView>
          <Animated.Text
            numberOfLines={1}
            style={[styles.headerTitle, { opacity: collapsed }]}
          >
            {event.title}
          </Animated.Text>
          <GlassView colorScheme={colors.dark ? 'dark' : 'light'} isInteractive style={styles.circle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share event"
              onPress={share}
              style={styles.circleButton}
            >
              <SymbolView name="square.and.arrow.up" size={21} tintColor={colors.text} />
            </Pressable>
          </GlassView>
        </View>
      </View>
    </View>
  );
}

function Action({ icon, label }: { icon: SymbolViewProps['name']; label: string }) {
  const colors = usePalette();
  const styles = createStyles(colors);
  return (
    <Pressable
      disabled
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Coming in a later prototype"
      style={styles.secondaryAction}
    >
      <SymbolView name={icon} size={19} tintColor={colors.text} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const styles = createStyles(usePalette());
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionLabel}>
        {title}
      </Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function Host({
  name,
  source,
}: {
  name: string;
  source?: import('react-native').ImageSourcePropType | { uri: string };
}) {
  const colors = usePalette();
  const styles = createStyles(colors);
  return (
    <View style={styles.host}>
      {source ? (
        <Image source={source} style={styles.hostAvatar} />
      ) : (
        <UserAvatar name={name} size={37} />
      )}
      <Text style={[styles.body, { flex: 1 }]}>{name}</Text>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.dark ? '#565a59' : '#eef0ed' },
    missing: { justifyContent: 'center', alignItems: 'center' },
    coverFrame: { borderRadius: 16, overflow: 'hidden' },
    featured: {
      height: 33,
      backgroundColor: colors.dark ? '#b5b7ba' : '#d7dadd',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: -2,
    },
    featuredText: { fontSize: 12, color: '#303739', letterSpacing: 0.25 },
    title: {
      fontSize: 23,
      lineHeight: 28,
      fontWeight: '600',
      letterSpacing: -0.4,
      color: colors.text,
      marginTop: 17,
      marginBottom: 10,
    },
    hostLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    smallAvatar: { width: 16, height: 16, borderRadius: 4 },
    secondary: { fontSize: 15, lineHeight: 21, color: colors.dark ? '#c1c3c3' : '#6c7471' },
    time: { marginTop: 12 },
    status: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 7 },
    statusText: { fontSize: 15, color: colors.dark ? '#c6eff8' : '#427b83' },
    actions: { flexDirection: 'row', gap: 7, marginTop: 17 },
    primary: {
      flex: 1,
      height: 56,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: colors.dark ? '#fff' : '#1c2926',
    },
    primaryLabel: {
      color: colors.dark ? '#151515' : '#fff',
      fontSize: 12,
      fontWeight: '500',
    },
    secondaryAction: {
      flex: 1,
      height: 56,
      borderRadius: 12,
      backgroundColor: colors.dark ? '#ffffff12' : '#00000008',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    actionLabel: { color: colors.secondary, fontSize: 12 },
    section: { marginTop: 25 },
    sectionLabel: { color: colors.dark ? '#b9bcba' : '#7b817e', fontSize: 15, marginBottom: 10 },
    sectionContent: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.dark ? '#ffffff22' : '#00000015',
      paddingTop: 13,
    },
    body: { color: colors.text, fontSize: 17, lineHeight: 25 },
    map: { width: '100%', aspectRatio: 468 / 211, borderRadius: 16, marginTop: 13 },
    host: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
    hostAvatar: { width: 37, height: 37, borderRadius: 19 },
    attendees: { flexDirection: 'row', marginBottom: 8 },
    morePeople: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#88888888',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: -3,
    },
    morePeopleText: { color: colors.text, fontSize: 11 },
    header: { position: 'absolute', top: 0, left: 0, right: 0 },
    headerRow: {
      height: 52,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    circle: { width: 44, height: 44, borderRadius: 22 },
    circleButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '500' },
  });
