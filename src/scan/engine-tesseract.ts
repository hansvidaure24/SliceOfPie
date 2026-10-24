import type { OcrEngine } from './engine';
import { textToLines } from './parse';

// Loaded from CDN via <script> in index.html, so it's undefined when offline
declare const Tesseract: {
  recognize(image: Blob, lang: string, opts: {
    logger: (m: { status: string; progress: number }) => void;
  }): Promise<{ data: { text: string } }>;
};

export const tesseractEngine: OcrEngine = {
  isAvailable: () => typeof Tesseract !== 'undefined',

  async recognize(image, onProgress) {
    const { data } = await Tesseract.recognize(image, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') onProgress?.({ phase: 'recognize', pct: Math.round(m.progress * 100) });
      }
    });
    return textToLines(data.text);
  },
};
