import { OcrUnavailableError, type OcrEngine, type OcrLine, type OcrProgress } from './engine';
import { tesseractEngine } from './engine-tesseract';
import { paddleEngine } from './engine-paddle';
import { parseReceipt, type ParsedReceipt, type ParseOptions } from './parse';

export interface ScanResult extends ParsedReceipt {
  lines: OcrLine[];
}

export interface ProcessOptions {
  onProgress?: (p: OcrProgress) => void;
  engine?: OcrEngine;
  // Tried in order; defaults to PaddleOCR then Tesseract
  engines?: OcrEngine[];
  parse?: ParseOptions;
}

// PaddleOCR first, Tesseract as a fallback for browsers that can't run it.
// Set localStorage sp_ocrEngine = 'tesseract' to compare against the old engine.
function defaultEngines(): OcrEngine[] {
  let pref: string | null = null;
  try { pref = localStorage.getItem('sp_ocrEngine'); } catch { /* storage blocked */ }
  return pref === 'tesseract' ? [tesseractEngine] : [paddleEngine, tesseractEngine];
}

// Single entry point from a captured/uploaded image to parsed receipt fields.
// Throws OcrUnavailableError when no engine can run (e.g. offline before the
// scanner was ever downloaded); otherwise rethrows the last engine's error.
export async function processReceipt(image: Blob, opts: ProcessOptions = {}): Promise<ScanResult> {
  const engines = (opts.engine ? [opts.engine] : opts.engines ?? defaultEngines()).filter(e => e.isAvailable());
  if (!engines.length) throw new OcrUnavailableError();

  let lastError: unknown;
  for (const engine of engines) {
    try {
      const lines = await engine.recognize(image, opts.onProgress);
      return { ...parseReceipt(lines, opts.parse), lines };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
