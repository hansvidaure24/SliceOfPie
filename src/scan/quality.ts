// Photo quality checks, run before OCR on a small grayscale copy of the photo
// (QUALITY_SIDE px on the long side; the thresholds depend on that scale).

export const QUALITY_SIDE = 1000;

// Rec. 601 luma from RGBA pixels
export function toGray(rgba: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    gray[j] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  }
  return gray;
}

// |3×3 Laplacian| per interior pixel. Sharp text gives strong responses at
// stroke edges; blur spreads them out.
function laplacian(gray: Uint8Array, w: number, h: number): Float32Array {
  const out = new Float32Array((w - 2) * (h - 2));
  let k = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[k++] = Math.abs(gray[i - w] + gray[i + w] + gray[i - 1] + gray[i + 1] - 4 * gray[i]);
    }
  }
  return out;
}

export function laplacianVariance(gray: Uint8Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  const lap = laplacian(gray, w, h);
  let sum = 0, sq = 0;
  for (const v of lap) { sum += v; sq += v * v; }
  const mean = sum / lap.length;
  return sq / lap.length - mean * mean;
}

// Mean of the strongest 1% of edge responses. Unlike the plain variance, this
// doesn't drop just because most of a receipt is blank paper.
export function edgeStrength(gray: Uint8Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  const lap = laplacian(gray, w, h);
  const hist = new Uint32Array(1021);                    // |Laplacian| is at most 4 × 255
  for (const v of lap) hist[v]++;
  let want = Math.max(1, Math.round(lap.length * 0.01));
  let sum = 0, n = 0;
  for (let v = hist.length - 1; v >= 0 && want > 0; v--) {
    const take = Math.min(hist[v], want);
    sum += v * take;
    n += take;
    want -= take;
  }
  return n ? sum / n : 0;
}

// Calibrated on three real receipt photos with blurred, darkened and
// overexposed copies (docs/ocr-migration-plan.md, Step 3). PaddleOCR still read
// copies blurred by 3 px (edge strength 13–26) and darkened to 18% (mean ~26),
// so these only flag photos it can't read at all; the parser's "amounts add
// up" check catches the rest after OCR.
export const MIN_EDGE_STRENGTH = 10;
export const MIN_MEAN_BRIGHTNESS = 20;

export interface QualityReport {
  // Too blurry or too washed out to have readable edges
  blurry: boolean;
  dark: boolean;
  edge: number;
  mean: number;
}

export function assessQuality(gray: Uint8Array, w: number, h: number): QualityReport {
  const edge = edgeStrength(gray, w, h);
  const { mean } = exposure(gray);
  return { blurry: edge < MIN_EDGE_STRENGTH, dark: mean < MIN_MEAN_BRIGHTNESS, edge, mean };
}

export function exposure(gray: Uint8Array): { mean: number; dark: number; clipped: number } {
  let sum = 0, dark = 0, clipped = 0;
  for (const v of gray) {
    sum += v;
    if (v < 40) dark++;
    if (v >= 253) clipped++;
  }
  const n = gray.length || 1;
  return { mean: sum / n, dark: dark / n, clipped: clipped / n };
}
