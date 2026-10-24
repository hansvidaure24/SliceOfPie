import assets from './ocr-assets.json';
import workerUrl from './paddle.worker.ts?worker&url';
// Same hashed file ONNX Runtime resolves inside the worker; imported here only to prefetch it
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { mergeRows, type OcrSegment } from './rows';
import { OcrUnavailableError, type OcrEngine, type OcrLine, type OcrProgress } from './engine';
import type { PaddleConfig, WorkerRequest, WorkerResponse } from './paddle-protocol';
import { OCR_CACHE } from './cache-name';

// The worker chunk is mostly OpenCV.js; its real size is only known after build
const WORKER_BYTES_ESTIMATE = 10_500_000;

type ModelName = keyof typeof assets.models;

export interface PaddleModels {
  det: { name: string; url: string; bytes: number };
  rec: { name: string; url: string; bytes: number };
}

export function modelsFromAssets(det: string, rec: string, baseUrl: string): PaddleModels {
  const entry = (name: string) => ({
    name,
    url: `${baseUrl}${name}.tar`,
    bytes: assets.models[name as ModelName].bytes,
  });
  return { det: entry(det), rec: entry(rec) };
}

export interface PaddleScan {
  lines: OcrLine[];
  segments: OcrSegment[];
  totalMs: number;
}

export interface PaddleEngine extends OcrEngine {
  // Downloads (if needed) and starts the worker; resolves to init time in ms
  warm(onProgress?: (p: OcrProgress) => void): Promise<number>;
  recognizeDetailed(image: Blob, onProgress?: (p: OcrProgress) => void): Promise<PaddleScan>;
  dispose(): void;
}

async function allCached(urls: string[]): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(OCR_CACHE);
    const hits = await Promise.all(urls.map(u => cache.match(u)));
    return hits.every(Boolean);
  } catch {
    return false;
  }
}

// Fetch everything once on the main thread so we can show byte progress.
// The service worker caches each response, so the OCR worker's own fetches
// hit the cache instead of the network.
async function download(files: { url: string; bytes: number }[], onPct: (pct: number) => void): Promise<void> {
  const total = files.reduce((s, f) => s + f.bytes, 0);
  let loaded = 0;
  await Promise.all(files.map(async f => {
    const res = await fetch(f.url);
    if (!res.ok || !res.body) throw new Error(`${f.url}: HTTP ${res.status}`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.length;
      onPct(Math.min(99, Math.round((loaded / total) * 100)));
    }
  }));
  onPct(100);
}

export function createPaddleEngine(models: PaddleModels, opts: { params?: Record<string, unknown> } = {}): PaddleEngine {
  const files = [
    { url: workerUrl, bytes: WORKER_BYTES_ESTIMATE },
    { url: ortWasmUrl, bytes: assets.ortWasmBytes },
    { url: models.det.url, bytes: models.det.bytes },
    { url: models.rec.url, bytes: models.rec.bytes },
  ];
  const config: PaddleConfig = {
    det: { name: models.det.name, url: models.det.url },
    rec: { name: models.rec.name, url: models.rec.url },
    params: opts.params,
  };

  let worker: Worker | null = null;
  let ready: Promise<number> | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (r: WorkerResponse & { type: 'result' }) => void; reject: (e: Error) => void }>();
  let initWaiter: { resolve: (ms: number) => void; reject: (e: Error) => void } | null = null;

  function failAll(err: Error): void {
    initWaiter?.reject(err);
    initWaiter = null;
    pending.forEach(p => p.reject(err));
    pending.clear();
  }

  function dispose(): void {
    failAll(new Error('PaddleOCR engine disposed'));
    worker?.terminate();
    worker = null;
    ready = null;
  }

  function warm(onProgress?: (p: OcrProgress) => void): Promise<number> {
    if (ready) return ready;
    ready = (async () => {
      if (!(await allCached(files.map(f => f.url)))) {
        try {
          await download(files, pct => onProgress?.({ phase: 'download', pct }));
        } catch (err) {
          // fetch() rejects with TypeError on network failure, i.e. offline before the first download
          throw err instanceof TypeError ? new OcrUnavailableError() : err;
        }
      }
      // Worker startup (wasm compile, model load) takes a second or two; don't sit on "100%"
      onProgress?.({ phase: 'recognize' });
      worker = new Worker(workerUrl, { type: 'module' });
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === 'ready') {
          initWaiter?.resolve(msg.initMs);
          initWaiter = null;
        } else if (msg.type === 'result') {
          pending.get(msg.id)?.resolve(msg);
          pending.delete(msg.id);
        } else if (msg.id !== undefined) {
          pending.get(msg.id)?.reject(new Error(msg.message));
          pending.delete(msg.id);
        } else {
          failAll(new Error(msg.message));
        }
      };
      worker.onerror = e => failAll(new Error(e.message || 'OCR worker failed to load'));
      const initMs = new Promise<number>((resolve, reject) => { initWaiter = { resolve, reject }; });
      worker.postMessage({ type: 'init', config } satisfies WorkerRequest);
      return initMs;
    })();
    // A failed start (offline before first download, out of memory) can be retried later
    ready.catch(() => dispose());
    return ready;
  }

  async function recognizeDetailed(image: Blob, onProgress?: (p: OcrProgress) => void): Promise<PaddleScan> {
    await warm(onProgress);
    onProgress?.({ phase: 'recognize' });
    const id = nextId++;
    const res = await new Promise<WorkerResponse & { type: 'result' }>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker!.postMessage({ type: 'recognize', id, image } satisfies WorkerRequest);
    });
    return { lines: mergeRows(res.segments), segments: res.segments, totalMs: res.totalMs };
  }

  return {
    isAvailable: () => typeof Worker === 'function' && typeof WebAssembly === 'object',
    warm,
    recognizeDetailed,
    recognize: async (image, onProgress) => (await recognizeDetailed(image, onProgress)).lines,
    dispose,
  };
}

export const paddleEngine = createPaddleEngine(
  modelsFromAssets(assets.app.det, assets.app.rec, `${import.meta.env.BASE_URL}ocr/models/`),
);
