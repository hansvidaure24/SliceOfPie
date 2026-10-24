import { describe, it, expect } from 'vitest';
import { parseReceipt, linesToText, textToLines, type ParsedReceipt } from '../src/scan/parse';
import { processReceipt } from '../src/scan/process';
import type { OcrEngine } from '../src/scan/engine';

const texts = import.meta.glob<string>('./fixtures/receipts/*.txt', { query: '?raw', import: 'default', eager: true });
const expected = import.meta.glob<ParsedReceipt>('./fixtures/receipts/*.json', { import: 'default', eager: true });

// Fixture dates are checked against a fixed "today" so they don't expire
const opts = { today: new Date('2026-10-23T12:00:00Z') };

const fixtures = Object.entries(texts).map(([path, text]) => ({
  name: path.replace(/^.*\/(.+)\.txt$/, '$1'),
  text,
  expected: expected[path.replace(/\.txt$/, '.json')],
}));

describe('receipt fixtures', () => {
  it('has fixtures to run', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const f of fixtures) {
    describe(f.name, () => {
      it('has an expected .json', () => {
        expect(f.expected).toBeDefined();
      });

      it('parses to the expected receipt', () => {
        expect(parseReceipt(f.text, opts)).toEqual(f.expected);
      });

      it('parses the same from text and from OCR lines', () => {
        expect(parseReceipt(textToLines(f.text), opts)).toEqual(parseReceipt(linesToText(textToLines(f.text)), opts));
      });

      it('parses the same through processReceipt', async () => {
        const engine: OcrEngine = {
          isAvailable: () => true,
          recognize: async () => textToLines(f.text),
        };
        const { lines, ...result } = await processReceipt(new Blob(), { engine, parse: opts });
        expect(lines.length).toBeGreaterThan(0);
        expect(result).toEqual(f.expected);
      });
    });
  }
});
