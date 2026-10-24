import { OcrUnavailableError, type OcrEngine, type OcrLine } from './engine';
import { tesseractEngine } from './engine-tesseract';
import { linesToText, parseReceipt, type ParsedReceipt } from './parse';

export interface ScanResult extends ParsedReceipt {
  lines: OcrLine[];
}

export interface ProcessOptions {
  onProgress?: (pct: number) => void;
  engine?: OcrEngine;
}

// Single entry point from a captured/uploaded image to parsed receipt fields.
// Throws OcrUnavailableError when the engine can't run (e.g. offline).
export async function processReceipt(image: Blob, opts: ProcessOptions = {}): Promise<ScanResult> {
  const engine = opts.engine ?? tesseractEngine;
  if (!engine.isAvailable()) throw new OcrUnavailableError();
  const lines = await engine.recognize(image, opts.onProgress);
  return { ...parseReceipt(linesToText(lines)), lines };
}
