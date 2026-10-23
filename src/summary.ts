import { $, COLORS, esc, fmt, pulse, tap } from './helpers';
import { state, getBillTotals, isPayer } from './state';
import { renderTipRow } from './tip';
import { renderPieChart } from './pie';
import { goTo } from './navigation';
import type { Breakdown } from './types';

export function renderPayerRow(): void {
  $('payerRow').innerHTML = state.people.map((person, i) => {
    const on = (person.isMe ? state.payer === 'me' : state.payer === i) ? 'on' : '';
    const label = person.isMe ? esc(person.name) + ' (you)' : esc(person.name);
    return `<button class="payer-badge ${on}" data-payer="${person.isMe ? 'me' : i}">${label}</button>`;
  }).join('');

  $('payerRow').querySelectorAll<HTMLButtonElement>('[data-payer]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.payer!;
      setPayer(val === 'me' ? 'me' : Number(val));
    });
  });
}

export function setPayer(who: 'me' | number): void {
  tap();
  state.payer = who;
  renderPayerRow();
  updateSummary();
}

export function goToSummary(): void {
  renderTipRow();
  renderPayerRow();
  updateSummary();
  goTo('screenSummary');
}

export function calcOwes(): Breakdown[] {
  const { sub, tax, tip, total } = getBillTotals();

  if (state.splitMode === 'even') {
    let perPerson = total / state.people.length;
    if (state.roundUp) perPerson = Math.ceil(perPerson);
    return state.people.map((p, i) => ({
      name: p.name,
      amount: perPerson,
      color: COLORS[i % 8],
    }));
  }

  // By-item: calculate each person's share based on assigned items
  const owes = Array(state.people.length).fill(0) as number[];
  for (const item of state.items) {
    const assigned = item.assignees || [];
    if (assigned.length === 0) continue;
    const share = (item.price || 0) / assigned.length;
    assigned.forEach(personIdx => owes[personIdx] += share);
  }
  const itemTotal = owes.reduce((sum, val) => sum + val, 0);

  return state.people.map((person, i) => {
    const personTax = itemTotal > 0 ? (owes[i] / itemTotal) * tax : tax / state.people.length;
    const personTip = itemTotal > 0 ? (owes[i] / itemTotal) * tip : tip / state.people.length;
    let amount = owes[i] + personTax + personTip;
    if (state.roundUp) amount = Math.ceil(amount);
    return { name: person.name, amount, color: COLORS[i % 8] };
  });
}

export function updateSummary(): void {
  const { sub, tax, tip, total } = getBillTotals();

  // Even split with tax included hides the tax line
  const evenTaxInc = state.splitMode === 'even' && state.taxIncluded;
  $('sumSubLabel').textContent = evenTaxInc ? 'Bill Total' : 'Subtotal';
  $('sumTaxLine').style.display = evenTaxInc ? 'none' : 'flex';
  $('tipBaseRow').style.display = evenTaxInc ? 'none' : 'flex';

  const tipLabel = state.tipBase === 'post' && !evenTaxInc
    ? 'on post-tax'
    : evenTaxInc ? '' : 'on pre-tax';
  $('sumTipLabel').textContent = 'Tip (' + state.tipPct + '%' + (tipLabel ? ' ' + tipLabel : '') + ')';

  $('sumSub').textContent = fmt(sub);
  $('sumTax').textContent = fmt(tax);
  $('sumTipAmt').textContent = fmt(tip);

  const breakdown = calcOwes();
  const displayTotal = state.roundUp
    ? breakdown.reduce((s, b) => s + b.amount, 0)
    : total;

  const totalEl = $('sumTotal');
  const oldTotal = totalEl.textContent;
  totalEl.textContent = fmt(displayTotal);
  if (oldTotal !== fmt(displayTotal)) pulse(totalEl);
  const breakdownHtml = renderBreakdownLines(breakdown);

  if (state.splitMode === 'even') {
    $('evenResult').style.display = 'block';
    $('itemResult').style.display = 'none';
    const ppEl = $('perPerson');
    const oldPP = ppEl.textContent;
    ppEl.textContent = fmt(breakdown[0]?.amount || 0);
    if (oldPP !== ppEl.textContent) pulse(ppEl);
    $('evenBreakdown').innerHTML = breakdownHtml;
  } else {
    $('evenResult').style.display = 'none';
    $('itemResult').style.display = 'block';
    renderPieChart(breakdown);
    $('breakdownList').innerHTML = breakdownHtml;
  }
}

function renderBreakdownLines(breakdown: Breakdown[]): string {
  return breakdown.map((entry, i) => {
    const paid = isPayer(i);
    return `<div class="breakdown-line">
      <span class="breakdown-name" style="color:${entry.color}">
        ${esc(entry.name)}${paid ? ' <span class="paid-tag">(paid)</span>' : ''}
      </span>
      <span>${paid ? '<span class="paid-tag">—</span>' : fmt(entry.amount)}</span>
    </div>`;
  }).join('');
}
