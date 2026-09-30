import { usePalette, type Palette } from '@/hooks/use-palette';
import { ApiError } from '@/lib/api-client';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/auth-provider';
import { fetchBootstrap } from '../discover/bootstrap-api';
import { clearInterests, MAX_ABOUT_LENGTH, MAX_INTEREST_LENGTH, MAX_INTERESTS, mergeInterests, normalizeInterest, saveInterests } from './interests-api';
import { useResumeImport } from './resume-parser/use-resume-import';

const STARTERS = ['AI/ML', 'Startups', 'Fintech', 'Web development', 'Mobile', 'Design', 'Product management', 'Data science',
  'Cybersecurity', 'Hardware', 'Climate tech', 'Healthtech', 'Web3', 'Venture capital', 'Networking', 'Career fairs'];

export default function InterestsScreen() {
  const colors = usePalette();
  const styles = createStyles(colors);
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const resume = useResumeImport();
  const [interests, setInterests] = useState<string[]>([]);
  const [about, setAbout] = useState('');
  const [draft, setDraft] = useState('');
  const [hasSaved, setHasSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const edited = useRef(false);
  const busy = saving || resume.importing;
  const canSave = !busy && !loading && (interests.length > 0 || !!draft.trim());
  const suggestions = STARTERS.filter(item => !interests.some(value => value.toLowerCase() === item.toLowerCase()));

  useEffect(() => {
    let active = true;
    fetchBootstrap(token).then(data => {
      if (!active || !data.interests) return;
      setHasSaved(true);
      if (edited.current) return;
      setInterests(data.interests.interests);
      setAbout(data.interests.about || '');
    }).catch(() => { /* Start empty; saving still works. */ }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function update(next: string[]) { edited.current = true; setInterests(next); setError(''); setNotice(''); }

  function addDraft() {
    const value = normalizeInterest(draft);
    if (!value) return;
    if (value.length > MAX_INTEREST_LENGTH) { setError(`Keep each interest under ${MAX_INTEREST_LENGTH} characters.`); return; }
    if (interests.length >= MAX_INTERESTS) { setError(`You can save up to ${MAX_INTERESTS} interests.`); return; }
    update(mergeInterests(interests, [value])); setDraft('');
  }

  async function handleImport() {
    if (busy) return;
    setError(''); setNotice('');
    try {
      const chips = await resume.importResume();
      if (!chips) return;
      const next = mergeInterests(interests, chips);
      const added = next.length - interests.length;
      update(next);
      setNotice(added ? `Added ${added} from your resume. Remove any that don’t fit, then save.`
        : chips.length ? 'Nothing new found in your resume.' : 'We couldn’t find interests in that resume. Add a few below instead.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read that resume.');
    }
  }

  async function handleSave() {
    if (!token || !canSave) return;
    const list = draft.trim() ? mergeInterests(interests, [draft]) : interests;
    if (!list.length) return;
    Keyboard.dismiss(); setSaving(true); setError('');
    try {
      await saveInterests(token, { interests: list, about: about.trim() });
      close();
    } catch (err) {
      setError(describe(err, 'Couldn’t save your interests. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    if (!token || busy) return;
    Alert.alert('Clear your interests?', 'Home will go back to showing all upcoming events.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        setSaving(true); setError('');
        try { await clearInterests(token); close(); }
        catch (err) { setError(describe(err, 'Couldn’t clear your interests. Please try again.')); }
        finally { setSaving(false); }
      } },
    ]);
  }

  function close() {
    Keyboard.dismiss();
    if (router.canGoBack()) router.back();
    else router.replace('/home');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={12} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}>
          <SymbolView name="xmark" size={16} tintColor={colors.text} fallback={<Text style={styles.icon}>×</Text>} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>Your Interests</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Save interests" disabled={!canSave} onPress={handleSave} hitSlop={12}
          style={({ pressed }) => [styles.circleButton, canSave && styles.circleButtonActive, pressed && styles.pressed]}>
          {saving ? <ActivityIndicator size="small" color={colors.text} />
            : <SymbolView name="checkmark" size={18} tintColor={canSave ? (colors.dark ? '#000000' : '#ffffff') : colors.secondary} fallback={<Text style={styles.icon}>✓</Text>} />}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <Text style={styles.lead}>Tell us what you’re into and Home will rank Dallas events for you.</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={handleImport} style={({ pressed }) => [styles.card, styles.importCard, pressed && styles.pressed]}>
          <SymbolView name="doc.text.magnifyingglass" size={22} tintColor={colors.text} fallback={<Text style={styles.icon}>▤</Text>} />
          <View style={styles.flex}>
            <Text style={styles.importTitle}>{resume.importing ? 'Reading your resume…' : 'Import from resume'}</Text>
            <Text style={styles.caption}>Parsed on your phone — your resume isn’t uploaded. Only the interests you save are sent.</Text>
          </View>
          {resume.importing ? <ActivityIndicator color={colors.secondary} /> : <SymbolView name="chevron.right" size={14} tintColor={colors.muted} fallback={<Text style={styles.caption}>›</Text>} />}
        </Pressable>
        {!!notice && <Text style={styles.notice}>{notice}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.sectionHeader}>Your interests · {interests.length}/{MAX_INTERESTS}</Text>
        <View style={[styles.card, styles.cardBody]}>
          {loading ? <ActivityIndicator color={colors.secondary} /> : interests.length ? <View style={styles.chips}>
            {interests.map(item => <View key={item.toLowerCase()} style={[styles.chip, styles.chipSelected]}>
              <Text style={styles.chipText}>{item}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item}`} hitSlop={10} onPress={() => update(interests.filter(value => value !== item))}>
                <Text style={styles.chipRemove}>×</Text>
              </Pressable>
            </View>)}
          </View> : <Text style={styles.caption}>No interests yet. Import your resume or pick a few suggestions below.</Text>}
          <View style={styles.addRow}>
            <TextInput accessibilityLabel="Add an interest" value={draft} onChangeText={setDraft} onSubmitEditing={addDraft} submitBehavior="submit"
              placeholder="Add an interest" placeholderTextColor={colors.muted} maxLength={MAX_INTEREST_LENGTH} returnKeyType="done"
              autoCorrect={false} selectionColor={colors.text} style={styles.addInput} />
            <Pressable accessibilityRole="button" disabled={!draft.trim()} onPress={addDraft} hitSlop={8}>
              <Text style={[styles.addText, !draft.trim() && { color: colors.muted }]}>Add</Text>
            </Pressable>
          </View>
        </View>

        {suggestions.length > 0 && interests.length < MAX_INTERESTS && <>
          <Text style={styles.sectionHeader}>Suggestions</Text>
          <View style={styles.chips}>
            {suggestions.map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Add ${item}`} onPress={() => update(mergeInterests(interests, [item]))}
              style={({ pressed }) => [styles.chip, styles.chipSuggestion, pressed && styles.pressed]}>
              <Text style={styles.chipText}>+ {item}</Text>
            </Pressable>)}
          </View>
        </>}

        <Text style={styles.sectionHeader}>What are you looking for?</Text>
        <View style={styles.card}>
          <TextInput accessibilityLabel="What are you looking for?" multiline value={about} onChangeText={value => { edited.current = true; setAbout(value); }}
            maxLength={MAX_ABOUT_LENGTH} placeholder="Optional — e.g. meeting founders, a summer internship, learning Rust" placeholderTextColor={colors.muted}
            selectionColor={colors.text} textAlignVertical="top" style={styles.aboutInput} />
          <Text style={styles.counter}>{about.length}/{MAX_ABOUT_LENGTH}</Text>
        </View>

        {hasSaved && <Pressable accessibilityRole="button" disabled={busy} onPress={handleClear} style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <Text style={styles.clearText}>Clear my interests</Text>
        </Pressable>}
      </ScrollView>
      {resume.element}
    </KeyboardAvoidingView>
  );
}

function describe(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 429) return error.detail || 'You’re saving too often. Please wait a moment and try again.';
  if (error instanceof ApiError && error.status === 422) return `Keep it to ${MAX_INTERESTS} interests of up to ${MAX_INTEREST_LENGTH} characters each.`;
  return fallback;
}

const createStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 },
  circleButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  circleButtonActive: { backgroundColor: colors.dark ? '#ffffff' : '#000000' },
  icon: { fontSize: 20, color: colors.text },
  headerTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 16 },
  lead: { fontSize: 15, lineHeight: 21, color: colors.secondary },
  flex: { flex: 1, gap: 3 },
  card: { backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  cardBody: { paddingVertical: 14, gap: 12 },
  importCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  importTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  caption: { fontSize: 13, lineHeight: 18, color: colors.secondary },
  notice: { fontSize: 14, lineHeight: 20, color: colors.text, textAlign: 'center' },
  error: { fontSize: 14, lineHeight: 20, color: '#e53935', textAlign: 'center' },
  sectionHeader: { fontSize: 14, fontWeight: '600', color: colors.secondary, marginLeft: 4, marginTop: 4, marginBottom: -6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  chipSelected: { backgroundColor: colors.background },
  chipSuggestion: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.muted },
  chipText: { fontSize: 14, color: colors.text },
  chipRemove: { fontSize: 17, lineHeight: 18, color: colors.secondary },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 },
  addInput: { flex: 1, height: 36, fontSize: 16, color: colors.text },
  addText: { fontSize: 16, fontWeight: '600', color: colors.text },
  aboutInput: { minHeight: 90, paddingVertical: 12, fontSize: 16, lineHeight: 22, color: colors.text },
  counter: { fontSize: 12, color: colors.muted, textAlign: 'right', paddingBottom: 8 },
  clear: { alignItems: 'center', paddingVertical: 12 },
  clearText: { fontSize: 16, color: '#e53935' },
  pressed: { opacity: 0.65 },
});
