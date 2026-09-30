import { usePalette, type Palette } from '@/hooks/use-palette';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
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
import { useAuth } from './auth-provider';

type Step = 'email' | 'code' | 'profile';

export default function EmailSignInScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { requestOTP, verifyOTP, saveProfile } = useAuth();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const canContinueEmail = email.trim().length > 0 && email.includes('@');
  const canContinueCode = code.length === 6;
  const canCompleteProfile = name.trim().length > 0;

  async function handleSendEmail() {
    if (!canContinueEmail || loading) return;
    Keyboard.dismiss();
    setLoading(true);
    setErrorMessage('');
    try {
      const challenge = await requestOTP(email.trim());
      setUserId(challenge.user_id);
      setStep('code');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not send verification code';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!canContinueCode || loading) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const authSession = await verifyOTP(userId, code);
      if (!authSession.user.profile.onboarding_complete && !authSession.user.profile.name) {
        setStep('profile');
      }
      // If profile is already complete, the Stack.Protected guard automatically switches to (app)/home.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code. Please try again.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!canCompleteProfile || loading) return;
    setLoading(true);
    setErrorMessage('');
    try {
      await saveProfile({ name: name.trim(), bio: bio.trim() });
      // Updating profile sets isAuthenticated = true, so Stack.Protected guard automatically switches to (app)/home.
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyPress(digit: string) {
    if (code.length < 6) {
      setCode((prev) => prev + digit);
    }
  }

  function handleDeleteKey() {
    setCode((prev) => prev.slice(0, -1));
  }

  function handleClose() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      keyboardVerticalOffset={insets.top}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.grabber} />

      {/* Top Bar */}
      <View style={styles.toolbar}>
        {step === 'code' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to email"
            onPress={() => {
              setCode('');
              setErrorMessage('');
              setStep('email');
            }}
            hitSlop={12}
            style={({ pressed }) => [styles.navCircle, pressed && styles.pressed]}
          >
            <SymbolView
              name="chevron.left"
              size={20}
              tintColor={colors.text}
              fallback={<Text style={styles.navText}>‹</Text>}
            />
          </Pressable>
        ) : step === 'profile' ? (
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {step === 'profile' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Save profile"
            disabled={!canCompleteProfile || loading}
            onPress={handleSaveProfile}
            hitSlop={12}
            style={({ pressed }) => [
              styles.navCircle,
              canCompleteProfile && styles.navCircleActive,
              pressed && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <SymbolView
                name="checkmark"
                size={19}
                tintColor={canCompleteProfile ? colors.text : colors.muted}
                fallback={<Text style={styles.navText}>✓</Text>}
              />
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={handleClose}
            hitSlop={12}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <SymbolView
              name="xmark"
              size={18}
              tintColor={colors.text}
              fallback={<Text style={styles.closeText}>×</Text>}
            />
          </Pressable>
        )}
      </View>

      {/* STEP 1: Enter Email */}
      {step === 'email' && (
        <>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.icon}>
              <SymbolView
                name="envelope"
                size={31}
                tintColor="#969696"
                weight="regular"
                fallback={<Text style={styles.closeText}>✉</Text>}
              />
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              Continue with Email
            </Text>
            <Text style={styles.subtitle}>Sign in or sign up with your email.</Text>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <TextInput
              accessibilityLabel="Email address"
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="done"
              enablesReturnKeyAutomatically
              placeholder="Email Address"
              placeholderTextColor="#b5b5b7"
              selectionColor={colors.text}
              keyboardAppearance={colors.dark ? 'dark' : 'light'}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrorMessage('');
              }}
              onSubmitEditing={handleSendEmail}
              style={styles.input}
            />
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canContinueEmail || loading }}
              disabled={!canContinueEmail || loading}
              onPress={handleSendEmail}
              style={({ pressed }) => [
                styles.next,
                (!canContinueEmail || loading) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.nextText}>Next</Text>
              )}
            </Pressable>
          </View>
        </>
      )}

      {/* STEP 2: Enter Verification Code */}
      {step === 'code' && (
        <View style={styles.codeContainer}>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <View style={styles.icon}>
              <SymbolView
                name="bubble.left.and.bubble.right"
                size={28}
                tintColor="#969696"
                weight="regular"
                fallback={<Text style={styles.closeText}>💬</Text>}
              />
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              Enter Verification Code
            </Text>
            <Text style={styles.subtitle}>
              We sent a verification code to your email{'\n'}
              <Text style={styles.emailHighlight}>{email}</Text>.
            </Text>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {/* 6-Dash Code Display */}
            <View style={styles.dashesContainer}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <View key={index} style={styles.dashSlot}>
                  <Text style={styles.dashText}>
                    {code[index] ? code[index] : '—'}
                  </Text>
                </View>
              ))}
            </View>

            {/* Action Button */}
            <View style={styles.codeButtonRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canContinueCode || loading }}
                disabled={!canContinueCode || loading}
                onPress={handleVerifyCode}
                style={({ pressed }) => [
                  styles.next,
                  (!canContinueCode || loading) && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={styles.nextText}>Next</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>

          {/* Numeric Keypad */}
          <View style={[styles.keypad, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.keypadRow}>
              <KeypadButton label="1" letters="" onPress={() => handleKeyPress('1')} />
              <KeypadButton label="2" letters="ABC" onPress={() => handleKeyPress('2')} />
              <KeypadButton label="3" letters="DEF" onPress={() => handleKeyPress('3')} />
            </View>
            <View style={styles.keypadRow}>
              <KeypadButton label="4" letters="GHI" onPress={() => handleKeyPress('4')} />
              <KeypadButton label="5" letters="JKL" onPress={() => handleKeyPress('5')} />
              <KeypadButton label="6" letters="MNO" onPress={() => handleKeyPress('6')} />
            </View>
            <View style={styles.keypadRow}>
              <KeypadButton label="7" letters="PQRS" onPress={() => handleKeyPress('7')} />
              <KeypadButton label="8" letters="TUV" onPress={() => handleKeyPress('8')} />
              <KeypadButton label="9" letters="WXYZ" onPress={() => handleKeyPress('9')} />
            </View>
            <View style={styles.keypadRow}>
              <View style={styles.keypadEmpty} />
              <KeypadButton label="0" letters="" onPress={() => handleKeyPress('0')} />
              <Pressable
                accessibilityLabel="Backspace"
                onPress={handleDeleteKey}
                style={({ pressed }) => [styles.keypadButton, pressed && styles.keypadPressed]}
              >
                <SymbolView
                  name="delete.left"
                  size={22}
                  tintColor={colors.text}
                  fallback={<Text style={styles.keypadDigit}>⌫</Text>}
                />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* STEP 3: Complete Your Profile */}
      {step === 'profile' && (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, 24) + 20 },
          ]}
        >
          {/* Avatar with cute face */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>😃</Text>
            </View>
            <View style={styles.avatarBadge}>
              <SymbolView
                name="photo.badge.plus"
                size={14}
                tintColor="#333"
                fallback={<Text style={{ fontSize: 11 }}>📷</Text>}
              />
            </View>
          </View>

          <Text accessibilityRole="header" style={styles.title}>
            Complete Your Profile
          </Text>
          <Text style={styles.subtitle}>Introduce yourself to others in your events.</Text>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {/* Form Fields */}
          <View style={styles.formContainer}>
            <Text style={styles.fieldLabel}>Your Name</Text>
            <TextInput
              accessibilityLabel="Your Name"
              placeholder="Your Name"
              placeholderTextColor="#b5b5b7"
              autoFocus
              selectionColor={colors.text}
              keyboardAppearance={colors.dark ? 'dark' : 'light'}
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrorMessage('');
              }}
              style={styles.input}
            />

            <Text style={[styles.fieldLabel, { marginTop: 22 }]}>Bio</Text>
            <TextInput
              accessibilityLabel="Bio"
              placeholder="Share a little about your background and interests."
              placeholderTextColor="#b5b5b7"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              selectionColor={colors.text}
              keyboardAppearance={colors.dark ? 'dark' : 'light'}
              value={bio}
              onChangeText={setBio}
              style={styles.bioInput}
            />
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function KeypadButton({
  label,
  letters,
  onPress,
}: {
  label: string;
  letters: string;
  onPress: () => void;
}) {
  const colors = usePalette();
  const styles = createStyles(colors);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.keypadButton, pressed && styles.keypadPressed]}
    >
      <Text style={styles.keypadDigit}>{label}</Text>
      {letters ? <Text style={styles.keypadLetters}>{letters}</Text> : null}
    </Pressable>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    grabber: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.line,
      alignSelf: 'center',
      marginTop: 9,
    },
    toolbar: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    navCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navCircleActive: {
      backgroundColor: colors.dark ? '#3a3e42' : '#e4e6ea',
    },
    navText: { fontSize: 20, color: colors.text },
    close: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeText: { fontSize: 22, color: colors.secondary },
    content: {
      paddingHorizontal: 24,
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 24,
    },
    icon: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 23,
      fontWeight: '600',
      letterSpacing: -0.5,
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: 8,
      fontSize: 15,
      color: colors.secondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    emailHighlight: {
      fontWeight: '600',
      color: colors.text,
    },
    errorText: {
      color: '#e53935',
      fontSize: 14,
      marginTop: 12,
      textAlign: 'center',
    },
    input: {
      marginTop: 24,
      width: '100%',
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.surface,
      paddingHorizontal: 18,
      fontSize: 16,
      color: colors.text,
    },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    next: {
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.text,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    disabled: {
      backgroundColor: colors.dark ? '#46484a' : '#d1d1d3',
    },
    nextText: {
      color: colors.background,
      fontSize: 17,
      fontWeight: '600',
    },
    pressed: { opacity: 0.65 },

    // Code Verification styles
    codeContainer: {
      flex: 1,
      justifyContent: 'space-between',
    },
    dashesContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 28,
      backgroundColor: colors.surface,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 24,
      width: '100%',
    },
    dashSlot: {
      width: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dashText: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: 2,
    },
    codeButtonRow: {
      width: '100%',
      marginTop: 28,
    },
    keypad: {
      paddingHorizontal: 18,
      paddingTop: 8,
      backgroundColor: colors.dark ? '#1c1e20' : '#ececee',
      gap: 8,
    },
    keypadRow: {
      flexDirection: 'row',
      gap: 8,
    },
    keypadButton: {
      flex: 1,
      height: 48,
      backgroundColor: colors.dark ? '#2e3134' : '#ffffff',
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 1,
      elevation: 1,
    },
    keypadPressed: {
      backgroundColor: colors.dark ? '#42464a' : '#d8d8dc',
    },
    keypadEmpty: {
      flex: 1,
      height: 48,
    },
    keypadDigit: {
      fontSize: 22,
      fontWeight: '500',
      color: colors.text,
    },
    keypadLetters: {
      fontSize: 9,
      fontWeight: '600',
      color: colors.secondary,
      letterSpacing: 1.2,
      marginTop: -2,
    },

    // Profile Completion styles
    avatarContainer: {
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 16,
    },
    avatarCircle: {
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: '#f58231',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    avatarEmoji: {
      fontSize: 40,
    },
    avatarBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#f0ebe1',
      borderWidth: 2,
      borderColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formContainer: {
      width: '100%',
      marginTop: 24,
    },
    fieldLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.secondary,
      marginLeft: 4,
    },
    bioInput: {
      marginTop: 8,
      width: '100%',
      minHeight: 110,
      borderRadius: 18,
      backgroundColor: colors.surface,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 14,
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
    },
  });
