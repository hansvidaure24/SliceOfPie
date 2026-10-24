import { describe, it, expect } from 'vitest';
import { frameStats, frameHint, hintText } from '../src/scan/live-hints';

const img = (w: number, h: number, f: (x: number, y: number) => number) => {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
};
const text = (shift = 0, ink = 20, paper = 240) =>
  img(80, 80, (x, y) => ((x + shift) % 6 === 0 || y % 10 === 0 ? ink : paper));

describe('frameStats', () => {
  it('reports no motion for the first frame or an identical one', () => {
    expect(frameStats(text(), 80, 80, null).motion).toBe(0);
    expect(frameStats(text(), 80, 80, text()).motion).toBe(0);
  });

  it('reports motion when the content shifts', () => {
    expect(frameStats(text(3), 80, 80, text()).motion).toBeGreaterThan(8);
  });
});

describe('frameHint', () => {
  it('is ready for a sharp, steady, well-lit frame', () => {
    expect(frameHint(frameStats(text(), 80, 80, text()))).toBe('ready');
  });

  it('asks for light first, even if the phone is also moving', () => {
    expect(frameHint(frameStats(text(3, 5, 50), 80, 80, text(0, 5, 50)))).toBe('dark');
  });

  it('asks to hold still when frames differ', () => {
    expect(frameHint(frameStats(text(3), 80, 80, text()))).toBe('moving');
  });

  it('reports blur when there are no sharp edges', () => {
    expect(frameHint(frameStats(img(80, 80, () => 200), 80, 80, null))).toBe('blurry');
  });
});

describe('hintText', () => {
  it('suggests the torch only when the phone has one', () => {
    expect(hintText('dark', true)).toMatch(/turn on the light/);
    expect(hintText('dark', false)).toMatch(/find more light/);
  });
});
