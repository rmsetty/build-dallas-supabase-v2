'use dom';

import type { DOMProps } from 'expo/dom';
import { useEffect, useRef } from 'react';
import { extractKeywords } from './extract-keywords';
import { readPdfTextItems } from './pdf-text';

type Props = {
  readChunk: (index: number) => Promise<string | null>;
  onParsed: (result: string) => Promise<void>;
  onError: (message: string) => Promise<void>;
  dom?: DOMProps;
};

const MAX_CHUNKS = 64;

// Runs in a hidden WebView. The PDF arrives in base64 chunks through a native action because large
// initial props blank the WebView; only the extracted keywords are posted back.
export default function ResumeParser({ readChunk, onParsed, onError }: Props) {
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    readPdf(readChunk).then(readPdfTextItems).then(items => onParsed(JSON.stringify(extractKeywords(items))))
      .catch((error: unknown) => onError(describe(error)));
  }, [readChunk, onParsed, onError]);
  return null;
}

async function readPdf(readChunk: Props['readChunk']) {
  const parts: Uint8Array[] = [];
  for (let index = 0; index < MAX_CHUNKS; index++) {
    const chunk = await readChunk(index);
    if (!chunk) break;
    const binary = atob(chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    parts.push(bytes);
  }
  const data = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => { data.set(part, offset); return offset + part.length; }, 0);
  if (!data.length) throw new Error('empty');
  return data;
}

function describe(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') return 'This PDF is password-protected. Export an unlocked copy and try again.';
  if (name === 'InvalidPDFException') return 'That file doesn’t look like a valid PDF.';
  return 'We couldn’t read that PDF. Try exporting it again or add interests manually.';
}
