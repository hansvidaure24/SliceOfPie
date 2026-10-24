import { describe, it, expect, vi, afterEach } from 'vitest';
import { tesseractEngine } from '../src/scan/engine-tesseract';
import { processReceipt } from '../src/scan/process';
import { OcrUnavailableError, type OcrEngine, type OcrProgress } from '../src/scan/engine';

afterEach(() => {
  vi.unstubAllGlobals();
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
    const progress: OcrProgress[] = [];
    const lines = await tesseractEngine.recognize(img, p => progress.push(p));

    expect(tesseractEngine.isAvailable()).toBe(true);
    expect(recognize).toHaveBeenCalledWith(img, 'eng', expect.any(Object));
    expect(progress).toEqual([{ phase: 'recognize', pct: 26 }, { phase: 'recognize', pct: 100 }]);
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

  it('throws OcrUnavailableError by default outside the browser (no Worker, no Tesseract)', async () => {
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
    const recognize = vi.fn(async (_img: Blob, cb?: (p: OcrProgress) => void) => { cb?.({ phase: 'download', pct: 50 }); return []; });
    await processReceipt(new Blob(), { engine: fakeEngine({ recognize }), onProgress });
    expect(onProgress).toHaveBeenCalledWith({ phase: 'download', pct: 50 });
  });

  it('falls back to the next engine when one fails', async () => {
    const failing = fakeEngine({ recognize: async () => { throw new Error('out of memory'); } });
    const ok = fakeEngine();
    const result = await processReceipt(new Blob(), { engines: [failing, ok] });
    expect(result.items).toEqual([{ name: 'Burger', price: 10 }]);
  });

  it('skips unavailable engines', async () => {
    const recognize = vi.fn();
    const result = await processReceipt(new Blob(), { engines: [fakeEngine({ isAvailable: () => false, recognize }), fakeEngine()] });
    expect(recognize).not.toHaveBeenCalled();
    expect(result.tax).toBe(0.8);
  });

  it('rethrows the last error when every engine fails', async () => {
    const err = new Error('second');
    await expect(processReceipt(new Blob(), { engines: [
      fakeEngine({ recognize: async () => { throw new Error('first'); } }),
      fakeEngine({ recognize: async () => { throw err; } }),
    ] })).rejects.toBe(err);
  });

  it('lets engine errors propagate (shown as "Scan failed")', async () => {
    const err = new Error('worker crashed');
    await expect(processReceipt(new Blob(), { engine: fakeEngine({ recognize: async () => { throw err; } }) }))
      .rejects.toBe(err);
  });
});
