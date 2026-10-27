import { fmt } from './money';
import { showToast } from './notify';
import { billLabel, relativeDate } from './history';
import { state, getBillTotals, getPayerName, isPayer, findBill, tipLabel } from './state';
import { getPaymentLines } from './payment';
import { calcOwes } from './bill';

// A computer pastes the bill into a chat, so its main button copies; a phone
// opens the share sheet (which has Copy as well). 'alt' is the other one.
export type ShareMode = 'auto' | 'alt';

export function prefersCopy(): boolean {
  return !navigator.share || matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function shouldCopy(mode: ShareMode): boolean {
  return !navigator.share || (mode === 'auto') === prefersCopy();
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied. Paste it into any chat.');
  } catch {
    showToast('Could not copy');
  }
}

export async function shareText(text: string, mode: ShareMode = 'auto'): Promise<void> {
  if (shouldCopy(mode)) {
    await copyText(text);
    return;
  }
  try {
    await navigator.share({ text });
  } catch (err) {
    // Closing the share sheet isn't a failure; anything else falls back to copying
    if ((err as DOMException)?.name !== 'AbortError') await copyText(text);
  }
}

// Labels the share buttons for this device: Copy first on a computer, Share first on a phone
export function labelShareButtons(): void {
  const copyFirst = prefersCopy();
  const set = (id: string, icon: string, label: string) => {
    const btn = document.getElementById(id);
    if (btn) btn.innerHTML = `<span class="${icon}-icon"></span>${label}`;
  };
  for (const [main, alt] of [['shareBtn', 'shareAltBtn'], ['detailShareBtn', 'detailShareAltBtn']]) {
    set(main, copyFirst ? 'copy' : 'share', copyFirst ? 'Copy' : 'Share');
    set(alt, copyFirst ? 'share' : 'copy', copyFirst ? 'Share…' : 'Copy text');
    // No share sheet in this browser: copying is the only way, so there's no second button
    const altBtn = document.getElementById(alt);
    if (altBtn) altBtn.hidden = !navigator.share;
  }
  set('imageBtn', 'gallery', copyFirst ? 'Copy as image' : 'Share as image');
}

export async function doShare(mode: ShareMode = 'auto'): Promise<void> {
  const { sub, tax, tip, total: rawTotal } = getBillTotals();
  const breakdown = calcOwes();
  const total = state.roundUp ? breakdown.reduce((s, e) => s + e.amount, 0) : rawTotal;
  const label = billLabel();
  const lines: string[] = ['SliceOfPie — ' + label];
  if (state.receipt?.date) {
    const [yr, mo, dy] = state.receipt.date.split('-').map(Number);
    lines.push(new Date(yr, mo - 1, dy).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  }

  if (state.splitMode === 'item') {
    lines.push('');
    state.items.forEach(item => {
      if (!item.price) return;
      const assigned = (item.assignees || []).map(i => state.people[i]?.name).filter(Boolean);
      const who = assigned.length ? ' → ' + assigned.join(', ') : '';
      lines.push(item.name + ': ' + fmt(item.price) + who);
    });
  }

  lines.push('');
  const parts: string[] = [];
  if (state.splitMode !== 'even' || !state.taxIncluded) parts.push('Subtotal: ' + fmt(sub));
  if (tax) parts.push('Tax: ' + fmt(tax));
  parts.push(tipLabel() + ': ' + fmt(tip));
  lines.push(parts.join(' | '));
  lines.push('Total: ' + fmt(total));
  lines.push('');

  const payerName = getPayerName();
  breakdown.forEach((entry, i) => {
    if (isPayer(i)) lines.push(entry.name + ' (paid)');
    else lines.push(entry.name + ' owes: ' + fmt(entry.amount));
  });

  lines.push(...buildPaymentFooter(payerName));
  await shareText(lines.join('\n'), mode);
}

export async function shareBill(id: number, mode: ShareMode = 'auto'): Promise<void> {
  const bill = findBill(id);
  if (!bill) return;

  const dateStr = bill.receiptDate
    ? (() => { const [y, m, d] = bill.receiptDate!.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); })()
    : relativeDate(new Date(bill.date));
  const lines: string[] = [
    'SliceOfPie — ' + bill.label,
    dateStr,
    '',
    'Total: ' + fmt(bill.total) + (bill.tipPct ? ' (incl. ' + bill.tipPct + '% tip)' : ''),
    '',
  ];

  bill.people.forEach(person => {
    if (person.paid) lines.push(person.name + ' (paid)');
    else lines.push(person.name + ' owes: ' + fmt(person.amount));
  });

  lines.push(...buildPaymentFooter(bill.payerName));
  await shareText(lines.join('\n'), mode);
}

export function reshareDetail(mode: ShareMode = 'auto'): void {
  void shareBill(state.viewingBillId!, mode);
}

function buildPaymentFooter(payerName: string): string[] {
  const myName = state.payment.name?.toLowerCase();
  if (myName && payerName.toLowerCase() === myName) {
    const payLines = getPaymentLines();
    if (payLines.length) return payLines;
  }
  return ['', 'Send to ' + payerName];
}
