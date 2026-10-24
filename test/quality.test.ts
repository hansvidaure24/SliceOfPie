import { describe, it, expect } from 'vitest';
import { toGray, laplacianVariance, edgeStrength, exposure, assessQuality } from '../src/scan/quality';

// w×h grayscale image from a function of (x, y)
const img = (w: number, h: number, f: (x: number, y: number) => number) => {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
};

// Box blur, to compare a pattern against a softened copy of itself
const blur = (g: Uint8Array, w: number, h: number) => img(w, h, (x, y) => {
  let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += g[yy * w + xx]; n++; }
  }
  return Math.round(s / n);
});

describe('toGray', () => {
  it('weights channels by perceived brightness', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255]);
    expect([...toGray(rgba)]).toEqual([255, 0, 76, 149]);
  });
});

describe('sharpness', () => {
  // Thin dark strokes on white, like receipt text
  const text = img(60, 60, (x, y) => (x % 6 === 0 || y % 10 === 0 ? 20 : 240));

  it('is zero for a flat image', () => {
    const flat = img(20, 20, () => 200);
    expect(laplacianVariance(flat, 20, 20)).toBe(0);
    expect(edgeStrength(flat, 20, 20)).toBe(0);
  });

  it('drops when the same image is blurred', () => {
    const soft = blur(text, 60, 60);
    expect(laplacianVariance(soft, 60, 60)).toBeLessThan(laplacianVariance(text, 60, 60) / 2);
    expect(edgeStrength(soft, 60, 60)).toBeLessThan(edgeStrength(text, 60, 60) / 2);
  });

  it('edge strength ignores how much of the page is blank', () => {
    // Same strokes, but only in the top fifth of a mostly empty page
    const sparse = img(60, 300, (x, y) => (y < 60 && (x % 6 === 0 || y % 10 === 0) ? 20 : 240));
    const ratio = edgeStrength(sparse, 60, 300) / edgeStrength(text, 60, 60);
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.15);
    expect(laplacianVariance(sparse, 60, 300)).toBeLessThan(laplacianVariance(text, 60, 60) / 2);
  });

  it('handles images too small for the kernel', () => {
    expect(laplacianVariance(new Uint8Array(4), 2, 2)).toBe(0);
    expect(edgeStrength(new Uint8Array(4), 2, 2)).toBe(0);
  });
});

describe('assessQuality', () => {
  const text = img(60, 60, (x, y) => (x % 6 === 0 || y % 10 === 0 ? 20 : 240));

  it('passes a sharp, normally lit page', () => {
    expect(assessQuality(text, 60, 60)).toMatchObject({ blurry: false, dark: false });
  });

  it('flags a page with no readable edges (heavy blur or washed out)', () => {
    expect(assessQuality(img(60, 60, () => 255), 60, 60).blurry).toBe(true);
  });

  it('flags a very dark page', () => {
    expect(assessQuality(img(60, 60, (x, y) => (x % 6 === 0 || y % 10 === 0 ? 2 : 15)), 60, 60).dark).toBe(true);
  });
});

describe('exposure', () => {
  it('reports mean brightness and dark and clipped fractions', () => {
    const g = new Uint8Array([0, 20, 128, 200, 253, 255, 255, 100]);
    expect(exposure(g)).toEqual({ mean: (0 + 20 + 128 + 200 + 253 + 255 + 255 + 100) / 8, dark: 2 / 8, clipped: 3 / 8 });
  });
});
