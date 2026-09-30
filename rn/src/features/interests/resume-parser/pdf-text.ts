// unpdf's serverless PDF.js build registers its worker handler in-thread, so no separate worker file
// is fetched. It is imported directly (not via unpdf's wrapper) to avoid a dynamic import chunk.
import { AnnotationMode, getDocument, type PDFPageProxy } from 'unpdf/pdfjs';
import type { ResumeTextItem } from './extract-keywords';

const MAX_PAGES = 5;

// PDF.js 5 calls URL.parse, which older WebKit builds lack.
const url = URL as unknown as { parse?: (href: string | URL, base?: string | URL) => URL | null };
url.parse ??= (href, base) => { try { return new URL(href, base); } catch { return null; } };

export async function readPdfTextItems(data: Uint8Array): Promise<ResumeTextItem[]> {
  const task = getDocument({
    data, useSystemFonts: true, disableFontFace: true, useWasm: false,
    isOffscreenCanvasSupported: false, isImageDecoderSupported: false, verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    const items: ResumeTextItem[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const fonts = await fontNames(page, Object.keys(content.styles));
      for (const item of content.items) {
        if (!('str' in item)) continue;
        items.push({
          text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height,
          fontName: fonts[item.fontName] || content.styles[item.fontName]?.fontFamily || '', hasEOL: item.hasEOL, page: number,
        });
      }
      page.cleanup();
    }
    return items;
  } finally {
    await task.destroy();
  }
}

// Text styles only expose generic families ("sans-serif"); the operator list resolves real font objects.
async function fontNames(page: PDFPageProxy, ids: string[]) {
  const names: Record<string, string> = {};
  try {
    await page.getOperatorList({ annotationMode: AnnotationMode.DISABLE });
    for (const id of ids) {
      try {
        const font = page.commonObjs.get(id) as { name?: string; bold?: boolean; black?: boolean } | null;
        if (font?.name) names[id] = font.name + (font.bold || font.black ? '-Bold' : '');
      } catch { /* Font never loaded; fall back to the style family. */ }
    }
  } catch { /* Operator list failed; fall back to style families. */ }
  return names;
}
