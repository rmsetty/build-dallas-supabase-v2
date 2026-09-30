import { usePalette, type Palette } from '@/hooks/use-palette';
import { SymbolView } from 'expo-symbols';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CommunityEvent } from '../community-api';

type EventCreatedModalProps = {
  visible: boolean;
  event: CommunityEvent | null;
  onViewEvent: () => void;
  onClose: () => void;
};

export function EventCreatedModal({
  visible,
  event,
  onViewEvent,
  onClose,
}: EventCreatedModalProps) {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();

  if (!event) return null;

  // Format date nicely: e.g. "2 Jul 2026 at 8:00 PM GMT-7"
  const startDate = new Date(event.starts_at);
  const formattedTime = `${startDate.getDate()} ${startDate.toLocaleString('en-US', { month: 'short' })} ${startDate.getFullYear()} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.grabber} />
        <View style={styles.topBar}>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <SymbolView name="xmark" size={18} tintColor={colors.text} fallback={<Text style={styles.btnText}>×</Text>} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Big Green Success Badge */}
          <View style={styles.successCircle}>
            <SymbolView name="checkmark" size={36} weight="bold" tintColor="#ffffff" fallback={<Text style={styles.checkText}>✓</Text>} />
          </View>

          <Text style={styles.subtitle}>Event Created!</Text>
          <Text accessibilityRole="header" style={styles.title}>
            {event.title}
          </Text>

          {/* Details */}
          <View style={styles.metaContainer}>
            <View style={styles.metaRow}>
              <SymbolView name="clock" size={16} tintColor={colors.secondary} fallback={<Text style={styles.iconFallback}>🕒</Text>} />
              <Text style={styles.metaText}>{formattedTime}</Text>
            </View>
            <View style={styles.metaRow}>
              <SymbolView name="mappin" size={16} tintColor={colors.secondary} fallback={<Text style={styles.iconFallback}>📍</Text>} />
              <Text style={styles.metaText}>
                {event.location?.label || 'Dallas, TX'}
              </Text>
            </View>
          </View>

          {/* Map Snapshot */}
          <View style={styles.mapFrame}>
            <Image
              source={require('../../../../assets/events/goodpeople-map.png')}
              style={styles.mapImage}
            />
            <View style={styles.mapPin}>
              <SymbolView name="mappin.circle.fill" size={28} tintColor="#e11d48" fallback={<Text>📍</Text>} />
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <Pressable
              accessibilityRole="button"
              onPress={onViewEvent}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.primaryBtnText}>View Event Page</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.secondaryBtn, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryBtnText}>Invite Guests</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    grabber: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginTop: 9,
    },
    topBar: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    closeBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnText: { fontSize: 20, color: colors.text },
    content: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    successCircle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: '#22c55e',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      shadowColor: '#22c55e',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
    },
    checkText: { fontSize: 32, color: '#ffffff', fontWeight: 'bold' },
    subtitle: {
      fontSize: 15,
      color: colors.secondary,
      marginTop: 18,
      fontWeight: '500',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginTop: 6,
      letterSpacing: -0.5,
    },
    metaContainer: {
      marginTop: 24,
      width: '100%',
      gap: 10,
      paddingHorizontal: 4,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    metaText: {
      fontSize: 15,
      color: colors.secondary,
      fontWeight: '500',
    },
    iconFallback: { fontSize: 14 },
    mapFrame: {
      width: '100%',
      height: 140,
      borderRadius: 16,
      overflow: 'hidden',
      marginTop: 18,
      position: 'relative',
      backgroundColor: colors.surface,
    },
    mapImage: {
      width: '100%',
      height: '100%',
      opacity: 0.9,
    },
    mapPin: {
      position: 'absolute',
      top: '40%',
      left: '48%',
    },
    actionButtons: {
      width: '100%',
      marginTop: 36,
      gap: 12,
    },
    primaryBtn: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      color: colors.background,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryBtn: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '500',
    },
    pressed: { opacity: 0.7 },
  });
