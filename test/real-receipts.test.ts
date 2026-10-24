import { describe, it, expect } from 'vitest';
import { mergeRows, type OcrSegment } from '../src/scan/rows';
import { parseReceipt } from '../src/scan/parse';

// Real receipt photos, run through PaddleOCR once and saved as raw text boxes
// (test/fixtures/receipts/real/*.ocr.json), with hand-checked answers in
// *.expected.json. These run the rest of the pipeline (row merging + parsing)
// without the model.

interface OcrFixture { image: string; width: number; height: number; engine: string; segments: OcrSegment[] }
interface Expected {
  merchant: string | null;
  date: string | null;
  items: { name: string; price: number }[];
  subtotal: number;
  tax: number;
  tip: number | null;
  total: number;
}

const ocr = import.meta.glob<OcrFixture>('./fixtures/receipts/real/*.ocr.json', { import: 'default', eager: true });
const expected = import.meta.glob<Expected>('./fixtures/receipts/real/*.expected.json', { import: 'default', eager: true });

// Checks the current parser is known to fail, as "<fixture>: <check>". They run
// as `it.fails`, so fixing one makes its test fail until the entry is removed.
const KNOWN_GAPS = new Set<string>([]);

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const prices = (items: { price: number }[]) => items.map(i => i.price).sort((a, b) => a - b);

const fixtures = Object.entries(ocr).map(([path, data]) => {
  const name = path.replace(/^.*\/(.+)\.ocr\.json$/, '$1');
  return { name, data, expected: expected[path.replace(/\.ocr\.json$/, '.expected.json')] };
});

describe('real receipts', () => {
  it('has fixtures, each with an expected file', () => {
    expect(fixtures.length).toBeGreaterThan(0);
    for (const f of fixtures) expect(f.expected, f.name).toBeDefined();
  });

  for (const f of fixtures) {
    describe(f.name, () => {
      // US receipts; dates are checked against a fixed "today" so they don't expire
      const parsed = () => parseReceipt(mergeRows(f.data.segments), { monthFirst: true, today: new Date('2026-10-23T12:00:00Z') });
      const check = (label: string, fn: () => void) => {
        (KNOWN_GAPS.has(`${f.name}: ${label}`) ? it.fails : it)(label, fn);
      };

      check('item prices', () => {
        expect(prices(parsed().items)).toEqual(prices(f.expected.items));
      });

      check('item names', () => {
        expect(parsed().items.map(i => norm(i.name))).toEqual(f.expected.items.map(i => norm(i.name)));
      });

      check('subtotal, tax, tip and total', () => {
        const { subtotal, tax, tip, total } = parsed();
        expect({ subtotal, tax, tip, total }).toEqual({
          subtotal: f.expected.subtotal, tax: f.expected.tax, tip: f.expected.tip, total: f.expected.total,
        });
      });

      check('merchant and date', () => {
        const { merchant, date } = parsed();
        expect({ merchant, date }).toEqual({ merchant: f.expected.merchant, date: f.expected.date });
      });

      check('marked high confidence', () => {
        expect(parsed().confidence).toBe('high');
      });
    });
  }
});
