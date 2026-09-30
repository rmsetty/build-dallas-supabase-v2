import { usePalette, type Palette } from '@/hooks/use-palette';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, runOnJS, useAnimatedReaction, useAnimatedStyle, useFrameCallback, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const albums = [
  { video: require('../../../assets/albums/dark-lane.mp4'), poster: require('../../../assets/albums/dark-lane.jpg') },
  { video: require('../../../assets/albums/lover-boy.mp4'), poster: require('../../../assets/albums/lover-boy.jpg') },
  { video: require('../../../assets/albums/take-care.mp4'), poster: require('../../../assets/albums/take-care.jpg') },
  { video: require('../../../assets/albums/lonerism.mp4'), poster: require('../../../assets/albums/lonerism.jpg') },
  { video: require('../../../assets/albums/currents.mp4'), poster: require('../../../assets/albums/currents.jpg') },
  { video: require('../../../assets/albums/playboi.mp4'), poster: require('../../../assets/albums/playboi.jpg') },
  { video: require('../../../assets/albums/some-sexy-songs.mp4'), poster: require('../../../assets/albums/some-sexy-songs.jpg') },
];

function Album({ index, size, playing, position, translation }: { index: number; size: number; playing: boolean; position: number; translation: SharedValue<number> }) {
  const styles = createStyles(usePalette());
  const { width } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  useAnimatedReaction(() => {
    const x = position + translation.value;
    return x + size > -30 && x < width + 30;
  }, (next, previous) => { if (next !== previous) runOnJS(setVisible)(next); });
  const album = albums[index];
  const player = useVideoPlayer(album.video, (video) => {
    video.loop = true;
    video.muted = true;
    video.audioMixingMode = 'mixWithOthers';
  });
  useEffect(() => { if (playing && visible) player.play(); else player.pause(); }, [player, playing, visible]);
  return (
    <View style={[styles.album, { width: size, height: size }]}>
      <View style={styles.artwork}>
        <Image source={album.poster} style={StyleSheet.absoluteFill} />
        {playing && visible && <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} surfaceType="textureView" />}
      </View>
    </View>
  );
}

function AlbumRow({ indices, size, direction, offset, active, reduceMotion }: {
  indices: number[]; size: number; direction: -1 | 1; offset: number; active: boolean; reduceMotion: boolean;
}) {
  const styles = createStyles(usePalette());
  const distance = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const translation = useSharedValue(-indices.length * (size + 22) + offset);
  const stride = size + 22;
  const span = indices.length * stride;
  // Integrating the exponential gives a continuous fast-to-slow entrance, with no handoff jerk.
  useFrameCallback(({ timeSincePreviousFrame }) => {
    if (!active || reduceMotion) return;
    const dt = Math.min(timeSincePreviousFrame ?? 0, 40) / 1000;
    elapsed.value += dt;
    distance.value = 17 * elapsed.value + 390 * (1 - Math.exp(-elapsed.value / 0.72));
    translation.value = -span + ((direction * distance.value + offset) % span);
  });
  const motion = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value }],
  }));
  return (
    <Animated.View style={[styles.row, { width: span * 3 }, motion]}>
      {[0, 1, 2].flatMap((copy) => indices.map((index, slot) => (
        <Album key={`${copy}-${index}`} index={index} size={size} position={(copy * indices.length + slot) * stride} translation={translation} playing={active && !reduceMotion} />
      )))}
    </Animated.View>
  );
}

export default function IntroScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const pressed = useSharedValue(1);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    const state = AppState.addEventListener('change', (next) => setActive(next === 'active'));
    return () => { motion.remove(); state.remove(); };
  }, []);
  const scale = Math.min(width / 402, (height - insets.top - insets.bottom) / 750, 1.2);
  const buttonMotion = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));
  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={[styles.atmosphere, { height: height * 0.65 }]}>
        <LinearGradient colors={colors.dark ? ['#482a40', '#443b32', '#23464c'] : ['#ffd7e8', '#ffead1', '#bcf1f5']} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={[colors.transparent, colors.background]} locations={[0, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.gallery, { paddingTop: insets.top + 26 * scale, gap: 22 * scale }]}>
        <AlbumRow indices={[0, 1, 4]} size={140 * scale} direction={-1} offset={70} active={active} reduceMotion={reduceMotion} />
        <AlbumRow indices={[3, 2, 6]} size={157 * scale} direction={1} offset={-25} active={active} reduceMotion={reduceMotion} />
        <AlbumRow indices={[5, 4, 0]} size={135 * scale} direction={-1} offset={130} active={active} reduceMotion={reduceMotion} />
      </View>
      <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(850).delay(350)} style={[styles.welcome, { paddingBottom: insets.bottom + 20 * scale }]}>
        <Text style={[styles.brand, { fontSize: 23 * scale }]}>build dallas<Text style={styles.spark}>✦</Text></Text>
        <Text accessibilityRole="header" style={[styles.headline, { fontSize: 40 * scale, lineHeight: 43 * scale }]}>Delightful{'\n'}events</Text>
        <MaskedView style={{ height: 49 * scale, width: '100%' }} maskElement={<Text style={[styles.gradientText, { fontSize: 40 * scale, lineHeight: 47 * scale }]}>start here</Text>}>
          <LinearGradient colors={['#cc3db1', '#f53e73', '#f5ae25']} start={{ x: 0.18, y: 0 }} end={{ x: 0.82, y: 1 }} style={styles.fill} />
        </MaskedView>
        <Animated.View style={[buttonMotion, { marginTop: 26 * scale }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Get started" accessibilityHint="Continue with email" onPress={() => router.push('/sign-in')} onPressIn={() => { pressed.value = withSpring(0.9); }} onPressOut={() => { pressed.value = withSpring(1); }} hitSlop={12}>
            <LinearGradient colors={['#d931b6', '#ff4672', '#ffb52b']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={[styles.button, { width: 54 * scale, height: 54 * scale }]}>
              <SymbolView name="arrow.down" size={29 * scale} tintColor="white" weight="medium" fallback={<Text style={styles.arrow}>↓</Text>} />
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  atmosphere: { position: 'absolute', top: 0, left: 0, right: 0 },
  gallery: { flex: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 22 },
  album: { padding: 7, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 11, borderWidth: 1, borderColor: '#ffffff', boxShadow: '0 12px 25px rgba(34, 25, 40, 0.10)' },
  artwork: { flex: 1, overflow: 'hidden', borderRadius: 5, backgroundColor: '#f0eded' },
  welcome: { alignItems: 'center', paddingTop: 15, backgroundColor: colors.background },
  brand: { color: '#c5c4c6', fontWeight: '700', letterSpacing: -1.2, marginBottom: 14 },
  spark: { fontSize: 16 },
  headline: { color: colors.text, textAlign: 'center', fontWeight: '600', letterSpacing: -1.5 },
  gradientText: { textAlign: 'center', fontWeight: '600', letterSpacing: -1.5 },
  fill: { flex: 1 },
  button: { borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#fff', fontSize: 30 },
});
