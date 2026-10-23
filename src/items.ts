import { $, COLORS, esc, fmt } from './helpers';
import { state } from './state';
import { goTo } from './navigation';
import { renderAssign } from './assign';

declare const Tesseract: {
  recognize(file: File, lang: string, opts: {
    logger: (m: { status: string; progress: number }) => void;
  }): Promise<{ data: { text: string } }>;
};

export function takePhoto(): void {
  const input = $('photoInput') as HTMLInputElement;
  input.setAttribute('capture', 'environment');
  input.click();
}

export function uploadPhoto(): void {
  const input = $('photoInput') as HTMLInputElement;
  input.removeAttribute('capture');
  input.click();
}

export async function runOCR(file: File): Promise<void> {
  try {
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          ($('progressFill') as HTMLElement).style.width = pct + '%';
          $('progressText').textContent = 'Scanning... ' + pct + '%';
        }
      }
    });
    const parsed = parseReceipt(data.text);
    state.items = parsed.items.length ? parsed.items : [{ name: '', price: 0 }];
    state.taxAmt = parsed.tax;
    ($('taxInput') as HTMLInputElement).value = String(state.taxAmt || '');
    enterItemsScreen();
  } catch {
    $('progressText').textContent = 'Scan failed — entering manual mode';
    setTimeout(skipToManual, 1000);
  }
}

export function parseReceipt(text: string): { items: { name: string; price: number }[]; tax: number } {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);

  // Lines containing these words are totals, metadata, or payment info — not items
  const SKIP = /\b(total|subtotal|sub-total|balance|change|visa|master|amex|discover|cash|gratuity|tip|payment|tender|amount due|amount paid|card|debit|credit|check|table|server|guest|order|date|time|receipt|thank|welcome|phone|tel|fax|www\.|\.com|discount|coupon|promo|rewards|points|savings|refund)\b/i;
  const TAX = /\b(tax|hst|gst|pst|vat|sales tax)\b/i;
  const QTY_PREFIX = /^\d+\s*[xX@]\s*/;
  const QTY_LEADING = /^(\d+)\s+/;

  // Try $-prefixed first, then bare decimal, then comma-decimal (European)
  const pricePatterns = [
    /\$\s*(\d{1,4}\.\d{2})\s*$/,
    /(\d{1,4}\.\d{2})\s*$/,
    /(\d{1,4},\d{2})\s*$/,
  ];

  const result: { items: { name: string; price: number }[]; tax: number } = { items: [], tax: 0 };

  for (const line of lines) {
    let price = 0;
    let matchEnd = line.length;

    for (const pattern of pricePatterns) {
      const match = line.match(pattern);
      if (match) {
        price = parseFloat(match[1].replace(',', '.'));
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

export function skipToManual(): void {
  state.items = [{ name: '', price: 0 }];
  state.taxAmt = 0;
  ($('taxInput') as HTMLInputElement).value = '';
  enterItemsScreen();
}

export function enterItemsScreen(): void {
  renderItems();
  updateRunning();
  if (state.splitMode === 'item') renderAssign();
  $('assignSection').style.display = state.splitMode === 'item' ? 'block' : 'none';
  goTo('screenItems');
}

export function renderItems(): void {
  $('itemsList').innerHTML = state.items.map((item, i) => `
    <div class="item-row">
      <input class="item-name" value="${esc(item.name)}" placeholder="Item name" data-item-name="${i}">
      <input class="item-price" type="number" inputmode="decimal" step="0.01"
             value="${item.price || ''}" placeholder="0.00" data-item-price="${i}">
      <button class="item-del" data-item-del="${i}" aria-label="Remove item"><span class="trash-icon"></span></button>
    </div>
  `).join('');

  const list = $('itemsList');

  list.querySelectorAll<HTMLInputElement>('[data-item-name]').forEach(input => {
    input.addEventListener('input', () => {
      state.items[Number(input.dataset.itemName)].name = input.value;
    });
  });

  list.querySelectorAll<HTMLInputElement>('[data-item-price]').forEach(input => {
    input.addEventListener('input', () => {
      state.items[Number(input.dataset.itemPrice)].price = parseFloat(input.value) || 0;
      updateRunning();
    });
  });

  list.querySelectorAll<HTMLButtonElement>('[data-item-del]').forEach(btn => {
    btn.addEventListener('click', () => removeItem(Number(btn.dataset.itemDel)));
  });
}

export function addItem(): void {
  state.items.push({ name: '', price: 0 });
  renderItems();
  if (state.splitMode === 'item') renderAssign();
  const inputs = $('itemsList').querySelectorAll<HTMLInputElement>('.item-name');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

export function removeItem(index: number): void {
  state.items.splice(index, 1);
  renderItems();
  updateRunning();
  if (state.splitMode === 'item') renderAssign();
}

export function updateRunning(): void {
  const sub = state.items.reduce((sum, item) => sum + (item.price || 0), 0);
  const taxNote = state.taxAmt ? ' + ' + fmt(state.taxAmt) + ' tax' : '';
  $('runningSub').textContent = 'Subtotal: ' + fmt(sub) + taxNote;
}
