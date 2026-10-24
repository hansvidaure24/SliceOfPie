import { OcrUnavailableError, type OcrEngine } from './engine';
import { textToLines } from './parse';

// Loaded from the CDN only when PaddleOCR can't run, so most visits never fetch it
const SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

declare const Tesseract: {
  recognize(image: Blob, lang: string, opts: {
    logger: (m: { status: string; progress: number }) => void;
  }): Promise<{ data: { text: string } }>;
};

const loaded = () => typeof Tesseract !== 'undefined';

let loading: Promise<boolean> | null = null;
function loadScript(): Promise<boolean> {
  loading ??= new Promise(resolve => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => resolve(loaded());
    script.onerror = () => {
      script.remove();
      loading = null;
      resolve(false);
    };
    document.head.appendChild(script);
  });
  return loading;
}

export const tesseractEngine: OcrEngine = {
  // Already loaded, or a page that could load it (it comes from the CDN, so not offline)
  isAvailable: () => loaded() || (typeof document !== 'undefined' && navigator.onLine),

  async recognize(image, onProgress) {
    if (!loaded() && !(await loadScript())) throw new OcrUnavailableError();
    const { data } = await Tesseract.recognize(image, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') onProgress?.({ phase: 'recognize', pct: Math.round(m.progress * 100) });
      }
    });
    return textToLines(data.text);
  },
};
