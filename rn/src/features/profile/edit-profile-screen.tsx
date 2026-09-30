import { UserAvatar } from '@/components/user-avatar';
import { usePalette, type Palette } from '@/hooks/use-palette';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';

export default function EditProfileScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { currentUser, saveProfile, uploadAvatar, deleteAvatar, uploadResume, deleteResume } = useAuth();

  const currentFullName = currentUser?.profile?.name || '';
  const nameParts = currentFullName.split(' ');
  const initialFirstName = nameParts[0] || '';
  const initialLastName = nameParts.slice(1).join(' ') || '';

  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [bio, setBio] = useState(currentUser?.profile?.bio || '');

  const [linkedin, setLinkedin] = useState(currentUser?.profile?.linkedin_url || '');
  const [resumeLoading, setResumeLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canSave = (firstName.trim().length > 0 || lastName.trim().length > 0) && !loading && !avatarLoading && !resumeLoading;

  async function handlePickAvatar() {
    if (loading || resumeLoading || avatarLoading) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Needed',
          'Please allow photo library access to upload a profile picture.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setAvatarLoading(true);
        setErrorMessage('');
        await uploadAvatar(
          asset.uri,
          asset.fileName || 'avatar.jpg',
          asset.mimeType || 'image/jpeg',
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to upload photo';
      setErrorMessage(msg);
    } finally {
      setAvatarLoading(false);
    }
  }

  function handleAvatarAction() {
    if (loading || resumeLoading || avatarLoading) return;
    if (currentUser?.profile?.avatar_url) {
      Alert.alert('Profile Photo', 'Choose an option', [
        { text: 'Choose New Photo', onPress: handlePickAvatar },
        {
          text: 'Remove Photo',
          style: 'destructive',
          onPress: async () => {
            setAvatarLoading(true);
            try {
              await deleteAvatar();
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to remove photo';
              setErrorMessage(msg);
            } finally {
              setAvatarLoading(false);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    } else {
      handlePickAvatar();
    }
  }

  async function handleSave() {
    if (!canSave) return;
    Keyboard.dismiss();
    setLoading(true);
    setErrorMessage('');

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    try {
      await saveProfile({
        name: fullName,
        bio: bio.trim(),
        linkedin_url: linkedin.trim() || null,
      });
      if (router.canGoBack()) router.back();
      else router.replace('/profile');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleResume() {
    if (resumeLoading || loading || avatarLoading) return;
    setErrorMessage('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf', multiple: false, copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset.size !== undefined && asset.size > 5_000_000) {
        setErrorMessage('Resume must be 5 MB or smaller.');
        return;
      }
      setResumeLoading(true);
      await uploadResume(asset.uri, asset.name);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not upload resume.');
    } finally {
      setResumeLoading(false);
    }
  }

  async function handleRemoveResume() {
    setResumeLoading(true);
    setErrorMessage('');
    try {
      await deleteResume();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not remove resume.');
    } finally {
      setResumeLoading(false);
    }
  }

  function handleBack() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
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
          Edit Profile
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save profile"
          disabled={!canSave}
          onPress={handleSave}
          hitSlop={12}
          style={({ pressed }) => [
            styles.circleButton,
            canSave && styles.circleButtonActive,
            pressed && styles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <SymbolView
              name="checkmark"
              size={18}
              tintColor={canSave ? (colors.dark ? '#000000' : '#ffffff') : colors.secondary}
              fallback={<Text style={styles.btnIcon}>✓</Text>}
            />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        {/* Avatar with edit badge */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrapper}>
            <UserAvatar
              uri={currentUser?.profile?.avatar_url}
              name={currentFullName}
              size={88}
              showEditBadge
              onPress={handleAvatarAction}
              onEditPress={handleAvatarAction}
            />
            {avatarLoading && (
              <View style={styles.avatarLoadingOverlay}>
                <ActivityIndicator size="small" color="#ffffff" />
              </View>
            )}
          </View>
        </View>

        {/* Names Card */}
        <View style={styles.card}>
          <View style={styles.inputRow}>
            <Text style={styles.rowLabel}>First Name</Text>
            <TextInput
              placeholder="First Name"
              placeholderTextColor="#8e8e93"
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                setErrorMessage('');
              }}
              selectionColor={colors.text}
              style={styles.rowInput}
              returnKeyType="next"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.inputRow}>
            <Text style={styles.rowLabel}>Last Name</Text>
            <TextInput
              placeholder="Last Name"
              placeholderTextColor="#8e8e93"
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                setErrorMessage('');
              }}
              selectionColor={colors.text}
              style={styles.rowInput}
              returnKeyType="done"
            />
          </View>
        </View>

        {/* Bio Section */}
        <Text style={styles.sectionHeader}>Bio</Text>
        <View style={styles.card}>
          <TextInput
            multiline
            placeholder="Share a little about your background and interests"
            placeholderTextColor="#8e8e93"
            value={bio}
            onChangeText={setBio}
            selectionColor={colors.text}
            style={styles.bioInput}
            textAlignVertical="top"
          />
        </View>

        <Text style={styles.sectionHeader}>LinkedIn</Text>
        <View style={styles.card}>
          <TextInput
            accessibilityLabel="LinkedIn profile URL"
            placeholder="https://www.linkedin.com/in/your-name"
            placeholderTextColor={colors.muted}
            value={linkedin}
            onChangeText={setLinkedin}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.bioInput, { minHeight: 52 }]}
          />
        </View>
        <Text style={styles.sectionHeader}>Resume</Text>
        <View style={[styles.card, { paddingVertical: 16, gap: 12 }]}>
          <Text style={{ color: colors.text }}>{currentUser?.profile?.resume_filename || 'No resume uploaded'}</Text>
          <Text style={{ color: colors.secondary, fontSize: 13 }}>Private PDF · Up to 5 MB · Uploads save immediately</Text>
          {resumeLoading ? <ActivityIndicator color={colors.text} /> : <>
            <Pressable disabled={loading || avatarLoading} accessibilityRole="button" onPress={handleResume}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{currentUser?.profile?.resume_file_id ? 'Replace resume' : 'Upload resume'}</Text>
            </Pressable>
            {!!currentUser?.profile?.resume_file_id && <Pressable disabled={loading || avatarLoading} accessibilityRole="button" onPress={handleRemoveResume}>
              <Text style={{ color: colors.secondary }}>Remove resume</Text>
            </Pressable>}
          </>}
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
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
    circleButtonActive: {
      backgroundColor: colors.dark ? '#ffffff' : '#000000',
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
    errorText: {
      color: '#e53935',
      fontSize: 14,
      textAlign: 'center',
    },
    avatarSection: {
      alignItems: 'center',
      marginVertical: 10,
    },
    avatarWrapper: {
      position: 'relative',
    },
    avatarLoadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.surface,
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 50,
    },
    rowLabel: {
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    rowInput: {
      flex: 1,
      textAlign: 'right',
      fontSize: 16,
      color: colors.text,
      marginLeft: 16,
    },
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
    bioInput: {
      minHeight: 90,
      paddingVertical: 12,
      fontSize: 16,
      lineHeight: 22,
      color: colors.text,
    },
    socialRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 52,
    },
    socialLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    socialIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    socialLabel: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    socialInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      flex: 1,
      marginLeft: 12,
    },
    socialPrefix: {
      fontSize: 15,
      color: colors.secondary,
    },
    socialInput: {
      fontSize: 15,
      color: colors.text,
      textAlign: 'right',
      minWidth: 80,
    },
    footerCaption: {
      fontSize: 13,
      color: colors.secondary,
      textAlign: 'center',
      marginTop: 8,
      marginBottom: 20,
    },
    pressed: { opacity: 0.65 },
  });
