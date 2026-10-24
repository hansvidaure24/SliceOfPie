import { describe, it, expect } from 'vitest';
import { parseReceipt, linesToText, type ParsedReceipt } from '../src/scan/parse';
import { textToLines } from '../src/scan/engine-tesseract';
import { processReceipt } from '../src/scan/process';
import type { OcrEngine } from '../src/scan/engine';

const texts = import.meta.glob<string>('./fixtures/receipts/*.txt', { query: '?raw', import: 'default', eager: true });
const expected = import.meta.glob<ParsedReceipt>('./fixtures/receipts/*.json', { import: 'default', eager: true });

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

      it('parses to the expected items and tax', () => {
        expect(parseReceipt(f.text)).toEqual(f.expected);
      });

      // Guards the refactor: going through OcrLine[] must not change the result
      it('parses the same through the engine line round-trip', () => {
        expect(parseReceipt(linesToText(textToLines(f.text)))).toEqual(parseReceipt(f.text));
      });

      it('parses the same through processReceipt', async () => {
        const engine: OcrEngine = {
          isAvailable: () => true,
          recognize: async () => textToLines(f.text),
        };
        const result = await processReceipt(new Blob(), { engine });
        expect({ items: result.items, tax: result.tax }).toEqual(f.expected);
      });
    });
  }
});
