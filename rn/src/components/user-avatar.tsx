import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type UserAvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  showEditBadge?: boolean;
  onPress?: () => void;
  onEditPress?: () => void;
  accessibilityLabel?: string;
};

export function UserAvatar({
  uri,
  name,
  size = 40,
  borderRadius,
  style,
  imageStyle,
  showEditBadge = false,
  onPress,
  onEditPress,
  accessibilityLabel,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const radius = borderRadius ?? Math.round(size / 2);
  const initial = name?.trim() ? name.trim().charAt(0).toUpperCase() : '';

  const hasValidUri = Boolean(uri && uri.trim().length > 0 && !imageError);

  const avatarContent = (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
        style,
      ]}
    >
      {hasValidUri ? (
        <Image
          source={{ uri: uri! }}
          onError={() => setImageError(true)}
          style={[
            styles.image,
            {
              width: size,
              height: size,
              borderRadius: radius,
            },
            imageStyle,
          ]}
        />
      ) : (
        /* Black placeholder image/circle per design specification */
        <View
          style={[
            styles.blackPlaceholder,
            {
              width: size,
              height: size,
              borderRadius: radius,
            },
            imageStyle,
          ]}
        >
          {initial ? (
            <Text
              style={[
                styles.initialText,
                {
                  fontSize: Math.max(10, Math.round(size * 0.42)),
                  lineHeight: Math.max(12, Math.round(size * 0.48)),
                },
              ]}
            >
              {initial}
            </Text>
          ) : (
            <SymbolView
              name="person.fill"
              size={Math.max(12, Math.round(size * 0.46))}
              tintColor="#ffffff"
              fallback={<Text style={{ color: '#ffffff', fontSize: size * 0.4 }}>👤</Text>}
            />
          )}
        </View>
      )}

      {showEditBadge && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          onPress={onEditPress ?? onPress}
          style={[
            styles.editBadge,
            {
              width: Math.max(26, Math.round(size * 0.34)),
              height: Math.max(26, Math.round(size * 0.34)),
              borderRadius: Math.max(13, Math.round((size * 0.34) / 2)),
            },
          ]}
        >
          <SymbolView
            name="photo.badge.plus"
            size={Math.max(12, Math.round(size * 0.18))}
            tintColor="#ffffff"
            fallback={<Text style={styles.badgeFallback}>📷</Text>}
          />
        </Pressable>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || (name ? `${name}'s avatar` : 'User avatar')}
        onPress={onPress}
      >
        {avatarContent}
      </Pressable>
    );
  }

  return avatarContent;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'visible',
  },
  image: {
    backgroundColor: '#000000',
  },
  blackPlaceholder: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initialText: {
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#1c1c1e',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeFallback: {
    fontSize: 10,
    color: '#ffffff',
  },
});
