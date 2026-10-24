import { describe, it, expect } from 'vitest';
import { pruneCache } from '../src/scan/engine-paddle';

const BASE = 'https://slice-of-pie.example/';

// Just enough of the Cache API: keys() and delete()
function fakeCache(urls: string[]) {
  const entries = new Set(urls);
  return {
    entries,
    keys: async () => [...entries].map(url => ({ url }) as Request),
    delete: async (req: RequestInfo | URL) => entries.delete(typeof req === 'string' ? req : (req as Request).url),
  };
}

describe('pruneCache', () => {
  const current = ['/assets/paddle.worker-NEW.js', '/assets/ort-wasm-simd-threaded-AAA.wasm', '/ocr/models/det.tar', '/ocr/models/rec.tar'];

  it('removes files left behind by an older version of the app', async () => {
    const cache = fakeCache([
      ...current.map(u => BASE + u.slice(1)),
      BASE + 'assets/paddle.worker-OLD.js',
      BASE + 'assets/ort-wasm-simd-threaded-OLDER.wasm',
    ]);
    expect(await pruneCache(cache, current, BASE)).toBe(2);
    expect([...cache.entries].sort()).toEqual(current.map(u => BASE + u.slice(1)).sort());
  });

  it('keeps everything when only current files are cached', async () => {
    const cache = fakeCache(current.map(u => BASE + u.slice(1)));
    expect(await pruneCache(cache, current, BASE)).toBe(0);
    expect(cache.entries.size).toBe(4);
  });

  it('resolves relative and absolute file URLs the same way', async () => {
    const cache = fakeCache([BASE + 'ocr/models/det.tar']);
    expect(await pruneCache(cache, [BASE + 'ocr/models/det.tar'], BASE)).toBe(0);
    expect(await pruneCache(cache, ['ocr/models/det.tar'], BASE)).toBe(0);
  });
});
