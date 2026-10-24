import { describe, it, expect } from 'vitest';
import { parseReceipt, linesToText } from '../src/scan/parse';

const items = (text: string) => parseReceipt(text).items;

describe('parseReceipt', () => {
  it('returns nothing for empty or price-less text', () => {
    expect(parseReceipt('')).toEqual({ items: [], tax: 0 });
    expect(parseReceipt('JOE\'S DINER\n123 Main St\n\n')).toEqual({ items: [], tax: 0 });
  });

  it('reads a trailing price as an item', () => {
    expect(items('Burger 12.50')).toEqual([{ name: 'Burger', price: 12.5 }]);
  });

  it('handles CRLF line endings', () => {
    expect(items('Burger 12.50\r\nFries 4.00\r\n')).toEqual([
      { name: 'Burger', price: 12.5 },
      { name: 'Fries', price: 4 },
    ]);
  });

  describe('price formats', () => {
    it('strips a $ prefix from the name', () => {
      expect(items('Fries $ 4.50')).toEqual([{ name: 'Fries', price: 4.5 }]);
    });

    it('reads thousands separators', () => {
      expect(items('Laptop 1,234.56')).toEqual([{ name: 'Laptop', price: 1234.56 }]);
    });

    it('reads comma decimals', () => {
      expect(items('Cappuccino 3,50')).toEqual([{ name: 'Cappuccino', price: 3.5 }]);
    });

    it('drops prices at or above 10,000', () => {
      expect(items('Car 10,000.00')).toEqual([]);
    });

    it('ignores prices without two decimals', () => {
      expect(items('Ramen 1200')).toEqual([]);
    });
  });

  describe('skipped lines', () => {
    it.each([
      'Subtotal 20.00', 'TOTAL 21.50', 'Balance Due 21.50', 'VISA 21.50', 'Cash 25.00',
      'Change 3.50', 'Tip 4.00', 'Discount 2.00', 'Sous-total 19,40',
    ])('skips %j', line => {
      expect(parseReceipt(line)).toEqual({ items: [], tax: 0 });
    });
  });

  describe('tax', () => {
    it('takes tax lines out of the items', () => {
      expect(parseReceipt('Burger 10.00\nSales Tax 0.83')).toEqual({
        items: [{ name: 'Burger', price: 10 }],
        tax: 0.83,
      });
    });

    it('keeps the largest of several tax lines', () => {
      expect(parseReceipt('GST 5% 1.44\nHST 13% 3.75\nVAT 0.50').tax).toBe(3.75);
    });
  });

  describe('quantities', () => {
    it('splits a leading count into unit items', () => {
      expect(items('3 Tacos 9.00')).toEqual([
        { name: 'Tacos', price: 3 },
        { name: 'Tacos', price: 3 },
        { name: 'Tacos', price: 3 },
      ]);
    });

    it('rounds each unit to cents', () => {
      expect(items('3 Soda 10.00').map(i => i.price)).toEqual([3.33, 3.33, 3.33]);
    });

    it('strips an "Nx" prefix but does not split it (current behavior)', () => {
      expect(items('2x Milkshake 13.00')).toEqual([{ name: 'Milkshake', price: 13 }]);
    });

    it('does not treat a unit measure as a count', () => {
      expect(items('12 oz Coffee 11.49')).toEqual([{ name: '12 oz Coffee', price: 11.49 }]);
      expect(items('2 lb Bananas 1.18')).toEqual([{ name: '2 lb Bananas', price: 1.18 }]);
    });

    it('does not split counts of 20 or more', () => {
      expect(items('24 Wings 30.00')).toEqual([{ name: '24 Wings', price: 30 }]);
    });
  });

  describe('names', () => {
    it('falls back to "Item" when the name is missing or too short', () => {
      expect(items('12.00')).toEqual([{ name: 'Item', price: 12 }]);
      expect(items('x 4.00')).toEqual([{ name: 'Item', price: 4 }]);
    });

    it('replaces OCR junk characters with spaces', () => {
      expect(items('G@rlic Knots (6) 6.50')).toEqual([{ name: 'G rlic Knots 6', price: 6.5 }]);
    });

    it('truncates names to 40 characters', () => {
      const [item] = items('A'.repeat(60) + ' 5.00');
      expect(item.name).toBe('A'.repeat(40));
    });
  });
});

describe('linesToText', () => {
  it('joins line texts with newlines', () => {
    expect(linesToText([{ text: 'a' }, { text: 'b', score: 0.9 }])).toBe('a\nb');
    expect(linesToText([])).toBe('');
  });
});
