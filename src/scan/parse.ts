import type { OcrLine } from './engine';

export interface ParsedReceipt {
  items: { name: string; price: number }[];
  tax: number;
}

export function linesToText(lines: OcrLine[]): string {
  return lines.map(l => l.text).join('\n');
}

export function parseReceipt(text: string): ParsedReceipt {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);

  // Lines containing these words are totals, metadata, or payment info — not items
  const SKIP = /\b(total|subtotal|sub-total|balance|change|visa|master|amex|discover|cash|gratuity|tip|payment|tender|amount due|amount paid|card|debit|credit|check|table|server|guest|order|date|time|receipt|thank|welcome|phone|tel|fax|www\.|\.com|discount|coupon|promo|rewards|points|savings|refund)\b/i;
  const TAX = /\b(tax|hst|gst|pst|vat|sales tax)\b/i;
  const QTY_PREFIX = /^\d+\s*[xX@]\s*/;
  const QTY_LEADING = /^(\d+)\s+(?!oz|fl|ml|g\b|kg|lb|pc|ct|ea|in|pt|qt|gal|l\b)/i;

  // Try $-prefixed first, then bare decimal, then comma-decimal (European)
  const pricePatterns = [
    /\$\s*(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/,
    /(\d{1,3}(?:,\d{3})*\.\d{2})\s*$/,
    /(\d{1,4},\d{2})\s*$/,
  ];

  const result: ParsedReceipt = { items: [], tax: 0 };

  for (const line of lines) {
    let price = 0;
    let matchEnd = line.length;

    for (const pattern of pricePatterns) {
      const match = line.match(pattern);
      if (match) {
        price = parseFloat(match[1].replace(/,(\d{3})/g, '$1').replace(',', '.'));
        matchEnd = match.index!;
        break;
      }
    }
    if (!price) continue;
    if (SKIP.test(line)) continue;

    if (TAX.test(line)) {
      result.tax = Math.max(result.tax, price);
      continue;
    }

    let name = line.slice(0, matchEnd)
      .replace(/\$\s*\d+\.\d{2}/g, '')
      .replace(/[^a-zA-Z0-9 &'/.#-]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Strip quantity prefixes like "2x" or "3 X" and split into individual items
    name = name.replace(QTY_PREFIX, '');
    const qtyMatch = name.match(QTY_LEADING);
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;
    if (qtyMatch && qty > 0 && qty < 20) name = name.replace(QTY_LEADING, '');

    if (!name || name.length < 2) name = 'Item';
    if (name.length > 40) name = name.slice(0, 40).trim();

    // $10k ceiling covers electronics/Amazon splits
    if (price > 0 && price < 10000) {
      if (qty > 1 && qty < 20) {
        const each = Math.round((price / qty) * 100) / 100;
        for (let q = 0; q < qty; q++) result.items.push({ name, price: each });
      } else {
        result.items.push({ name, price });
      }
    }
  }

  return result;
}
