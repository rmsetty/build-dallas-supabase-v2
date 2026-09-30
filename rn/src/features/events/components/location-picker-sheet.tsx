import { usePalette, type Palette } from '@/hooks/use-palette';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventLocation } from '../community-api';

const PRESET_LOCATIONS: EventLocation[] = [
  {
    label: '1226 University Drive',
    area: 'Menlo Park, CA, USA',
    address: '1226 University Drive, Menlo Park, CA 94025',
    latitude: 37.4529,
    longitude: -122.1817,
  },
  {
    label: '1226 University Drive East',
    area: 'College Station, TX, USA',
    address: '1226 University Dr E, College Station, TX 77840',
    latitude: 30.6279,
    longitude: -96.3344,
  },
  {
    label: 'Deep Ellum Community Center',
    area: 'Dallas, TX, USA',
    address: '2901 Main St, Dallas, TX 75226',
    latitude: 32.7845,
    longitude: -96.7824,
  },
  {
    label: 'Downtown Arts District',
    area: 'Dallas, TX, USA',
    address: '2403 Flora St, Dallas, TX 75201',
    latitude: 32.7892,
    longitude: -96.7978,
  },
  {
    label: 'Klyde Warren Park',
    area: 'Dallas, TX, USA',
    address: '2012 Woodall Rodgers Fwy, Dallas, TX 75201',
    latitude: 32.7894,
    longitude: -96.8017,
  },
  {
    label: 'Uptown Social Hub',
    area: 'Dallas, TX, USA',
    address: '2800 Routh St, Dallas, TX 75201',
    latitude: 32.7981,
    longitude: -96.8042,
  },
];

type LocationPickerSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelectLocation: (loc: EventLocation) => void;
};

export function LocationPickerSheet({
  visible,
  onClose,
  onSelectLocation,
}: LocationPickerSheetProps) {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filteredLocations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PRESET_LOCATIONS;
    return PRESET_LOCATIONS.filter(
      (loc) =>
        loc.label.toLowerCase().includes(q) ||
        loc.area.toLowerCase().includes(q) ||
        (loc.address && loc.address.toLowerCase().includes(q)),
    );
  }, [query]);

  function handleSelect(loc: EventLocation) {
    onSelectLocation(loc);
    onClose();
  }

  function handleCustomAddress() {
    if (!query.trim()) return;
    const trimmed = query.trim();
    onSelectLocation({
      label: trimmed,
      area: 'Dallas, TX',
      address: trimmed,
      latitude: 32.7767,
      longitude: -96.7970,
    });
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.searchBar}>
            <SymbolView
              name="magnifyingglass"
              size={18}
              tintColor={colors.secondary}
              fallback={<Text style={styles.iconFallback}>🔍</Text>}
            />
            <TextInput
              autoFocus
              placeholder="Search or enter location"
              placeholderTextColor="#9ca3af"
              value={query}
              onChangeText={setQuery}
              selectionColor={colors.text}
              style={styles.searchInput}
              returnKeyType="done"
            />
            {query.length > 0 && (
              <Pressable
                onPress={() => setQuery('')}
                hitSlop={8}
                style={styles.clearBtn}
              >
                <SymbolView
                  name="xmark.circle.fill"
                  size={17}
                  tintColor={colors.secondary}
                  fallback={<Text style={styles.iconFallback}>×</Text>}
                />
              </Pressable>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <SymbolView
              name="xmark"
              size={19}
              tintColor={colors.text}
              fallback={<Text style={styles.closeText}>×</Text>}
            />
          </Pressable>
        </View>

        {/* Results List */}
        <FlatList
          data={filteredLocations}
          keyExtractor={(item, index) => `${item.label}-${index}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}
            >
              <View style={styles.pinCircle}>
                <SymbolView
                  name="mappin"
                  size={16}
                  tintColor={colors.secondary}
                  fallback={<Text style={styles.pinText}>📍</Text>}
                />
              </View>
              <View style={styles.locationDetails}>
                <Text numberOfLines={1} style={styles.locationTitle}>
                  {item.label}
                </Text>
                <Text numberOfLines={1} style={styles.locationSubtitle}>
                  {item.area}
                </Text>
              </View>
            </Pressable>
          )}
          ListFooterComponent={
            query.trim().length > 0 ? (
              <Pressable
                onPress={handleCustomAddress}
                style={({ pressed }) => [styles.locationRow, pressed && styles.pressed]}
              >
                <View style={styles.pinCircle}>
                  <SymbolView
                    name="mappin.and.ellipse"
                    size={16}
                    tintColor={colors.text}
                    fallback={<Text style={styles.pinText}>📍</Text>}
                  />
                </View>
                <View style={styles.locationDetails}>
                  <Text numberOfLines={1} style={styles.locationTitle}>
                    Use &ldquo;{query.trim()}&rdquo;
                  </Text>
                  <Text style={styles.locationSubtitle}>Custom Address</Text>
                </View>
              </Pressable>
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    searchBar: {
      flex: 1,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      height: '100%',
    },
    clearBtn: { padding: 4 },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeText: { fontSize: 20, color: colors.text },
    iconFallback: { fontSize: 16, color: colors.secondary },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    pinCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinText: { fontSize: 14 },
    locationDetails: { flex: 1, gap: 3 },
    locationTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
    },
    locationSubtitle: {
      fontSize: 13,
      color: colors.secondary,
    },
    pressed: { opacity: 0.65 },
  });
