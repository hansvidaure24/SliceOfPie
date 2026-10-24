import { fmt, shareText, type ShareMode } from './helpers';
import { billLabel } from './history';
import { $, esc } from './helpers';
import { state, getBillTotals, getPayerName, isPayer, findBill, tipLabel } from './state';
import { getPaymentLines } from './payment';
import { calcOwes } from './bill';

export async function doShare(mode: ShareMode = 'auto'): Promise<void> {
  const { sub, tax, tip, total: rawTotal } = getBillTotals();
  const breakdown = calcOwes();
  const total = state.roundUp ? breakdown.reduce((s, e) => s + e.amount, 0) : rawTotal;
  const label = billLabel();
  const lines: string[] = ['SliceOfPie — ' + label];

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

  const lines: string[] = [
    'SliceOfPie — ' + bill.label,
    '',
    'Total: ' + fmt(bill.total),
    '',
  ];

  bill.people.forEach(person => {
    if (person.paid) lines.push(person.name + ' (paid)');
    else lines.push(person.name + ' owes: ' + fmt(person.amount));
  });

  lines.push(...buildPaymentFooter(bill.payerName, true));
  await shareText(lines.join('\n'), mode);
}

export function reshareDetail(mode: ShareMode = 'auto'): void {
  void shareBill(state.viewingBillId!, mode);
}

function buildPaymentFooter(payerName: string, fromHistory = false): string[] {
  if (!fromHistory && state.payer === 'me' && state.imPartOfBill) {
    const payLines = getPaymentLines();
    if (payLines.length) return payLines;
  }
  return ['', 'Send to ' + payerName];
}
