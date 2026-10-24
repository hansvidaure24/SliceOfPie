import { describe, it, expect } from 'vitest';
import { parseReceipt, linesToText, textToLines, type ParseOptions } from '../src/scan/parse';
import type { OcrLine } from '../src/scan/engine';

const TODAY = new Date('2026-10-23T12:00:00Z');
const parse = (text: string, opts: ParseOptions = {}) => parseReceipt(text, { today: TODAY, ...opts });
const items = (text: string, opts: ParseOptions = {}) => parse(text, opts).items;
const names = (text: string) => items(text).map(i => i.name);

// Lines with boxes, as PaddleOCR returns them: [text, x0, y0, x1, y1]
const boxed = (rows: [string, number, number, number, number][]): OcrLine[] =>
  rows.map(([text, x0, y0, x1, y1]) => ({ text, score: 0.99, box: [x0, y0, x1, y1] }));

describe('parseReceipt', () => {
  it('returns an empty receipt for empty or price-less text', () => {
    const empty = { merchant: null, date: null, items: [], subtotal: null, discount: 0, tax: 0, taxIncluded: false, tip: null, total: null, confidence: 'low' };
    expect(parse('')).toEqual(empty);
    expect(parse('123 Main St\n\n')).toEqual(empty);
  });

  it('reads a trailing price as an item', () => {
    expect(items('Burger 12.50')).toEqual([{ name: 'Burger', price: 12.5 }]);
  });

  it('accepts text or OCR lines', () => {
    const text = 'Burger 12.50\r\nFries 4.00\r\n';
    expect(parseReceipt(text)).toEqual(parseReceipt(textToLines(text)));
  });

  describe('amounts', () => {
    it.each([
      ['Fries $ 4.50', 4.5],
      ['Laptop 1,234.56', 1234.56],
      ['Laptop 1.234,56', 1234.56],
      ['Cappuccino 3,50', 3.5],
      ['Croissant 2,40 €', 2.4],
      ['Milk 3.49 T', 3.49],
      ["Ticket 1'234.50", 1234.5],
    ])('reads %j', (line, price) => {
      expect(items(line)).toEqual([expect.objectContaining({ price })]);
    });

    it('ignores prices without two decimals', () => {
      expect(items('Ramen 1200')).toEqual([]);
    });

    it('rejects mixed-up separators', () => {
      expect(items('Thing 1,234,56')).toEqual([]);
    });

    it('drops prices at or above 10,000 and zero-price modifiers', () => {
      expect(items('Car 10,000.00\nSUBSTITUTE Udon $0.00')).toEqual([]);
    });

    it('reads whole amounts for zero-decimal currencies when marked or grouped', () => {
      expect(items('Ramen ¥800\nGyoza 1,200\nTable 12', { zeroDecimal: true }).map(i => i.price)).toEqual([800, 1200]);
    });

    it('does not read zip codes as amounts in zero-decimal currencies', () => {
      expect(items('Bayside, NY 11361', { zeroDecimal: true })).toEqual([]);
    });

    it('does not read decorative dashes as a minus sign', () => {
      expect(parse('Pizza 18.99\n--- TOTAL --- 18.99').total).toBe(18.99);
    });
  });

  describe('items region', () => {
    it.each([
      'VISA 21.50', 'Cash 25.00', 'Change 3.50', 'Server: Maria Table 12.00',
    ])('skips payment and metadata line %j', line => {
      expect(items(line)).toEqual([]);
    });

    it('stops reading items at the first subtotal or total', () => {
      // "Stamp Club" matches no keyword list; only the cutoff keeps it out
      const r = parse('Cafe 3,50\nTOTAL 3,50\nStamp Club 3,50');
      expect(r.items).toEqual([{ name: 'Cafe', price: 3.5 }]);
    });

    it('treats a total labelled AMT as the total, not an item', () => {
      const r = parse('1 Americano $3.19\nAMT $3.19');
      expect(r.items).toEqual([{ name: 'Americano', price: 3.19 }]);
      expect(r.total).toBe(3.19);
    });

    it('collects discounts separately', () => {
      const r = parse('Milk 6.49\nDISCOUNT MEMBER -1.00\nBread 4.51\nSUBTOTAL 10.00');
      expect(r.items.map(i => i.price)).toEqual([6.49, 4.51]);
      expect(r.discount).toBe(1);
      expect(r.confidence).toBe('high');
    });
  });

  describe('quantities', () => {
    it('splits a leading count into unit items', () => {
      expect(items('3 Tacos 9.00')).toEqual([
        { name: 'Tacos', price: 3 }, { name: 'Tacos', price: 3 }, { name: 'Tacos', price: 3 },
      ]);
    });

    it('splits "2x" and "2 x" counts', () => {
      expect(items('2x Milkshake 13.00').map(i => i.price)).toEqual([6.5, 6.5]);
      expect(items('2 x Milkshake 13.00').map(i => i.name)).toEqual(['Milkshake', 'Milkshake']);
    });

    it('uses an "@ unit price" when it adds up', () => {
      expect(items('Soda 3 @ 2.50 7.50')).toEqual([
        { name: 'Soda', price: 2.5 }, { name: 'Soda', price: 2.5 }, { name: 'Soda', price: 2.5 },
      ]);
    });

    it('does not split when the total does not divide by the count (likely a misread)', () => {
      expect(items('7 Almond Scone $1.99')).toEqual([{ name: '7 Almond Scone', price: 1.99 }]);
      expect(items('3 Soda 10.00')).toEqual([{ name: '3 Soda', price: 10 }]);
    });

    it('strips a count of 1', () => {
      expect(names('1 16oz Bottle Water $2.99')).toEqual(['16oz Bottle Water']);
    });

    it('does not treat a unit measure as a count', () => {
      expect(names('12 oz Coffee 11.49\n2 lb Bananas 1.18')).toEqual(['12 oz Coffee', '2 lb Bananas']);
    });

    it('does not split counts of 20 or more', () => {
      expect(items('24 Wings 30.00')).toEqual([{ name: '24 Wings', price: 30 }]);
    });
  });

  describe('names', () => {
    it('falls back to "Item" when the name is missing or too short', () => {
      expect(names('12.00\nx 4.00')).toEqual(['Item', 'Item']);
    });

    it('keeps accents and brackets, drops OCR junk and dot leaders', () => {
      expect(names('Crème brûlée ..... 7.95\nCold Cut Chicken(spicy) 9.25\nG@rlic Knots (6) ,, 6.50'))
        .toEqual(['Crème brûlée', 'Cold Cut Chicken(spicy)', 'G rlic Knots (6)']);
    });

    it('drops a stray misread letter before an item code', () => {
      expect(names('e A12 Cold Cut Chicken $9.25')).toEqual(['A12 Cold Cut Chicken']);
    });

    it('truncates names to 80 characters', () => {
      expect(names('A'.repeat(100) + ' 5.00')).toEqual(['A'.repeat(80)]);
    });

    it('joins a name that wraps above its price', () => {
      expect(names('1 A2 Coconut Mango Juice Sago & Pomelo w.\nMango Ice Cream $9.75\nAdd-Rice Ball $1.00'))
        .toEqual(['A2 Coconut Mango Juice Sago & Pomelo w. Mango Ice Cream', 'Add-Rice Ball']);
    });

    it('joins a name that wraps below its price, skipping CJK fragments', () => {
      const lines = boxed([
        ['R1 Supreme Fish $17.70', 543, 380, 1149, 427],
        ['Maw Chicken', 548, 421, 758, 455],
        ['R1', 552, 456, 774, 487],
        ['Quail Egg(3) $3.00', 618, 491, 1127, 535],
      ]);
      expect(parseReceipt(lines).items.map(i => i.name)).toEqual(['R1 Supreme Fish Maw Chicken', 'Quail Egg(3)']);
    });

    it('does not join a menu section heading to the item above it', () => {
      expect(names('Oyster 12.50\nDesserts\nFudge Cake 4.25')).toEqual(['Oyster', 'Fudge Cake']);
      expect(names('Wings 9.00\nDrinks:\nSoda 2.50')).toEqual(['Wings', 'Soda']);
    });

    it('does not join anything below a "1 x Item" line', () => {
      expect(names('1 x Fudge Cake $4.25\nRemove this block')).toEqual(['Fudge Cake']);
    });

    it('does not join a line that is far below or off to the side', () => {
      const lines = boxed([
        ['Burger $12.50', 40, 100, 600, 130],
        ['Thank you', 40, 300, 300, 330],
        ['Fries $4.00', 40, 400, 600, 430],
        ['Side note', 400, 432, 600, 460],
      ]);
      expect(parseReceipt(lines).items.map(i => i.name)).toEqual(['Burger', 'Fries']);
    });
  });

  describe('totals', () => {
    it('reads subtotal, tax and total and marks a receipt that adds up', () => {
      const r = parse('Burger 10.00\nFries 2.00\nSubtotal 12.00\nSales Tax 8.25% 0.99\nTOTAL 12.99');
      expect(r).toMatchObject({ subtotal: 12, tax: 0.99, tip: null, total: 12.99, confidence: 'high' });
    });

    it('picks the total that includes a printed tip', () => {
      const r = parse('Soup 100.00\nSubtotal 100.00\nTax 9.00\nBill Total 109.00\nTips 20.00\nPayment Total 129.00\nCard Authorization: 129.00');
      expect(r).toMatchObject({ subtotal: 100, tax: 9, tip: 20, total: 129, confidence: 'high' });
      expect(r.items).toHaveLength(1);
    });

    it('ignores a suggested-tip table', () => {
      expect(parse('Pasta 20.00\nTotal 20.00\nTip 15%: 3.00\nTip 18%: 3.60\nTip 20%: 4.00').tip).toBeNull();
      expect(parse('Pasta 20.00\nTotal 20.00\nTip suggested 18%: 3.60').tip).toBeNull();
    });

    it('adds tax lines that apply together (GST + PST)', () => {
      expect(parse('Item 100.00\nSubtotal 100.00\nGST 5.00\nPST 7.00\nTotal 112.00')).toMatchObject({ tax: 12, confidence: 'high' });
    });

    it('takes one of several tax lines when that is what adds up', () => {
      expect(parse('Item 100.00\nSubtotal 100.00\nTax 8.00\nTotal tax 8.00\nTotal 108.00').tax).toBe(8);
    });

    it('detects tax already included in the prices', () => {
      const r = parse('Cappuccino 3,50\nTarte 6,90\nSous-total 10,40\nTVA 10% 0,95\nTOTAL 10,40');
      expect(r).toMatchObject({ tax: 0.95, taxIncluded: true, total: 10.4, confidence: 'high' });
    });

    it('reads "Total incl. VAT" as the total', () => {
      expect(parse('Wurst 5,00\nSumme inkl. MwSt 5,00').total).toBe(5);
    });

    it('marks low confidence when items do not match the subtotal', () => {
      expect(parse('Burger 10.00\nSubtotal 15.00\nTotal 15.00').confidence).toBe('low');
    });

    it('marks low confidence when nothing confirms the items', () => {
      expect(parse('Burger 10.00').confidence).toBe('low');
    });
  });

  describe('merchant', () => {
    it('takes the first name-like line at the top, without decoration or store number', () => {
      expect(parse('~ ~ JOE\'S PIZZA ~ ~\nPizza 9.00').merchant).toBe("JOE'S PIZZA");
      expect(parse('FRESH MART #0427\nwww.freshmart.com\nMilk 3.00').merchant).toBe('FRESH MART');
    });

    it('skips addresses, phone numbers and table info', () => {
      expect(parse('Table: C3 * Guests: 6\nSoup 9.00').merchant).toBeNull();
      expect(parse('1211 Green Street\nTel (555) 123-4567\nSoup 9.00').merchant).toBeNull();
    });

    it('only looks above the first price', () => {
      expect(parse('Soup 9.00\nThank you for visiting').merchant).toBeNull();
    });
  });

  describe('date', () => {
    it.each([
      ['12/27/2019 08:26 PM', '2019-12-27'],
      ['Ordered: 10/16/26 8:53 PM', '2026-10-16'],
      ['2026-03-04', '2026-03-04'],
      ['27.12.2019', '2019-12-27'],
      ['12 Oct 2026', '2026-10-12'],
      ['Oct 12, 2026', '2026-10-12'],
    ])('reads %j', (line, date) => {
      expect(parse(line).date).toBe(date);
    });

    it('reads an ambiguous date month-first or day-first per currency', () => {
      expect(parse('03/04/2026').date).toBe('2026-03-04');
      expect(parse('03/04/2026', { monthFirst: false }).date).toBe('2026-04-03');
    });

    it('rejects impossible and future dates', () => {
      expect(parse('02/30/2026').date).toBeNull();
      expect(parse('12/25/2026').date).toBeNull();
    });

    it('does not read phone numbers or addresses as dates', () => {
      expect(parse('Tel (555) 123-4567\n38-17 Bell Blvd').date).toBeNull();
    });
  });
});

describe('linesToText', () => {
  it('joins line texts with newlines', () => {
    expect(linesToText([{ text: 'a' }, { text: 'b', score: 0.9 }])).toBe('a\nb');
    expect(linesToText([])).toBe('');
  });
});

describe('textToLines', () => {
  it('splits, trims and drops blank lines', () => {
    expect(textToLines('  Burger 12.50 \r\n\n\nFries 4.00\n  \n')).toEqual([{ text: 'Burger 12.50' }, { text: 'Fries 4.00' }]);
  });
});
