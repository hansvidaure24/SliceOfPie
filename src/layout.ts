import { $, esc, fmt } from './helpers';
import { state, getBillTotals } from './state';
import { calcOwes } from './summary';
import { unassignedCount } from './assign';

// Wide screens put a panel beside the screen: the split's running totals
// while you build it, or the list of saved bills next to one you're viewing
type Aside = 'live' | 'bills' | 'none';
const ASIDE: Record<string, Aside> = {
  screenPeople: 'live',
  screenQuick: 'live',
  screenCapture: 'live',
  screenItems: 'live',
  screenDetail: 'bills',
};

export function setAside(screenId: string): void {
  const aside = ASIDE[screenId] ?? 'none';
  document.body.dataset.aside = aside;
  if (aside === 'live') renderLiveSummary();
  if (aside === 'bills') renderBillsPane();
}

export function renderLiveSummary(): void {
  if (document.body.dataset.aside !== 'live') return;
  const { sub, tax, tip } = getBillTotals();
  const breakdown = calcOwes();
  const total = breakdown.reduce((s, b) => s + b.amount, 0);

  // A pie from the shares; flat until there's something to split
  let at = 0;
  const stops = total > 0
    ? breakdown.filter(b => b.amount > 0).map(b => {
      const from = at;
      at += (b.amount / total) * 100;
      return `${b.color} ${from}% ${at}%`;
    }).join(',')
    : 'var(--surface2) 0 100%';
  $('livePie').style.background = `conic-gradient(${stops})`;

  $('livePeople').innerHTML = breakdown.map(b =>
    `<div class="owe-row" style="--who:${b.color}"><span class="owe-name">${esc(b.name)}</span><span class="owe-amt">${fmt(b.amount)}</span></div>`
  ).join('');

  const tipText = state.useReceiptTip ? 'Tip (from receipt)' : 'Tip (' + state.tipPct + '%)';
  $('liveTotals').innerHTML = `
    <div class="sum-line"><span>${state.splitMode === 'even' && state.taxIncluded ? 'Bill total' : 'Items + tax'}</span><span>${fmt(sub + tax)}</span></div>
    <div class="sum-line"><span>${tipText}</span><span>${fmt(tip)}</span></div>
    <div class="sum-line total"><span>Total</span><span>${fmt(total)}</span></div>`;

  const unassigned = unassignedCount();
  $('liveNote').textContent = sub <= 0
    ? (state.splitMode === 'even' ? 'Enter the total to see each share.' : 'Add items to see each share.')
    : unassigned
      ? (unassigned === 1 ? '1 item isn’t on anyone’s share yet.' : unassigned + ' items aren’t on anyone’s share yet.')
      : '';
  $('liveNote').classList.toggle('warn', sub > 0 && unassigned > 0);
}

export function renderBillsPane(): void {
  if (document.body.dataset.aside !== 'bills') return;
  $('billsPaneList').innerHTML = state.history.map(bill => {
    const unpaid = bill.people.filter(p => !p.paid).length;
    const date = new Date(bill.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<button class="pane-bill${bill.id === state.viewingBillId ? ' current' : ''}" data-pane-bill="${bill.id}"
        ${bill.id === state.viewingBillId ? 'aria-current="true"' : ''}>
      <span class="pane-bill-top"><b>${esc(bill.label)}</b><span>${fmt(bill.total)}</span></span>
      <span class="pane-bill-bottom"><span>${date}</span><span class="${unpaid ? 'pane-owed' : 'pane-paid'}">${unpaid ? unpaid + ' unpaid' : 'All paid'}</span></span>
    </button>`;
  }).join('');
}

// Receipt photos dropped on the window or pasted, on the screens that scan
export function initReceiptDrop(onImage: (file: File) => void): void {
  const scanning = () => ['screenCapture', 'screenQuick'].includes(document.querySelector('.screen.active')?.id ?? '');
  const imageFrom = (files: FileList | null | undefined) => Array.from(files ?? []).find(f => f.type.startsWith('image/'));
  const overlay = $('dropOverlay');
  let depth = 0;

  window.addEventListener('dragenter', (e) => {
    if (!scanning() || !e.dataTransfer?.types.includes('Files')) return;
    depth++;
    overlay.classList.add('show');
  });
  window.addEventListener('dragleave', () => {
    if (depth > 0 && --depth === 0) overlay.classList.remove('show');
  });
  window.addEventListener('dragover', (e) => {
    if (scanning()) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    depth = 0;
    overlay.classList.remove('show');
    if (!scanning()) return;
    e.preventDefault();
    const file = imageFrom(e.dataTransfer?.files);
    if (file) onImage(file);
  });
  document.addEventListener('paste', (e) => {
    if (!scanning()) return;
    const file = imageFrom(e.clipboardData?.files);
    if (!file) return;
    e.preventDefault();
    onImage(file);
  });
}
