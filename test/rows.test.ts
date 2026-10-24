import { describe, it, expect } from 'vitest';
import { mergeRows, type OcrSegment } from '../src/scan/rows';

// Axis-aligned segment from x0,y0 to x1,y1
const seg = (text: string, x0: number, y0: number, x1: number, y1: number, score = 0.9): OcrSegment => ({
  text, score, poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
});

describe('mergeRows', () => {
  it('returns nothing for no segments', () => {
    expect(mergeRows([])).toEqual([]);
  });

  it('joins segments on the same row left to right', () => {
    const lines = mergeRows([seg('12.50', 400, 100, 470, 130), seg('Burger', 20, 102, 140, 128)]);
    expect(lines).toEqual([{ text: 'Burger 12.50', score: 0.9, box: [20, 100, 470, 130] }]);
  });

  it('keeps separate rows apart and orders them top to bottom', () => {
    const lines = mergeRows([
      seg('Fries', 20, 150, 100, 180), seg('4.00', 400, 150, 460, 180),
      seg('Burger', 20, 100, 140, 130), seg('12.50', 400, 100, 470, 130),
    ]);
    expect(lines.map(l => l.text)).toEqual(['Burger 12.50', 'Fries 4.00']);
  });

  it('keeps a slightly skewed row together', () => {
    // Price sits 8px lower than the name: a few degrees of tilt on a 30px line
    const lines = mergeRows([seg('Burger', 20, 100, 140, 130), seg('12.50', 400, 108, 470, 138)]);
    expect(lines.map(l => l.text)).toEqual(['Burger 12.50']);
  });

  it('does not merge tightly spaced adjacent rows', () => {
    const lines = mergeRows([seg('Burger 12.50', 20, 100, 470, 130), seg('Fries 4.00', 20, 131, 460, 161)]);
    expect(lines.map(l => l.text)).toEqual(['Burger 12.50', 'Fries 4.00']);
  });

  it('uses the lowest segment score for the row', () => {
    const [line] = mergeRows([seg('Burger', 20, 100, 140, 130, 0.95), seg('12.5O', 400, 100, 470, 130, 0.6)]);
    expect(line.score).toBe(0.6);
  });

  it('drops blank segments and trims text', () => {
    const lines = mergeRows([seg('  Burger ', 20, 100, 140, 130), seg('   ', 200, 100, 260, 130)]);
    expect(lines.map(l => l.text)).toEqual(['Burger']);
  });

  describe('tilted photos', () => {
    // Rotate an axis-aligned segment by deg around the origin, like a tilted photo
    const rotated = (s: OcrSegment, deg: number): OcrSegment => {
      const a = (deg * Math.PI) / 180;
      return { ...s, poly: s.poly.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)] as [number, number]) };
    };
    // Two-column receipt: names at x≈20, prices at x≈600, 40px line pitch
    const receipt = [
      seg('3 Fries', 20, 100, 150, 130), seg('11.97', 600, 100, 680, 130),
      seg('Iced Tea', 20, 140, 160, 170), seg('3.25', 600, 140, 670, 170),
      seg('Apple Pie', 20, 180, 180, 210), seg('7.95', 600, 180, 670, 210),
    ];
    const expected = ['3 Fries 11.97', 'Iced Tea 3.25', 'Apple Pie 7.95'];

    it.each([-8, -4, 4, 8])('pairs prices with the right item at %i°', deg => {
      expect(mergeRows(receipt.map(s => rotated(s, deg))).map(l => l.text)).toEqual(expected);
    });

    it('ignores the tilt of a single odd box', () => {
      // Rotate one price box 30° in place (around its own center)
      const odd = seg('7.95', 600, 180, 670, 210);
      const a = (30 * Math.PI) / 180;
      odd.poly = odd.poly.map(([x, y]) => {
        const dx = x - 635, dy = y - 195;
        return [635 + dx * Math.cos(a) - dy * Math.sin(a), 195 + dx * Math.sin(a) + dy * Math.cos(a)] as [number, number];
      });
      const lines = mergeRows([...receipt.slice(0, 4), odd, seg('Apple Pie', 20, 180, 180, 210)]);
      expect(lines.map(l => l.text)).toEqual(['3 Fries 11.97', 'Iced Tea 3.25', 'Apple Pie 7.95']);
    });
  });

  it('handles rotated quads by their bounding box', () => {
    const tilted: OcrSegment = { text: 'Tea', score: 0.8, poly: [[22, 104], [90, 100], [92, 128], [24, 132]] };
    expect(mergeRows([tilted])[0].box).toEqual([22, 100, 92, 132]);
  });
});
