import { usePalette, type Palette } from '@/hooks/use-palette';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type EventDescriptionModalProps = {
  visible: boolean;
  initialDescription: string;
  onClose: () => void;
  onSave: (description: string) => void;
};

export function EventDescriptionModal({
  visible,
  initialDescription,
  onClose,
  onSave,
}: EventDescriptionModalProps) {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const [description, setDescription] = useState(initialDescription);

  function handleSaveAndClose() {
    onSave(description);
    onClose();
  }

  function insertFormatting(prefix: string, suffix: string = '') {
    setDescription((prev) => `${prev}${prev.length && !prev.endsWith('\n') ? '\n' : ''}${prefix}${suffix}`);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleSaveAndClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
          <Pressable
            accessibilityLabel="Back"
            onPress={handleSaveAndClose}
            hitSlop={12}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          >
            <SymbolView
              name="chevron.left"
              size={20}
              tintColor={colors.text}
              fallback={<Text style={styles.headerIcon}>‹</Text>}
            />
          </Pressable>

          <Text accessibilityRole="header" style={styles.headerTitle}>
            Event Description
          </Text>

          <Pressable
            accessibilityLabel="Done"
            onPress={handleSaveAndClose}
            hitSlop={12}
            style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
          >
            <SymbolView
              name="sparkles"
              size={18}
              tintColor={colors.text}
              fallback={<Text style={styles.headerIcon}>✦</Text>}
            />
          </Pressable>
        </View>

        {/* Text Area */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.editorContent}
        >
          <View style={styles.textContainer}>
            <TextInput
              autoFocus
              multiline
              placeholder="Start typing..."
              placeholderTextColor="#71767b"
              value={description}
              onChangeText={setDescription}
              selectionColor={colors.text}
              style={styles.textInput}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Formatting Toolbar */}
        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Pressable onPress={() => insertFormatting('# ')} style={styles.toolBtn}>
            <Text style={styles.toolTextBold}>H1</Text>
          </Pressable>
          <Pressable onPress={() => insertFormatting('## ')} style={styles.toolBtn}>
            <Text style={styles.toolTextBold}>H2</Text>
          </Pressable>
          <Pressable onPress={() => insertFormatting('**bold**')} style={styles.toolBtn}>
            <Text style={[styles.toolTextBold, { fontWeight: '700' }]}>B</Text>
          </Pressable>
          <Pressable onPress={() => insertFormatting('*italic*')} style={styles.toolBtn}>
            <Text style={[styles.toolTextBold, { fontStyle: 'italic' }]}>I</Text>
          </Pressable>
          <Pressable onPress={() => insertFormatting('[link](https://)')} style={styles.toolBtn}>
            <SymbolView name="link" size={17} tintColor={colors.text} fallback={<Text style={styles.toolFallback}>🔗</Text>} />
          </Pressable>
          <Pressable onPress={() => insertFormatting('• ')} style={styles.toolBtn}>
            <SymbolView name="list.bullet" size={17} tintColor={colors.text} fallback={<Text style={styles.toolFallback}>•</Text>} />
          </Pressable>
          <Pressable onPress={() => insertFormatting('1. ')} style={styles.toolBtn}>
            <SymbolView name="list.number" size={17} tintColor={colors.text} fallback={<Text style={styles.toolFallback}>1.</Text>} />
          </Pressable>
          <Pressable onPress={() => insertFormatting('> ')} style={styles.toolBtn}>
            <SymbolView name="quote.opening" size={17} tintColor={colors.text} fallback={<Text style={styles.toolFallback}>&ldquo;</Text>} />
          </Pressable>
          <Pressable onPress={Keyboard.dismiss} style={styles.toolBtn}>
            <SymbolView name="keyboard.chevron.compact.down" size={17} tintColor={colors.text} fallback={<Text style={styles.toolFallback}>⌨</Text>} />
          </Pressable>
        </View>
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
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    circleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    headerIcon: { fontSize: 18, color: colors.text },
    editorContent: {
      flexGrow: 1,
      padding: 16,
    },
    textContainer: {
      flex: 1,
      minHeight: 350,
      backgroundColor: colors.dark ? '#1c2024' : '#f0f3f6',
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: '#3b82f6',
      padding: 16,
    },
    textInput: {
      flex: 1,
      fontSize: 16,
      lineHeight: 24,
      color: colors.text,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: 8,
      paddingTop: 8,
      backgroundColor: colors.dark ? '#1a1b1e' : '#f8f9fa',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    toolBtn: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolTextBold: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    toolFallback: {
      fontSize: 15,
      color: colors.text,
    },
    pressed: { opacity: 0.6 },
  });
