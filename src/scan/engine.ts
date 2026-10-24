// One line of text read from a receipt image. Score and box are optional
// because not every engine reports them (the Tesseract engine returns text only).
export interface OcrLine {
  text: string;
  score?: number;
  box?: [x0: number, y0: number, x1: number, y1: number];
}

// 'download' is the one-time model fetch; 'recognize' has no pct when the
// engine can't report it (PaddleOCR runs detection + recognition as one call)
export type OcrProgress =
  | { phase: 'download'; pct: number }
  | { phase: 'recognize'; pct?: number };

export interface OcrEngine {
  // False when the engine's runtime couldn't load (e.g. CDN script blocked offline)
  isAvailable(): boolean;
  recognize(image: Blob, onProgress?: (p: OcrProgress) => void): Promise<OcrLine[]>;
}

export class OcrUnavailableError extends Error {
  constructor() {
    super('OCR engine unavailable');
    this.name = 'OcrUnavailableError';
  }
}
