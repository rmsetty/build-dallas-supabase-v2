import { UserAvatar } from '@/components/user-avatar';
import { usePalette, type Palette } from '@/hooks/use-palette';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';

export default function SettingsScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { currentUser, signOut } = useAuth();

  const name = currentUser?.profile?.name || 'Your Name';

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try { await signOut(); }
          catch { Alert.alert('Could not sign out', 'Check your connection and try again.'); }
          // Stack.Protected guard automatically handles switching to unauthenticated index
        },
      },
    ]);
  }

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

        <Text accessibilityRole="header" style={styles.headerTitle}>
          Settings
        </Text>

        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.card}>
          <Pressable
            onPress={() => router.push('/profile')}
            style={({ pressed }) => [styles.profileRow, pressed && styles.pressed]}
          >
            <UserAvatar
              uri={currentUser?.profile?.avatar_url}
              name={name}
              size={48}
              style={styles.profileAvatar}
            />
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{name}</Text>
              <Text style={styles.profileSubtitle}>View Profile</Text>
            </View>
            <SymbolView
              name="chevron.right"
              size={15}
              tintColor={colors.secondary}
              fallback={<Text style={styles.chevronFallback}>›</Text>}
            />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => router.push('/edit-profile')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <Text style={styles.menuLabel}>Edit Profile</Text>
            <SymbolView
              name="chevron.right"
              size={15}
              tintColor={colors.secondary}
              fallback={<Text style={styles.chevronFallback}>›</Text>}
            />
          </Pressable>
        </View>

        {/* Account & Payment Card */}
        <View style={styles.card}>
          <Pressable
            onPress={() => Alert.alert('Account Settings', 'Manage your email and security in Appwrite.')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#6b7280' }]}>
                <SymbolView name="person.fill" size={16} tintColor="#ffffff" fallback={<Text>👤</Text>} />
              </View>
              <Text style={styles.menuLabel}>Account Settings</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor={colors.secondary} fallback={<Text style={styles.chevronFallback}>›</Text>} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => Alert.alert('Payment', 'Ticketing and payment methods coming soon.')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#6366f1' }]}>
                <SymbolView name="creditcard" size={16} tintColor="#ffffff" fallback={<Text>💳</Text>} />
              </View>
              <Text style={styles.menuLabel}>Payment</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor={colors.secondary} fallback={<Text style={styles.chevronFallback}>›</Text>} />
          </Pressable>
        </View>

        {/* Preferences Section */}
        <Text style={styles.sectionHeader}>Preferences</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => Alert.alert('Notifications', 'Notification settings coming soon.')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#ef4444' }]}>
                <SymbolView name="bell.fill" size={16} tintColor="#ffffff" fallback={<Text>🔔</Text>} />
              </View>
              <Text style={styles.menuLabel}>Notifications</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor={colors.secondary} fallback={<Text style={styles.chevronFallback}>›</Text>} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => Alert.alert('Permissions', 'Location and media permissions.')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#22c55e' }]}>
                <SymbolView name="checkmark.shield.fill" size={16} tintColor="#ffffff" fallback={<Text>🛡</Text>} />
              </View>
              <Text style={styles.menuLabel}>Permissions</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor={colors.secondary} fallback={<Text style={styles.chevronFallback}>›</Text>} />
          </Pressable>

          <View style={styles.divider} />

          <View style={styles.menuRow}>
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#ec4899' }]}>
                <SymbolView name="paintpalette.fill" size={16} tintColor="#ffffff" fallback={<Text>🎨</Text>} />
              </View>
              <Text style={styles.menuLabel}>Appearance</Text>
            </View>
            <Text style={styles.appearanceText}>
              {colors.dark ? 'Dark Mode' : 'Light Mode'}
            </Text>
          </View>
        </View>

        {/* Resources Section */}
        <Text style={styles.sectionHeader}>Resources</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => Alert.alert('Contact Support', 'support@builddallas.com')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#3b82f6' }]}>
                <SymbolView name="envelope.fill" size={16} tintColor="#ffffff" fallback={<Text>✉</Text>} />
              </View>
              <Text style={styles.menuLabel}>Contact Support</Text>
            </View>
            <SymbolView name="chevron.right" size={15} tintColor={colors.secondary} fallback={<Text style={styles.chevronFallback}>›</Text>} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => Alert.alert('Rate App', 'Thank you for your feedback!')}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#eab308' }]}>
                <SymbolView name="star.fill" size={16} tintColor="#ffffff" fallback={<Text>⭐</Text>} />
              </View>
              <Text style={styles.menuLabel}>Rate in App Store</Text>
            </View>
            <SymbolView name="arrow.up.right" size={14} tintColor={colors.secondary} fallback={<Text>↗</Text>} />
          </Pressable>
        </View>

        {/* Sign Out Card */}
        <View style={styles.card}>
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
          >
            <View style={styles.menuLeft}>
              <View style={[styles.iconBox, { backgroundColor: '#dc2626' }]}>
                <SymbolView name="rectangle.portrait.and.arrow.right" size={16} tintColor="#ffffff" fallback={<Text>🚪</Text>} />
              </View>
              <Text style={[styles.menuLabel, { color: '#dc2626' }]}>Sign Out</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    content: {
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 16,
      overflow: 'hidden',
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      gap: 14,
    },
    profileAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.background,
    },
    profileInfo: {
      flex: 1,
      gap: 2,
    },
    profileName: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    profileSubtitle: {
      fontSize: 13,
      color: colors.secondary,
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 15,
    },
    menuLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconBox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuLabel: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    appearanceText: {
      fontSize: 14,
      color: colors.secondary,
      fontWeight: '500',
    },
    chevronFallback: { fontSize: 18, color: colors.secondary },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.secondary,
      marginLeft: 4,
      marginTop: 4,
    },
    pressed: { opacity: 0.7 },
  });
