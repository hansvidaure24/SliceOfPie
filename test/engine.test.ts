import { describe, it, expect, vi, afterEach } from 'vitest';
import { tesseractEngine, textToLines } from '../src/scan/engine-tesseract';
import { processReceipt } from '../src/scan/process';
import { OcrUnavailableError, type OcrEngine } from '../src/scan/engine';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('textToLines', () => {
  it('splits, trims and drops blank lines', () => {
    expect(textToLines('  Burger 12.50 \r\n\n\nFries 4.00\n  \n')).toEqual([
      { text: 'Burger 12.50' },
      { text: 'Fries 4.00' },
    ]);
  });
});

describe('tesseractEngine', () => {
  it('is unavailable when the CDN script did not load', () => {
    expect(tesseractEngine.isAvailable()).toBe(false);
  });

  it('runs English recognition and reports rounded progress for the recognize phase only', async () => {
    const recognize = vi.fn(async (_img: Blob, _lang: string, opts: { logger: (m: { status: string; progress: number }) => void }) => {
      opts.logger({ status: 'loading tesseract core', progress: 0.5 });
      opts.logger({ status: 'recognizing text', progress: 0.256 });
      opts.logger({ status: 'recognizing text', progress: 1 });
      return { data: { text: 'Burger 12.50\n\nFries 4.00\n' } };
    });
    vi.stubGlobal('Tesseract', { recognize });

    const img = new Blob(['x']);
    const progress: number[] = [];
    const lines = await tesseractEngine.recognize(img, pct => progress.push(pct));

    expect(tesseractEngine.isAvailable()).toBe(true);
    expect(recognize).toHaveBeenCalledWith(img, 'eng', expect.any(Object));
    expect(progress).toEqual([26, 100]);
    expect(lines).toEqual([{ text: 'Burger 12.50' }, { text: 'Fries 4.00' }]);
  });
});

describe('processReceipt', () => {
  const fakeEngine = (overrides: Partial<OcrEngine> = {}): OcrEngine => ({
    isAvailable: () => true,
    recognize: async () => [{ text: 'Burger 10.00' }, { text: 'Tax 0.80' }, { text: 'Total 10.80' }],
    ...overrides,
  });

  it('throws OcrUnavailableError without calling recognize when the engine is unavailable', async () => {
    const recognize = vi.fn();
    await expect(processReceipt(new Blob(), { engine: fakeEngine({ isAvailable: () => false, recognize }) }))
      .rejects.toBeInstanceOf(OcrUnavailableError);
    expect(recognize).not.toHaveBeenCalled();
  });

  it('defaults to Tesseract, which is unavailable outside the browser', async () => {
    await expect(processReceipt(new Blob())).rejects.toBeInstanceOf(OcrUnavailableError);
  });

  it('parses the engine lines and returns them alongside the fields', async () => {
    const result = await processReceipt(new Blob(), { engine: fakeEngine() });
    expect(result.items).toEqual([{ name: 'Burger', price: 10 }]);
    expect(result.tax).toBe(0.8);
    expect(result.lines).toHaveLength(3);
  });

  it('passes progress through to the engine', async () => {
    const onProgress = vi.fn();
    const recognize = vi.fn(async (_img: Blob, cb?: (pct: number) => void) => { cb?.(50); return []; });
    await processReceipt(new Blob(), { engine: fakeEngine({ recognize }), onProgress });
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it('lets engine errors propagate (shown as "Scan failed")', async () => {
    const err = new Error('worker crashed');
    await expect(processReceipt(new Blob(), { engine: fakeEngine({ recognize: async () => { throw err; } }) }))
      .rejects.toBe(err);
  });
});
