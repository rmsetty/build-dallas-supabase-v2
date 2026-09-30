import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { createElement, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { toChips, type ResumeKeywords } from './extract-keywords';
import ResumeParser from './resume-parser.dom';

const MAX_BYTES = 5_000_000;
const CHUNK_CHARS = 256 * 1024; // A multiple of 4, so each base64 chunk decodes on its own.
const TIMEOUT_MS = 60_000;
const TOO_LARGE = 'Resume must be 5 MB or smaller.';

type Job = { id: number; chunks: string[]; resolve: (chips: string[]) => void; reject: (error: Error) => void };

// Parses a resume PDF on the device in a hidden DOM component. The file is never uploaded;
// the caller only receives interest keywords. Render `element` while `importing`.
export function useResumeImport() {
  const [importing, setImporting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const busy = useRef(false);

  async function importResume(): Promise<string[] | null> {
    if (busy.current) return null;
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: false, copyToCacheDirectory: true });
    if (picked.canceled) return null;
    const asset = picked.assets[0];
    if (asset.size !== undefined && asset.size > MAX_BYTES) { discard(asset); throw new Error(TOO_LARGE); }
    busy.current = true;
    setImporting(true);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const base64 = await readBase64(asset);
      if (base64.length > Math.ceil(MAX_BYTES / 3) * 4) throw new Error(TOO_LARGE);
      const chunks: string[] = [];
      for (let start = 0; start < base64.length; start += CHUNK_CHARS) chunks.push(base64.slice(start, start + CHUNK_CHARS));
      return await new Promise<string[]>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Reading your resume took too long. Please try again.')), TIMEOUT_MS);
        setJob({ id: Date.now(), chunks, resolve, reject });
      });
    } finally {
      clearTimeout(timer);
      setJob(null); setImporting(false);
      busy.current = false;
      discard(asset);
    }
  }

  const element = job && createElement(View, { key: job.id, pointerEvents: 'none', style: styles.hidden },
    createElement(ResumeParser, {
      readChunk: async (index: number) => job.chunks[index] ?? null,
      onParsed: async (result: string) => job.resolve(toChips(parseKeywords(result))),
      onError: async (message: string) => job.reject(new Error(message)),
      dom: { style: styles.webview, scrollEnabled: false },
    }));

  return { importResume, importing, element };
}

async function readBase64(asset: DocumentPicker.DocumentPickerAsset) {
  if (Platform.OS !== 'web') return new File(asset.uri).base64();
  const blob = asset.file ?? await (await fetch(asset.uri)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

// The picker's cache copy is ours; remove it so the resume does not linger on disk.
function discard(asset: DocumentPicker.DocumentPickerAsset) {
  if (Platform.OS === 'web') return;
  try { new File(asset.uri).delete(); } catch { /* Already gone. */ }
}

function parseKeywords(json: string): ResumeKeywords {
  const value: unknown = JSON.parse(json);
  const list = (key: keyof ResumeKeywords) => {
    const items = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : null;
    return Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 40) : [];
  };
  return { skills: list('skills'), titles: list('titles'), degrees: list('degrees'), topics: list('topics') };
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, opacity: 0, overflow: 'hidden' },
  webview: { width: 2, height: 2 },
});
