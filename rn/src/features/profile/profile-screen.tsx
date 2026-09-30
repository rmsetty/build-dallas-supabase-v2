import { UserAvatar } from '@/components/user-avatar';
import { usePalette, type Palette } from '@/hooks/use-palette';
import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  Image,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';
import { fetchMyEvents, type CommunityEvent } from '../events/community-api';

export default function ProfileScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { currentUser, token } = useAuth();

  const [myEvents, setMyEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetchMyEvents(token);
      if (res && res.items) {
        setMyEvents(res.items);
      }
    } catch {
      // Retain existing state
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  const name = currentUser?.profile?.name || 'Your Name';
  const bio = currentUser?.profile?.bio || 'Add a bio to introduce yourself.';
  const email = currentUser?.email || '';
  const username = email ? `@${email.split('@')[0]}` : '@username';

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={goBack}
          hitSlop={12}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
        >
          <SymbolView
            name="chevron.left"
            size={20}
            tintColor={colors.text}
            fallback={<Text style={styles.btnIcon}>‹</Text>}
          />
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push('/settings')}
          hitSlop={12}
          style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
        >
          <SymbolView
            name="gearshape"
            size={19}
            tintColor={colors.text}
            fallback={<Text style={styles.btnIcon}>⚙</Text>}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 115 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Identity Section */}
        <View style={styles.identitySection}>
          <UserAvatar
            uri={currentUser?.profile?.avatar_url}
            name={name}
            size={76}
            style={styles.avatar}
          />
          <Text accessibilityRole="header" style={styles.name}>
            {name}
          </Text>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.bio}>{bio}</Text>
          {!!currentUser?.profile?.linkedin_url && <Pressable accessibilityRole="link" onPress={() => {
            void Linking.openURL(currentUser.profile.linkedin_url!).catch(() => Alert.alert('Could not open LinkedIn'));
          }}><Text style={styles.bio}>LinkedIn ↗</Text></Pressable>}
          {!!currentUser?.profile?.resume_filename && <Text style={styles.bio}>Resume: {currentUser.profile.resume_filename} · Private</Text>}

          {/* Joined date */}
          <View style={styles.joinedRow}>
            <SymbolView
              name="calendar"
              size={15}
              tintColor={colors.secondary}
              fallback={<Text style={styles.calendarFallback}>📅</Text>}
            />
            <Text style={styles.joinedText}>Joined June 2026</Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <Text style={styles.statNumber}>
              {myEvents.length} <Text style={styles.statLabel}>Hosted</Text>
            </Text>
            <Text style={styles.statNumber}>
              0 <Text style={styles.statLabel}>Attended</Text>
            </Text>
          </View>

          {/* Edit Profile Action Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit Profile"
            onPress={() => router.push('/edit-profile')}
            style={({ pressed }) => [styles.editProfileBtn, pressed && styles.pressed]}
          >
            <Text style={styles.editProfileBtnText}>Edit Profile</Text>
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Hosting Events Section */}
        {myEvents.length > 0 ? (
          <View style={styles.eventsSection}>
            <View style={styles.sectionHeadingRow}>
              <Text accessibilityRole="header" style={styles.sectionHeading}>
                Hosting
              </Text>
              <SymbolView
                name="chevron.right"
                size={14}
                tintColor={colors.secondary}
                fallback={<Text style={styles.chevronFallback}>›</Text>}
              />
            </View>

            {myEvents.map((ev) => {
              const startDate = new Date(ev.starts_at);
              const timeFormatted = `${startDate.toLocaleDateString('en-US', { weekday: 'long' })}, ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
              return (
                <Pressable
                  key={ev.id}
                  onPress={() =>
                    router.push({ pathname: '/event/[id]', params: { id: ev.id } })
                  }
                  style={({ pressed }) => [styles.eventRow, pressed && styles.pressed]}
                >
                  {ev.image_url ? (
                    <Image source={{ uri: ev.image_url }} style={styles.eventCover} />
                  ) : (
                    <View style={styles.blackCover}>
                      <Text style={styles.blackCoverText}>GUEST{'\n'}LIST</Text>
                      <View style={styles.blackCoverDot} />
                    </View>
                  )}
                  <View style={styles.eventDetails}>
                    <Text numberOfLines={2} style={styles.eventTitle}>
                      {ev.title}
                    </Text>
                    <View style={styles.eventMeta}>
                      <SymbolView
                        name="clock"
                        size={14}
                        tintColor={colors.secondary}
                        fallback={<Text>🕒</Text>}
                      />
                      <Text style={styles.eventMetaText}>{timeFormatted}</Text>
                    </View>
                    <View style={styles.eventMeta}>
                      <SymbolView
                        name="mappin"
                        size={14}
                        tintColor={colors.secondary}
                        fallback={<Text>📍</Text>}
                      />
                      <Text numberOfLines={1} style={styles.eventMetaText}>
                        {ev.location?.label || ev.location?.area || 'Dallas, TX'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : !loading ? (
          /* Empty State matching media_1789619633533.png */
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <SymbolView
                name="ticket"
                size={36}
                tintColor="#9ca3af"
                fallback={<Text style={styles.emptyFallback}>🎟</Text>}
              />
            </View>
            <Text style={styles.emptyTitle}>Nothing Here, Yet</Text>
            <Text style={styles.emptySubtitle}>
              {name.split(' ')[0]} has no public events at this time.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Persistent Bottom Tab Bar */}
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    circleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnIcon: { fontSize: 20, color: colors.text },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    identitySection: {
      alignItems: 'flex-start',
      gap: 4,
    },
    avatar: {
      width: 76,
      height: 76,
      borderRadius: 38,
      marginBottom: 10,
      backgroundColor: colors.surface,
    },
    name: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.5,
    },
    username: {
      fontSize: 15,
      color: colors.secondary,
      marginBottom: 6,
    },
    bio: {
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
      marginBottom: 10,
    },
    joinedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    joinedText: {
      fontSize: 14,
      color: colors.secondary,
    },
    calendarFallback: { fontSize: 13 },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 16,
    },
    statNumber: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    statLabel: {
      fontWeight: '400',
      color: colors.secondary,
    },
    editProfileBtn: {
      height: 38,
      paddingHorizontal: 18,
      borderRadius: 19,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    editProfileBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
      marginVertical: 24,
    },
    eventsSection: {
      gap: 16,
    },
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    sectionHeading: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    chevronFallback: { fontSize: 18, color: colors.secondary },
    eventRow: {
      flexDirection: 'row',
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 12,
      alignItems: 'center',
    },
    eventCover: {
      width: 72,
      height: 72,
      borderRadius: 12,
    },
    blackCover: {
      width: 72,
      height: 72,
      borderRadius: 12,
      backgroundColor: '#000000',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 4,
    },
    blackCoverText: {
      color: '#ffffff',
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      textAlign: 'center',
    },
    blackCoverDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#e11d48',
      marginTop: 3,
    },
    eventDetails: {
      flex: 1,
      gap: 4,
    },
    eventTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
    },
    eventMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    eventMetaText: {
      fontSize: 13,
      color: colors.secondary,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyIconCircle: {
      width: 70,
      height: 70,
      borderRadius: 35,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    emptyFallback: { fontSize: 28 },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.secondary,
      textAlign: 'center',
    },
    pressed: { opacity: 0.7 },
  });
