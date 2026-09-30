import { UserAvatar } from '@/components/user-avatar';
import { usePalette, type Palette } from '@/hooks/use-palette';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';
import {
  postEvent,
  type CommunityEvent,
  type EventCreateInput,
  type EventLocation,
} from './community-api';
import { EventCreatedModal } from './components/event-created-modal';
import { EventDescriptionModal } from './components/event-description-modal';
import { LocationPickerSheet } from './components/location-picker-sheet';

export default function CreateEventScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { token, currentUser } = useAuth();

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState<EventLocation | null>(null);
  const [instructions, setInstructions] = useState('');
  const [hideExactLocation, setHideExactLocation] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'unlisted' | 'private'>('public');
  const [capacity, setCapacity] = useState<number | null>(null);

  // Modals
  const [locationPickerVisible, setLocationPickerVisible] = useState(false);
  const [descriptionModalVisible, setDescriptionModalVisible] = useState(false);
  const [createdEvent, setCreatedEvent] = useState<CommunityEvent | null>(null);

  // Async submission state
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Default event date times: today + 2 hours for 1 hour duration
  const [startDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
  });
  const [endDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 3, 0, 0, 0);
    return d;
  });

  const canSubmit = title.trim().length > 0 && !loading;

  const formattedStart = `${startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  const formattedEnd = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  async function handleSubmit() {
    if (!canSubmit || !token) return;
    Keyboard.dismiss();
    setLoading(true);
    setErrorMessage('');

    try {
      const payload: EventCreateInput = {
        title: title.trim(),
        description: description.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        timezone: 'America/Chicago',
        location: location
          ? {
              ...location,
              instructions: instructions.trim() || undefined,
            }
          : null,
        image_url: null, // Defaults to solid black background #000000 in backend
        hide_exact_location: hideExactLocation,
        require_approval: requireApproval,
        visibility,
        capacity,
        price_cents: 0,
        currency: 'USD',
      };

      const newEvent = await postEvent(token, payload);
      setCreatedEvent(newEvent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create event';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  function handleViewCreatedEvent() {
    if (createdEvent) {
      const id = createdEvent.id;
      setCreatedEvent(null);
      router.replace({ pathname: '/event/[id]', params: { id } });
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <View style={styles.hostGroup}>
          <UserAvatar
            uri={currentUser?.profile?.avatar_url}
            name={currentUser?.profile?.name}
            size={34}
            style={styles.avatar}
          />
          <SymbolView
            name="chevron.down"
            size={12}
            tintColor={colors.secondary}
            fallback={<Text style={styles.arrowText}>⌄</Text>}
          />
        </View>

        <Text accessibilityRole="header" style={styles.headerTitle}>
          Create Event
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Submit event"
          disabled={!canSubmit}
          onPress={handleSubmit}
          hitSlop={12}
          style={({ pressed }) => [
            styles.submitButton,
            canSubmit && styles.submitButtonActive,
            pressed && styles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <SymbolView
              name="checkmark"
              size={18}
              tintColor={canSubmit ? '#ffffff' : colors.secondary}
              fallback={<Text style={styles.checkText}>✓</Text>}
            />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 24) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Error banner if any */}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {/* Square Cover Artwork (defaults to black #000000 background) */}
        <View style={styles.artworkContainer}>
          <View style={styles.artwork}>
            <Text style={styles.artworkText}>YOU ARE ON THE GUEST LIST</Text>
            <View style={styles.artBottomRow}>
              <View style={styles.liveDot} />
              <View style={styles.cameraBadge}>
                <SymbolView
                  name="photo.badge.plus"
                  size={15}
                  tintColor="#ffffff"
                  fallback={<Text style={styles.badgeFallback}>📷</Text>}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Event Name Input */}
        <View style={styles.nameInputWrapper}>
          <TextInput
            placeholder="Event Name"
            placeholderTextColor="#8a8d91"
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setErrorMessage('');
            }}
            selectionColor={colors.text}
            style={styles.nameInput}
            returnKeyType="done"
          />
        </View>

        {/* Date & Time Selector Card */}
        <View style={styles.card}>
          <View style={styles.timeRow}>
            <View style={styles.timelineCol}>
              <View style={styles.timelineStartDot} />
              <View style={styles.timelineLine} />
              <View style={styles.timelineEndCircle} />
            </View>
            <View style={styles.timelineDetails}>
              <View style={styles.timeItem}>
                <Text style={styles.timeLabel}>Start</Text>
                <Text style={styles.timeValue}>{formattedStart}</Text>
              </View>
              <View style={styles.timeItemDivider} />
              <View style={styles.timeItem}>
                <Text style={styles.timeLabel}>End</Text>
                <Text style={styles.timeValue}>{formattedEnd}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Location Section */}
        {location ? (
          <View style={styles.card}>
            <Pressable
              onPress={() => setLocationPickerVisible(true)}
              style={styles.locationHeaderRow}
            >
              <View style={styles.locationTitleCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <SymbolView name="mappin" size={15} tintColor={colors.secondary} fallback={<Text>📍</Text>} />
                  <Text style={styles.locationLabel}>{location.label}</Text>
                </View>
                <Text style={styles.locationArea}>{location.area}</Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor={colors.secondary} fallback={<Text>›</Text>} />
            </Pressable>

            {/* Further instructions */}
            <TextInput
              placeholder="+ Add Further Instructions..."
              placeholderTextColor="#8a8d91"
              value={instructions}
              onChangeText={setInstructions}
              style={styles.instructionsInput}
            />

            {/* Map Preview Snapshot */}
            <View style={styles.mapSnapshot}>
              <Image
                source={require('../../../assets/events/goodpeople-map.png')}
                style={styles.mapImage}
              />
              <View style={styles.mapPin}>
                <SymbolView name="mappin.circle.fill" size={24} tintColor="#e11d48" fallback={<Text>📍</Text>} />
              </View>
            </View>

            {/* Privacy switch */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>
                Only show exact location to{'\n'}approved guests
              </Text>
              <Switch
                value={hideExactLocation}
                onValueChange={setHideExactLocation}
                trackColor={{ false: '#4b5563', true: '#22c55e' }}
              />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setLocationPickerVisible(true)}
            style={({ pressed }) => [styles.pillButton, pressed && styles.pressed]}
          >
            <SymbolView
              name="mappin"
              size={17}
              tintColor={colors.secondary}
              fallback={<Text style={styles.pillIcon}>📍</Text>}
            />
            <Text style={styles.pillText}>Choose Location</Text>
          </Pressable>
        )}

        {/* Description Section */}
        {description.trim().length > 0 ? (
          <Pressable
            onPress={() => setDescriptionModalVisible(true)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.descRow}>
              <SymbolView name="doc.text" size={16} tintColor={colors.secondary} fallback={<Text>📄</Text>} />
              <View style={{ flex: 1 }}>
                <Text style={styles.descTitle}>Description</Text>
                <Text numberOfLines={2} style={styles.descSnippet}>
                  {description}
                </Text>
              </View>
            </View>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => setDescriptionModalVisible(true)}
            style={({ pressed }) => [styles.pillButton, pressed && styles.pressed]}
          >
            <SymbolView
              name="doc.text"
              size={17}
              tintColor={colors.secondary}
              fallback={<Text style={styles.pillIcon}>📄</Text>}
            />
            <Text style={styles.pillText}>Add Description</Text>
          </Pressable>
        )}

        {/* Ticketing Section */}
        <Text style={styles.sectionHeader}>Ticketing</Text>
        <View style={styles.card}>
          <View style={styles.optionRow}>
            <View style={styles.optionIconLabel}>
              <SymbolView name="lock" size={16} tintColor={colors.secondary} fallback={<Text>🔒</Text>} />
              <Text style={styles.optionLabel}>Require Approval</Text>
            </View>
            <Switch
              value={requireApproval}
              onValueChange={setRequireApproval}
              trackColor={{ false: '#4b5563', true: '#22c55e' }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.optionRow}>
            <View style={styles.optionIconLabel}>
              <SymbolView name="dollarsign" size={16} tintColor={colors.secondary} fallback={<Text>$</Text>} />
              <Text style={styles.optionLabel}>Price</Text>
            </View>
            <Text style={styles.optionValue}>Free ›</Text>
          </View>
        </View>

        {/* Options Section */}
        <Text style={styles.sectionHeader}>Options</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() =>
              setVisibility((prev) =>
                prev === 'public' ? 'unlisted' : prev === 'unlisted' ? 'private' : 'public',
              )
            }
            style={styles.optionRow}
          >
            <View style={styles.optionIconLabel}>
              <SymbolView name="globe" size={16} tintColor={colors.secondary} fallback={<Text>🌐</Text>} />
              <Text style={styles.optionLabel}>Visibility</Text>
            </View>
            <Text style={styles.optionValue}>
              {visibility.charAt(0).toUpperCase() + visibility.slice(1)} ⌃⌄
            </Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            onPress={() => setCapacity((prev) => (prev === null ? 50 : null))}
            style={styles.optionRow}
          >
            <View style={styles.optionIconLabel}>
              <SymbolView name="person.2" size={16} tintColor={colors.secondary} fallback={<Text>👥</Text>} />
              <Text style={styles.optionLabel}>Capacity</Text>
            </View>
            <Text style={styles.optionValue}>
              {capacity ? `${capacity} ⌃⌄` : 'Unlimited ⌃⌄'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sub-modals */}
      <LocationPickerSheet
        visible={locationPickerVisible}
        onClose={() => setLocationPickerVisible(false)}
        onSelectLocation={setLocation}
      />

      <EventDescriptionModal
        visible={descriptionModalVisible}
        initialDescription={description}
        onClose={() => setDescriptionModalVisible(false)}
        onSave={setDescription}
      />

      <EventCreatedModal
        visible={Boolean(createdEvent)}
        event={createdEvent}
        onViewEvent={handleViewCreatedEvent}
        onClose={() => {
          setCreatedEvent(null);
          handleClose();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.dark ? '#18191b' : '#f4f5f7' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    hostGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
    },
    arrowText: { fontSize: 13, color: colors.secondary },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    submitButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonActive: {
      backgroundColor: '#2563eb',
    },
    checkText: { fontSize: 18, color: '#ffffff', fontWeight: 'bold' },
    content: {
      paddingHorizontal: 20,
      paddingTop: 16,
      gap: 16,
    },
    errorText: {
      color: '#e53935',
      fontSize: 14,
      textAlign: 'center',
    },
    artworkContainer: {
      alignItems: 'center',
      marginTop: 4,
    },
    artwork: {
      width: 240,
      height: 240,
      borderRadius: 20,
      backgroundColor: '#000000',
      padding: 20,
      justifyContent: 'space-between',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    artworkText: {
      color: '#ffffff',
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 1.5,
      textAlign: 'center',
      marginTop: 30,
      lineHeight: 26,
    },
    artBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    liveDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#e11d48',
    },
    cameraBadge: {
      position: 'absolute',
      right: 0,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeFallback: { fontSize: 13 },
    nameInputWrapper: {
      width: '100%',
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      paddingHorizontal: 20,
      marginTop: 8,
      borderWidth: 1.5,
      borderColor: '#2563eb',
    },
    nameInput: {
      fontSize: 17,
      color: colors.text,
      height: '100%',
    },
    card: {
      width: '100%',
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      gap: 12,
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    timelineCol: {
      alignItems: 'center',
      width: 14,
      height: 48,
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    timelineStartDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.secondary,
    },
    timelineLine: {
      width: 1.5,
      flex: 1,
      backgroundColor: colors.line,
      marginVertical: 3,
    },
    timelineEndCircle: {
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.secondary,
    },
    timelineDetails: {
      flex: 1,
      gap: 8,
    },
    timeItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    timeItemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
    },
    timeLabel: {
      fontSize: 15,
      color: colors.secondary,
    },
    timeValue: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    pillButton: {
      width: '100%',
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      gap: 12,
    },
    pillIcon: { fontSize: 16 },
    pillText: {
      fontSize: 16,
      color: colors.secondary,
      fontWeight: '500',
    },
    locationHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    locationTitleCol: { gap: 2 },
    locationLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    locationArea: {
      fontSize: 13,
      color: colors.secondary,
      marginLeft: 21,
    },
    instructionsInput: {
      fontSize: 14,
      color: colors.text,
      paddingVertical: 4,
    },
    mapSnapshot: {
      width: '100%',
      height: 110,
      borderRadius: 14,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#e5e7eb',
    },
    mapImage: {
      width: '100%',
      height: '100%',
    },
    mapPin: {
      position: 'absolute',
      top: '35%',
      left: '46%',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
    },
    switchLabel: {
      fontSize: 13,
      color: colors.secondary,
      lineHeight: 18,
    },
    descRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    descTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.secondary,
    },
    descSnippet: {
      fontSize: 15,
      color: colors.text,
      marginTop: 2,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.secondary,
      marginLeft: 4,
      marginTop: 6,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    optionIconLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    optionLabel: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
    },
    optionValue: {
      fontSize: 15,
      color: colors.secondary,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.line,
    },
    pressed: { opacity: 0.65 },
  });
