import { $, esc, pulse, tap } from './helpers';
import { fmt } from './money';
import { calcOwes } from './bill';
import { showToast } from './notify';
import { copyText } from './share';
import { getPaymentLines } from './payment';
import { state, getBillTotals, isPayer, receiptTip, getPayerName } from './state';
import { renderPieChart } from './pie';
import type { Breakdown } from './types';

export function renderPayerRow(): void {
  $('payerRow').innerHTML = state.people.map((person, i) => {
    const on = (person.isMe ? state.payer === 'me' : state.payer === i) ? 'on' : '';
    const label = person.isMe ? esc(person.name) + ' (you)' : esc(person.name);
    return `<button class="payer-badge ${on}" data-action="setPayer" data-arg="${person.isMe ? 'me' : i}" aria-pressed="${on ? 'true' : 'false'}">${label}</button>`;
  }).join('');
}

export function setPayer(who: string): void {
  tap();
  state.payer = who === 'me' ? 'me' : Number(who);
  renderPayerRow();
  updateSummary();
}

export function updateSummary(): void {
  const { sub, tax, tip, total } = getBillTotals();

  // Even split with tax included hides the tax line
  const evenTaxInc = state.splitMode === 'even' && state.taxIncluded;
  $('sumSubLabel').textContent = evenTaxInc ? 'Bill Total' : 'Subtotal';
  $('sumTaxLine').style.display = evenTaxInc ? 'none' : 'flex';
  // Pre/post-tax only matters for a percentage tip
  $('tipBaseRow').style.display = evenTaxInc || receiptTip() !== null ? 'none' : 'flex';

  const tipLabel = state.tipBase === 'post' && !evenTaxInc
    ? 'on post-tax'
    : evenTaxInc ? '' : 'on pre-tax';
  $('sumTipLabel').textContent = receiptTip() !== null
    ? 'Tip (from receipt)'
    : 'Tip (' + state.tipPct + '%' + (tipLabel ? ' ' + tipLabel : '') + ')';

  // The collapsed options say what they're set to
  const options = [
    tipLabel && receiptTip() === null ? 'Tip ' + tipLabel : '',
    state.roundUp ? 'rounded up' : 'not rounded',
  ].filter(Boolean).join(' · ');
  $('tipMoreLabel').textContent = options.charAt(0).toUpperCase() + options.slice(1);

  $('sumSub').textContent = fmt(sub);
  $('sumTax').textContent = fmt(tax);
  $('sumTipAmt').textContent = fmt(tip);

  const breakdown = calcOwes();
  const displayTotal = state.roundUp
    ? breakdown.reduce((s, b) => s + b.amount, 0)
    : total;
  $('sumTotal').textContent = fmt(displayTotal);

  renderResult(breakdown, displayTotal);
  $('pieChartWrap').hidden = state.splitMode === 'even';
  if (state.splitMode === 'item') renderPieChart(breakdown);
  $('breakdownList').innerHTML = renderBreakdownLines(breakdown);
}

// The headline: who paid, and what's owed back (or what you owe)
function renderResult(breakdown: Breakdown[], total: number): void {
  const payerIdx = state.payer === 'me' ? state.people.findIndex(p => p.isMe) : state.payer;
  const meIdx = state.people.findIndex(p => p.isMe);
  const payer = state.people[payerIdx];
  const others = breakdown.filter((_, i) => i !== payerIdx);
  const owedBack = others.reduce((s, b) => s + b.amount, 0);
  const by = others.length === 1 ? others[0].name : others.length + ' people';
  // The payer may carry a leftover cent, so "each" is what the others owe
  const each = state.splitMode === 'even' && others.length ? ' · ' + fmt(others[0].amount) + ' each' : '';

  let label: string, amount: number, note: string;
  if (!payer) {
    label = 'Total';
    amount = total;
    note = '';
  } else if (payerIdx === meIdx) {
    label = 'You paid ' + fmt(total);
    amount = owedBack;
    note = others.length ? 'owed back to you by ' + by + each : '';
  } else if (meIdx >= 0) {
    label = payer.name + ' paid ' + fmt(total);
    amount = breakdown[meIdx]?.amount ?? 0;
    note = 'is your share, to pay back to ' + payer.name;
  } else {
    label = payer.name + ' paid ' + fmt(total);
    amount = owedBack;
    note = others.length ? 'owed back to ' + payer.name + ' by ' + by + each : '';
  }

  $('resultLabel').textContent = label;
  const amt = $('resultAmt');
  const text = fmt(amount);
  if (amt.textContent !== text) {
    amt.textContent = text;
    pulse(amt);
  }
  $('resultSub').textContent = note;
}
function renderBreakdownLines(breakdown: Breakdown[]): string {
  return breakdown.map((entry, i) => {
    const paid = isPayer(i);
    return `<button class="owe-row${paid ? ' is-payer' : ''}" style="--who:${entry.color}" data-copy-share="${i}" aria-label="Copy ${esc(entry.name)}'s share">
      <span class="owe-name">${esc(entry.name)}</span>
      <span class="owe-amt">${paid ? '<span class="check-icon"></span>paid the bill' : fmt(entry.amount)}</span>
    </button>`;
  }).join('');
}

export function initBreakdownCopy(): void {
  $('breakdownList').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-copy-share]');
    if (!btn) return;
    tap();
    const idx = Number(btn.dataset.copyShare);
    const breakdown = calcOwes();
    const entry = breakdown[idx];
    if (!entry) return;
    if (isPayer(idx)) { showToast(entry.name + ' paid the bill'); return; }
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 600);
    const lines = [entry.name + ' owes ' + fmt(entry.amount)];
    const myName = state.payment.name?.toLowerCase();
    if (myName && getPayerName().toLowerCase() === myName) {
      const payLines = getPaymentLines();
      if (payLines.length) lines.push(...payLines);
    }
    void copyText(lines.join('\n'));
  });
}
