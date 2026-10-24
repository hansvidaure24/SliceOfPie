import type { OcrLine } from './engine';

export interface ParsedReceipt {
  merchant: string | null;
  // ISO yyyy-mm-dd
  date: string | null;
  items: { name: string; price: number }[];
  subtotal: number | null;
  // Positive amount taken off by discount/coupon lines among the items
  discount: number;
  tax: number;
  // Tax is already inside the item prices (common on EU receipts)
  taxIncluded: boolean;
  // A tip printed on the receipt (not a suggested-tip table)
  tip: number | null;
  // The final amount paid, including any printed tip
  total: number | null;
  // 'high' when the amounts add up; 'low' means the user should check the items
  confidence: 'high' | 'low';
}

export interface ParseOptions {
  // Currencies printed without decimals (¥, ₩, ...); also accepts "1,200" and "¥800"
  zeroDecimal?: boolean;
  // How to read ambiguous dates like 03/04/2026 (true = March 4)
  monthFirst?: boolean;
  // Dates after this are rejected as misreads
  today?: Date;
}

export function textToLines(text: string): OcrLine[] {
  return text.replace(/\r/g, '').split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(text => ({ text }));
}

export function linesToText(lines: OcrLine[]): string {
  return lines.map(l => l.text).join('\n');
}

// ── Amounts ──

const SYMBOL = String.raw`(?:R\$|Rp|RM|kr|zł|Kč|Ft|CHF|lei|S\/|[$€£¥￥₩₱₹₫₪₦฿₺])`;

// A trailing amount like "$ 1,234.56", "1.234,56 €", "-1.00", "(2.50)" or "12.50 T"
// (a tax-code letter). The first group is the boundary character so the label
// can be sliced off without lookbehind, which older Safari can't parse.
const DECIMAL_AMOUNT = new RegExp(
  // Signs must touch the number ("-1.00", "$-1.00", "1.00-") so "--- TOTAL --- 39.68" isn't negative
  String.raw`(^|[^\d.,])([-−(])?${SYMBOL}?\s*([-−])?(\d{1,3}(?:[.,']\d{3})+|\d+)([.,])(\d{2})(?!\d)([-−)])?\s*${SYMBOL}?\s*(?:[A-Z]|\*)?\s*$`,
);
const INTEGER_AMOUNT = new RegExp(
  String.raw`(^|[^\d.,])([-−])?\s*(${SYMBOL})?\s*(\d{1,3}(?:[.,]\d{3})+|\d+)\s*(円|원|₫|đ)?\s*$`,
);

interface Amount { value: number; label: string }

