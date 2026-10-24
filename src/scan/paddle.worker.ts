// Runs PaddleOCR off the main thread. We use our own worker instead of the
// SDK's `worker: true` because its prebuilt worker bundles the WebGPU build of
// ONNX Runtime, which needs a 25 MB wasm; vite.config aliases onnxruntime-web
// to the 12 MB wasm-only build here.
import { PaddleOCR } from '@paddleocr/paddleocr-js';
import cvModule from '@techstark/opencv-js';
import { env as ortEnv } from 'onnxruntime-web';
import type { PaddleConfig, WorkerRequest, WorkerResponse } from './paddle-protocol';

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

// The PP-OCR ONNX exports trigger hundreds of harmless "unused initializer" warnings
ortEnv.logLevel = 'error';

type Mat = { delete(): void };
type Cv = { matFromImageData(data: ImageData): Mat };

let ocr: PaddleOCR | null = null;
let cv: Cv | null = null;

// PaddleOCR decodes Blobs through a DOM <canvas>, which doesn't exist in a
// worker, so decode with OffscreenCanvas and hand it an OpenCV Mat instead
async function blobToMat(image: Blob): Promise<Mat> {
  const bitmap = await createImageBitmap(image);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return cv!.matFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

async function init(config: PaddleConfig): Promise<number> {
  const started = performance.now();
  const threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  ocr = await PaddleOCR.create({
    textDetectionModelName: config.det.name,
    textDetectionModelAsset: { url: config.det.url },
    textRecognitionModelName: config.rec.name,
    textRecognitionModelAsset: { url: config.rec.url },
    // No wasmPaths: ONNX Runtime finds its wasm via the bundler-emitted asset URL
    ortOptions: { backend: 'wasm', numThreads: threads, simd: true },
    ...config.params,
  }) as PaddleOCR;
  // Same module instance PaddleOCR initialized, so its runtime is ready
  cv = (cvModule instanceof Promise ? await cvModule : cvModule) as unknown as Cv;
  return performance.now() - started;
}

ctx.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const initMs = await init(msg.config);
      ctx.postMessage({ type: 'ready', initMs });
    } else if (msg.type === 'recognize') {
      if (!ocr) throw new Error('PaddleOCR not initialized');
      const mat = await blobToMat(msg.image);
      let result;
      try {
        [result] = await ocr.predict(mat);
      } finally {
        mat.delete();
      }
      ctx.postMessage({
        type: 'result',
        id: msg.id,
        segments: result.items.map(i => ({ poly: i.poly, text: i.text, score: i.score })),
        totalMs: result.metrics.totalMs,
      });
    }
  } catch (err) {
    ctx.postMessage({ type: 'error', id: msg.type === 'recognize' ? msg.id : undefined, message: String((err as Error)?.message ?? err) });
  }
};
