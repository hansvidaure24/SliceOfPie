import type { OcrSegment } from './rows';

export interface PaddleConfig {
  det: { name: string; url: string };
  rec: { name: string; url: string };
  // Extra PaddleOCR.create options (e.g. textDetLimitSideLen) for benchmarking
  params?: Record<string, unknown>;
}

export type WorkerRequest =
  | { type: 'init'; config: PaddleConfig }
  | { type: 'recognize'; id: number; image: Blob };

export type WorkerResponse =
  | { type: 'ready'; initMs: number }
  | { type: 'result'; id: number; segments: OcrSegment[]; detMs: number; recMs: number; totalMs: number }
  | { type: 'error'; id?: number; message: string };