function findAmount(text: string, zeroDecimal: boolean): Amount | null {
  const m = text.match(DECIMAL_AMOUNT);
  if (m) {
    const [, boundary, lead, sign, int, sep, dec, trail] = m;
    // "1,234,56" and "1.234.56" mix separators the same way; not a price
    if (/[.,']/.test(int) && int.replace(/\d/g, '')[0] === sep) return null;
    const value = parseFloat(int.replace(/[.,']/g, '') + '.' + dec);
    // A dash right after another dash is a rule ("---1.00"), not a sign
    const negative = !!((lead && !/[-−]/.test(boundary)) || sign || trail);
    return { value: negative ? -value : value, label: text.slice(0, m.index! + boundary.length) };
  }
  if (!zeroDecimal) return null;
  const z = text.match(INTEGER_AMOUNT);
  // Bare integers are too often zip codes or order numbers; need a symbol, suffix or grouping
  if (!z || !(z[3] || z[5] || /[.,]/.test(z[4]))) return null;
  const value = parseInt(z[4].replace(/[.,]/g, ''), 10);
  return { value: z[2] ? -value : value, label: text.slice(0, z.index! + z[1].length) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.015;

// ── Line classification ──

const SUBTOTAL = /\b(sub[\s-]?total|sous[\s-]?total|zwischensumme|subtotale|net\s+total)\b/i;
const TAX = /\b(tax(es)?|hst|gst|pst|qst|vat|tva|iva|mwst|ust|btw|igv|ppn)\b/i;
const TAX_INCLUDED = /\b(incl(uded|\.|usive)?|inkl\.?|enthalten|incluse?|incluido)\b/i;
const TIP = /\b(tips?|gratuity|service\s+charge|pourboire|trinkgeld|propina|mancia)\b/i;
const TIP_SUGGESTION = /suggest|guide|recommend|calculat/i;
const STRONG_TOTAL = /\b(grand\s+total|total|balance(\s+due)?|amount\s+due|to\s+pay|summe|gesamt(betrag)?|totale|importe|montant)\b/i;
const WEAK_TOTAL = /\b(amt|amount)\b/i;
const DISCOUNT = /\b(discount|coupon|promo|savings?|saved|rabatt|remise|descuento)\b/i;
const PAYMENT = /\b(visa|master\s*card|mastercard|amex|american\s+express|discover|cash|change|tender(ed)?|card|debit|credit|paid|auth(orization)?|approved|carte|bancaire|cb|chip|contactless|refund)\b/i;
const META = /\b(table|server|guests?|cashier|host|order|date|time|receipt|invoice|thank|welcome|phone|tel|fax|www\.|\.com|rewards|points|check\s*#|tab)\b/i;
const ADDRESS = /\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|lane|ln|suite|ste|hwy|way|plaza|ct|court|pl)\b\.?|\b[A-Z]{2}\s+\d{5}\b/i;
const PHONE = /\(\d{3}\)|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;

type Kind = 'subtotal' | 'tax' | 'tip' | 'total' | 'discount' | 'payment' | 'meta' | 'item';

function classify(label: string, value: number): Kind {
  if (SUBTOTAL.test(label)) return 'subtotal';
  if (TIP.test(label)) return 'tip';
  // "Total incl. VAT 19,40" is a total that mentions tax, not a tax line
  if (STRONG_TOTAL.test(label) && TAX_INCLUDED.test(label)) return 'total';
  if (TAX.test(label)) return 'tax';
  if (DISCOUNT.test(label) || value < 0) return 'discount';
  if (STRONG_TOTAL.test(label)) return 'total';
  if (PAYMENT.test(label)) return 'payment';
  if (WEAK_TOTAL.test(label)) return 'total';
  if (META.test(label)) return 'meta';
  return 'item';
}

// ── Item names ──

const QTY_X = /^(\d{1,2})\s*[xX×]\s+/;
const QTY_LEADING = /^(\d{1,2})\s+(?!(?:oz|fl|ml|g|kg|lb|lbs|pc|pcs|ct|ea|in|pt|qt|gal|l)\b)/i;
// "2 @ 6.50" or "Milkshake 2 x $6.50": a count and a unit price inside the label
const QTY_AT = /(?:^|\s)(\d{1,2})\s*[@xX×]\s*\S*?(\d+[.,]\d{2})\b/;

function cleanName(raw: string): string {
  return raw
    .replace(/(?:\.\s*){2,}|[-_=~*]{2,}/g, ' ')           // dot leaders and rules
    .replace(/[^\p{L}\p{N} &'/.#()%+,-]/gu, ' ')
    .replace(/^[^\p{L}\p{N}(]+/u, '')                     // leading decoration
    .replace(/^[b-hj-z]\s+(?=\p{Lu}|\p{N})/u, '')         // a stray misread like "e A12 ..." (was a "1")
    .replace(/[\s,:;-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function splitQty(rawName: string, price: number): { name: string; prices: number[] } {
  let name = rawName.trim();
  let qty = 1;
  let unit: number | null = null;

  const at = name.match(QTY_AT);
  if (at) {
    qty = parseInt(at[1], 10);
    unit = parseFloat(at[2].replace(',', '.'));
    name = name.slice(0, at.index) + ' ' + name.slice(at.index! + at[0].length);
  }
  const lead = name.match(QTY_X) ?? name.match(QTY_LEADING);
  if (lead) {
    const n = parseInt(lead[1], 10);
    // 20+ is more likely part of the name ("24 Wings") than a count
    if (n > 0 && n < 20) {
      if (qty === 1) qty = n;
      name = name.slice(lead[0].length);
    }
  }

  name = cleanName(name);
  if (name.length < 2) name = 'Item';
  if (name.length > 80) name = name.slice(0, 80).trim();

  if (qty < 2 || qty >= 20) return { name, prices: [price] };
  // A real count divides the line total evenly (3 × 3.99 = 11.97) or comes with
  // a matching "@ unit price". Otherwise the digit is probably a misread "1"
  // ("7 Almond Scone 1.99"), so keep one item and leave the number visible.
  const each = unit !== null && near(unit * qty, price) ? unit
    : Math.round(price * 100) % qty === 0 ? round2(price / qty) : null;
  if (each === null) return { name: cleanName(rawName) || 'Item', prices: [price] };
  // Split into unit items so each can go to a different person
  return { name, prices: Array.from({ length: qty }, () => each) };
}

// ── Merchant and date ──

function findMerchant(lines: OcrLine[], firstAmountLine: number): string | null {
  for (const line of lines.slice(0, Math.min(4, firstAmountLine))) {
    const t = line.text;
    if (line.score !== undefined && line.score < 0.8) continue;
    if (!/\p{L}{3,}/u.test(t) || t.includes(':')) continue;
    if (META.test(t) || ADDRESS.test(t) || PHONE.test(t) || findDate(t, {})) continue;
    if ((t.match(/\d/g) ?? []).length > (t.match(/\p{L}/gu) ?? []).length) continue;
    const name = t
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}.)!']+$/gu, '')
      .replace(/\s*#\s*\d+$/, '')                             // store number
      .trim();
    if (name.length >= 3) return name;
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function validDate(y: number, m: number, d: number, today: Date): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;                // e.g. Feb 30
  // Allow a day of slack for time zones; anything later is a misread
  if (date.getTime() > today.getTime() + 86400000) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function findDate(text: string, opts: ParseOptions): string | null {
  const today = opts.today ?? new Date();
  const monthFirst = opts.monthFirst ?? true;

  const iso = text.match(/(?:^|\D)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (iso) {
    const d = validDate(+iso[1], +iso[2], +iso[3], today);
    if (d) return d;
  }

  const num = text.match(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?!\d)/);
  if (num) {
    const [a, b, y] = [+num[1], +num[2], +num[3]];
    const [first, second] = monthFirst ? [[a, b], [b, a]] : [[b, a], [a, b]];
    const d = validDate(y, first[0], first[1], today) ?? validDate(y, second[0], second[1], today);
    if (d) return d;
  }

  const lower = text.toLowerCase();
  const dmy = lower.match(/\b(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4}|\d{2})\b/);
  if (dmy && MONTHS.includes(dmy[2])) {
    const d = validDate(+dmy[3], MONTHS.indexOf(dmy[2]) + 1, +dmy[1], today);
    if (d) return d;
  }
  const mdy = lower.match(/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mdy && MONTHS.includes(mdy[1])) {
    const d = validDate(+mdy[3], MONTHS.indexOf(mdy[1]) + 1, +mdy[2], today);
    if (d) return d;
  }
  return null;
}

// ── Multi-line item names ──

const startsWithQty = (t: string) => /^\d{1,2}\s*[xX×]?\s+\p{L}/u.test(t);

// Boxes are only present for PaddleOCR lines. Without them, fall back to
// "the very next line".
function adjacent(above: OcrLine, below: OcrLine): boolean {
  if (!above.box || !below.box) return true;
  const h = above.box[3] - above.box[1];
  return below.box[1] - above.box[3] < 0.8 * h && Math.abs(below.box[0] - above.box[0]) < 2 * h;
}

// Menu section headings ("Mains", "Desserts") sit right under the last item of
// the previous section and look just like a wrapped name
const SECTION = /^(mains?|main\s+courses?|starters?|appeti[sz]ers?|apps|entr[ée]es?|sides?|desserts?|sweets|drinks?|beverages?|bar|cocktails?|wines?|beers?|salads?|soups?|kids|specials?|breakfast|brunch|lunch|dinner|food|sandwiches|burgers?|pizzas?|pastas?|sushi|noodles|extras?|add[\s-]?ons?|bebidas|postres|boissons|vins|getränke|nachspeisen|vorspeisen|hauptgerichte)\s*:?$/i;

// A wrapped name line: real words, read confidently. Filters the fragments the
// Latin model makes of CJK lines ("A12()", "(3)", "B").
function looksLikeName(line: OcrLine): boolean {
  return /\p{L}{3,}/u.test(line.text) && (line.score === undefined || line.score >= 0.8)
    && !SECTION.test(line.text) && !META.test(line.text) && !PAYMENT.test(line.text) && !ADDRESS.test(line.text);
}

// "1 x Fudge Cake  $4.25" is a one-line-per-item layout; nothing below it is
// part of its name
const ONE_LINE_ITEM = /^\d{1,2}\s*[xX×]\s/;

// ── Parse ──

export function parseReceipt(input: string | OcrLine[], opts: ParseOptions = {}): ParsedReceipt {
  const lines = (typeof input === 'string' ? textToLines(input) : input)
    .map(l => ({ ...l, text: l.text.trim() }))
    .filter(l => l.text);
  const zeroDecimal = !!opts.zeroDecimal;

  const parsed = lines.map(line => {
    const amount = findAmount(line.text, zeroDecimal);
    return { line, amount, kind: amount ? classify(amount.label, amount.value) : null };
  });

  // Items stop at the first subtotal/total line; anything after is payment detail
  const firstSummary = parsed.findIndex(p => p.kind === 'subtotal' || p.kind === 'total');
  const itemsEnd = firstSummary < 0 ? parsed.length : firstSummary;
  const firstAmount = parsed.findIndex(p => p.amount);

  const items: { name: string; price: number }[] = [];
  let discount = 0;
  let prefix: string[] = [];
  let lastItem: { name: string; prices: number[]; line: OcrLine; oneLine: boolean } | null = null;
  const flush = () => {
    if (lastItem) for (const price of lastItem.prices) items.push({ name: lastItem.name, price });
    lastItem = null;
  };

  for (let i = 0; i < itemsEnd; i++) {
    const { line, amount, kind } = parsed[i];
    const next = parsed[i + 1];

    if (!amount) {
      // Name that wraps with the price on its last line ("1 A2 Coconut ... w." / "Mango Ice Cream $9.75")
      const leadsIntoItem = next?.kind === 'item' && adjacent(line, next.line);
      if (startsWithQty(line.text) && looksLikeName(line) && leadsIntoItem) {
        flush();
        prefix = [line.text];
      } else if (prefix.length && leadsIntoItem && looksLikeName(line)) {
        prefix.push(line.text);
      } else if (lastItem && !lastItem.oneLine && !prefix.length && looksLikeName(line) && !startsWithQty(line.text) && adjacent(lastItem.line, line)) {
        // Name that wraps below the price ("R1 Supreme Fish $17.70" / "Maw Chicken")
        lastItem.name = cleanName(lastItem.name + ' ' + line.text).slice(0, 80);
        lastItem.line = line;
      } else {
        flush();
        prefix = [];
      }
      continue;
    }

    flush();
    if (kind === 'discount') {
      discount += Math.abs(amount.value);
    } else if (kind === 'item' && amount.value > 0 && amount.value < 10000) {
      // $10k ceiling covers electronics/Amazon splits; $0.00 modifiers don't change anyone's share
      const { name, prices } = splitQty([...prefix, amount.label].join(' '), amount.value);
      lastItem = { name, prices, line, oneLine: !prefix.length && ONE_LINE_ITEM.test(amount.label) };
    }
    prefix = [];
  }
  flush();

  // Summary lines, read from the whole receipt
  const of = (k: Kind) => parsed.filter(p => p.kind === k).map(p => ({ value: p.amount!.value, label: p.amount!.label }));
  const subtotals = of('subtotal');
  const subtotal = subtotals.length ? subtotals[subtotals.length - 1].value : null;

  const taxLines = of('tax').filter(t => t.value > 0);
  const taxSum = round2(taxLines.reduce((s, t) => s + t.value, 0));
  const taxMax = Math.max(0, ...taxLines.map(t => t.value));
  let taxIncluded = taxLines.some(t => TAX_INCLUDED.test(t.label));

  // Several tip lines with percentages are a suggestion table, not a tip
  const tipLines = of('tip').filter(t => t.value > 0 && !TIP_SUGGESTION.test(t.label));
  const tipTable = tipLines.filter(t => /%/.test(t.label)).length >= 2;
  const tip = tipLines.length && !tipTable ? round2(tipLines.reduce((s, t) => s + t.value, 0)) : null;

  const strongTotals = parsed.filter(p => p.kind === 'total' && STRONG_TOTAL.test(p.amount!.label)).map(p => p.amount!.value);
  const totals = of('total').map(t => t.value);

  // Pick the total and the reading of the tax lines (summed, e.g. GST + PST, or
  // one of them) that make the receipt add up
  const itemsSum = round2(items.reduce((s, it) => s + it.price, 0));
  const base = subtotal ?? round2(itemsSum - discount);
  let total: number | null = null;
  let tax = taxLines.length > 1 && new Set(taxLines.map(t => t.label.replace(/[\d.,%\s]+/g, ' ').trim().toLowerCase())).size === taxLines.length
    ? taxSum : taxMax;
  let consistent = false;
  search:
  for (const incl of [taxIncluded, !taxIncluded]) {
    for (const t of [taxSum, taxMax]) {
      for (const tp of tip ? [tip, 0] : [0]) {
        const want = base + (incl ? 0 : t) + tp;
        const hit = totals.find(v => near(v, want));
        if (hit !== undefined) {
          total = hit;
          tax = t;
          taxIncluded = incl && t > 0;
          consistent = true;
          break search;
        }
      }
    }
  }
  if (total === null && totals.length) {
    total = strongTotals.length ? Math.max(...strongTotals) : Math.max(...totals);
  }

  const itemsMatchSubtotal = subtotal === null || near(itemsSum - discount, subtotal);
  const confidence = items.length > 0 && itemsMatchSubtotal && (consistent || (total === null && subtotal !== null))
    ? 'high' : 'low';

  return {
    merchant: findMerchant(lines, firstAmount < 0 ? lines.length : firstAmount),
    date: lines.map(l => findDate(l.text, opts)).find(Boolean) ?? null,
    items,
    subtotal,
    discount: round2(discount),
    tax: round2(tax),
    taxIncluded,
    tip,
    total,
    confidence,
  };
}
