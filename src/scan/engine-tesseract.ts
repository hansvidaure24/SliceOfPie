import type { OcrEngine, OcrLine } from './engine';

// Loaded from CDN via <script> in index.html, so it's undefined when offline
declare const Tesseract: {
  recognize(image: Blob, lang: string, opts: {
    logger: (m: { status: string; progress: number }) => void;
  }): Promise<{ data: { text: string } }>;
};

export function textToLines(text: string): OcrLine[] {
  return text.replace(/\r/g, '').split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(text => ({ text }));
}

export const tesseractEngine: OcrEngine = {
  isAvailable: () => typeof Tesseract !== 'undefined',

  async recognize(image, onProgress) {
    const { data } = await Tesseract.recognize(image, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
      }
    });
    return textToLines(data.text);
  },
};
