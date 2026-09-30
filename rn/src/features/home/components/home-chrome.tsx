import { UserAvatar } from '@/components/user-avatar';
import { usePalette, type Palette } from '@/hooks/use-palette';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { GlassView } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/auth-provider';

export function HomeHeader({ scrollY, date, onSearchPress }: { scrollY: Animated.Value; date: string; onSearchPress?: () => void }) {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const opacity = scrollY.interpolate({ inputRange: [0, 35], outputRange: [0, 1], extrapolate: 'clamp' });
  return (
    <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top, height: insets.top + 82 }]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
        <MaskedView style={StyleSheet.absoluteFill} maskElement={<LinearGradient colors={['#000', '#000', '#00000000']} locations={[0, 0.68, 1]} style={StyleSheet.absoluteFill} />}>
          <BlurView intensity={35} tint={colors.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glass }]} />
        </MaskedView>
      </Animated.View>
      <View style={styles.headerRow}>
        <View style={styles.identity}>
          <UserAvatar
            uri={currentUser?.profile?.avatar_url}
            name={currentUser?.profile?.name}
            size={43}
            onPress={() => router.push('/profile')}
            accessibilityLabel="View profile"
          />
          <View>
            <Text style={styles.brand}>build dallas<Text style={styles.spark}>✦</Text></Text>
            {date !== '' && <Text style={styles.currentDate}>{date}</Text>}
          </View>
        </View>
        <GlassView colorScheme={colors.dark ? 'dark' : 'light'} glassEffectStyle="regular" style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Create event" onPress={() => router.push('/create-event')} style={styles.action}>
            <SymbolView name="plus" size={24} weight="regular" tintColor={colors.text} fallback={<Text style={styles.iconFallback}>+</Text>} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Search events" onPress={onSearchPress} style={styles.action}>
            <SymbolView name="magnifyingglass" size={22} tintColor={colors.text} fallback={<Text style={styles.iconFallback}>⌕</Text>} />
          </Pressable>
        </GlassView>
      </View>
    </View>
  );
}

export function HomeTabBar({ onHomePress, onDiscoverPress, active }: { onHomePress: () => void; onDiscoverPress: () => void; active: 'home' | 'discover' }) {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <LinearGradient pointerEvents="none" colors={[colors.transparent, colors.fade]} style={StyleSheet.absoluteFill} />
      <GlassView colorScheme={colors.dark ? 'dark' : 'light'} glassEffectStyle="regular" style={styles.tabs}>
        <Pressable accessibilityRole="tab" accessibilityLabel="Home" accessibilityState={{ selected: active === 'home' }} onPress={onHomePress} style={[styles.tab, active === 'home' && styles.selected]}>
          <SymbolView name="house.fill" size={24} tintColor={colors.text} fallback={<Text>⌂</Text>} />
          <Text style={[styles.tabText, active === 'home' && styles.selectedText]}>Home</Text>
        </Pressable>
        <Pressable accessibilityRole="tab" accessibilityLabel="Discover" accessibilityState={{ selected: active === 'discover' }} onPress={onDiscoverPress} style={[styles.tab, active === 'discover' && styles.selected]}>
          <SymbolView name="safari.fill" size={23} tintColor={active === 'discover' ? colors.text : '#999'} fallback={<Text>◈</Text>} />
          <Text style={[styles.tabText, active === 'discover' && styles.selectedText]}>Discover</Text>
        </Pressable>
        <Pressable disabled accessibilityRole="tab" accessibilityLabel="Chat" accessibilityHint="Coming in a later prototype" style={styles.tab}>
          <SymbolView name="message.fill" size={23} tintColor="#999" fallback={<Text>◌</Text>} />
          <Text style={styles.tabText}>Chat</Text>
        </Pressable>
      </GlassView>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  headerRow: { height: 59, marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatar: { width: 43, height: 43, borderRadius: 22 },
  brand: { fontSize: 23, fontWeight: '700', letterSpacing: -1.3, color: colors.text },
  spark: { fontSize: 13 },
  currentDate: { fontSize: 11, color: colors.secondary, marginTop: 2 },
  actions: { flexDirection: 'row', borderRadius: 26, height: 44, paddingHorizontal: 4, backgroundColor: colors.glass, boxShadow: '0 7px 24px rgba(0,0,0,0.045)' },
  action: { width: 41, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconFallback: { fontSize: 28, color: colors.text },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 22 },
  tabs: { width: 282, height: 64, flexDirection: 'row', padding: 4, borderRadius: 35, backgroundColor: colors.glass, boxShadow: '0 4px 30px rgba(0,0,0,0.08)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 30 },
  selected: { backgroundColor: colors.selected },
  tabText: { fontSize: 10, fontWeight: '500', color: colors.muted, letterSpacing: 0.15 },
  selectedText: { color: colors.text },
});
