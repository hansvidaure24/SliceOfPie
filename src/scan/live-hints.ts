import { edgeStrength, exposure } from './quality';

// One guidance message at a time for the live camera, from a small grayscale
// copy of the current frame. These are advice, not gates: Step 3 found
// PaddleOCR reads much darker and softer photos than these thresholds, but a
// dark, shaky frame is still the most common way to get a bad scan.

export type HintKind = 'dark' | 'moving' | 'blurry' | 'ready';

export interface FrameStats {
  mean: number;
  edge: number;
  // Mean absolute brightness change from the previous frame, 0–255
  motion: number;
}

export const LIVE_DARK_MEAN = 60;
export const LIVE_MOTION = 8;
export const LIVE_MIN_EDGE = 12;

export function frameStats(gray: Uint8Array, w: number, h: number, prev: Uint8Array | null): FrameStats {
  let motion = 0;
  if (prev && prev.length === gray.length) {
    let sum = 0;
    for (let i = 0; i < gray.length; i++) sum += Math.abs(gray[i] - prev[i]);
    motion = sum / gray.length;
  }
  return { mean: exposure(gray).mean, edge: edgeStrength(gray, w, h), motion };
}

export function frameHint(s: FrameStats): HintKind {
  if (s.mean < LIVE_DARK_MEAN) return 'dark';
  if (s.motion > LIVE_MOTION) return 'moving';
  if (s.edge < LIVE_MIN_EDGE) return 'blurry';
  return 'ready';
}

export function hintText(kind: HintKind, torchAvailable: boolean): string {
  switch (kind) {
    case 'dark': return torchAvailable ? 'Too dark: turn on the light' : 'Too dark: find more light';
    case 'moving': return 'Hold still';
    case 'blurry': return 'Focusing… move a little further away if it stays blurry';
    case 'ready': return 'Looks good: take the photo';
  }
}
