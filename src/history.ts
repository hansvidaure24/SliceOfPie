import { $, esc, fmt, showToast, defaultLabel, tap, confirmDialog, promptDialog } from './helpers';
import { state, getBillTotals, getPayerName, isPayer, findBill, effectiveTipPct } from './state';
import { calcOwes } from './bill';
import { goTo } from './navigation';

import { putBill, deleteBillFromDB } from './db';
import { maybeNudgeInstall } from './install';
import type { Bill } from './types';

const DELETE_ICON = '<span class="trash-icon"></span>';
let swipeHintShown = false;

export async function startSaveBill(): Promise<void> {
  const { total } = getBillTotals();
  if (total <= 0) { showToast('Nothing to save'); return; }
  if (state.billSavedThisSession) { showToast('Already saved'); return; }
  const label = await promptDialog('Name this bill', billLabel(), { yes: 'Save' });
  if (label === null) return;
  saveBill(label.trim() || billLabel());
}

// What the current bill is called: its saved name, else the merchant or the date
export function billLabel(): string {
  if (state.billLabel) return state.billLabel;
  return state.receipt?.merchant ? displayName(state.receipt.merchant) : defaultLabel();
}

// Receipts often print the merchant in capitals; "AROMA CAFE" reads better as "Aroma Cafe"
function displayName(merchant: string): string {
  if (merchant !== merchant.toUpperCase()) return merchant;
  return merchant.toLowerCase().replace(/(^|[\s\-/&])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function saveBill(label: string): void {
  const breakdown = calcOwes();
  const { total: rawTotal } = getBillTotals();
  const total = state.roundUp ? breakdown.reduce((s, e) => s + e.amount, 0) : rawTotal;

  const bill: Bill = {
    id: Date.now(),
    date: new Date().toISOString(),
    label,
    total,
    tipPct: effectiveTipPct(),
    splitMode: state.splitMode,
    ...(state.receipt?.merchant ? { merchant: state.receipt.merchant } : {}),
    ...(state.receipt?.date ? { receiptDate: state.receipt.date } : {}),
    payerName: getPayerName(),
    people: breakdown.map((entry, i) => ({
      name: entry.name,
      amount: entry.amount,
      color: entry.color,
      paid: isPayer(i),
    })),
  };

  state.history.unshift(bill);
  if (state.history.length > 50) {
    const old = state.history.pop();
    if (old) deleteBillFromDB(old.id).catch(() => {});
  }
  putBill(bill).catch(() => showToast('Could not save — storage full?'));

  state.billSavedThisSession = true;
  state.billLabel = label;
  renderSaveButton();
  updateHistoryBadge();
  showToast('Bill saved!');
  setTimeout(() => void maybeNudgeInstall(), 1200);
}

export function renderSaveButton(): void {
  const btn = $('saveBillBtn');
  btn.innerHTML = state.billSavedThisSession
    ? '<span class="check-icon"></span>Saved!'
    : '<span class="bill-icon"></span>Save Bill';
  btn.style.opacity = state.billSavedThisSession ? '.5' : '1';
}

export function renderHistory(): void {
  if (state.history.length === 0) {
    $('historyList').innerHTML = `
      <div class="empty-state">
        No saved bills yet.<br>
        <span class="empty-hint">Split a bill and tap Save!</span>
      </div>`;
    return;
  }

  $('historyList').innerHTML = state.history.map(bill => {
    const date = new Date(bill.date);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const paidCount = bill.people.filter(p => p.paid).length;
    const totalPeople = bill.people.length;

    let statusClass: string, statusText: string;
    if (paidCount === 0) { statusClass = 'status-none'; statusText = 'Unpaid'; }
    else if (paidCount >= totalPeople) { statusClass = 'status-done'; statusText = 'All paid'; }
    else { statusClass = 'status-partial'; statusText = paidCount + '/' + totalPeople + ' paid'; }

    return `<div class="swipe-wrap" role="listitem" data-swipe="${bill.id}">
      <div class="swipe-behind"><span class="trash-icon"></span> Delete</div>
      <div class="history-card" data-bill="${bill.id}">
        <button class="history-open" aria-label="${esc(bill.label)}, ${fmt(bill.total)}, ${statusText}"></button>
        <button class="history-del" data-hist-del="${bill.id}" aria-label="Delete ${esc(bill.label)}">&times;</button>
        <div class="history-top">
          <span class="history-label">${esc(bill.label)}</span>
          <span class="history-date">${dateStr}</span>
        </div>
        <div class="history-bottom">
          <span class="history-total">${fmt(bill.total)}</span>
          <span class="history-meta">
            <span class="history-status ${statusClass}">${statusText}</span>
            <span class="chevron-icon"></span>
          </span>
        </div>
      </div>
    </div>`;
  }).join('');

  $('historyList').querySelectorAll<HTMLElement>('[data-bill]').forEach(card => {
    // The card's own button covers it, so clicks and the keyboard both land there
    card.addEventListener('click', () => viewBill(Number(card.dataset.bill)));
  });

  $('historyList').querySelectorAll<HTMLButtonElement>('[data-hist-del]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.histDel);
      if (await confirmDialog('Delete this bill?', 'This action cannot be undone.')) swipeDelete(id);
    });
  });

  if (!swipeHintShown) {
    swipeHintShown = true;
    const first = $('historyList').querySelector('.swipe-wrap');
    if (first) first.classList.add('swipe-hint');
  }

  initSwipe();
}

export function viewBill(id: number): void {
  const bill = findBill(id);
  if (!bill) return;

  state.viewingBillId = id;
  state.deleteArmed = false;
  $('detailDelBtn').innerHTML = DELETE_ICON + 'Delete Bill';
  $('detailDelBtn').classList.remove('del-confirm');
  renderDetailTitle(bill);

  // The date printed on the receipt (when scanned) is when the meal happened
  const [y, m, d] = (bill.receiptDate ?? '').split('-').map(Number);
  const date = bill.receiptDate ? new Date(y, m - 1, d) : new Date(bill.date);
  $('detailDate').textContent = date.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  $('detailSummaryCard').innerHTML = `
    <div class="section-label">Summary</div>
    <div class="sum-line"><span>Total</span><span>${fmt(bill.total)}</span></div>
    <div class="sum-line"><span>Tip</span><span>${bill.tipPct}%</span></div>
    <div class="sum-line"><span>Split</span><span>${bill.splitMode === 'even' ? 'Even' : 'By item'}</span></div>
    <div class="sum-line"><span>Paid by</span><span>${esc(bill.payerName)}</span></div>
  `;

  renderDetailPeople(bill);
  goTo('screenDetail');
}

function renderDetailPeople(bill: Bill): void {
  $('detailPeople').innerHTML = bill.people.map((person, i) => `
    <div class="detail-person">
      <div class="detail-who">
        <div class="person-icon" style="background:${person.color}"></div>
        <div>
          <div class="detail-name">${esc(person.name)}</div>
          <div class="detail-amount${person.paid ? ' paid-text' : ''}">${person.paid ? 'Paid' : 'Owes ' + fmt(person.amount)}</div>
        </div>
      </div>
      <button class="paid-btn ${person.paid ? 'paid' : ''}" data-toggle-paid="${bill.id}-${i}"
              aria-label="${esc(person.name)}: mark as ${person.paid ? 'unpaid' : 'paid'}" aria-pressed="${person.paid}">
        ${person.paid ? '<span class="check-icon"></span>Paid' : 'Not yet'}
      </button>
    </div>
  `).join('');

  $('detailPeople').querySelectorAll<HTMLButtonElement>('[data-toggle-paid]').forEach(btn => {
    const [billId, personIdx] = btn.dataset.togglePaid!.split('-').map(Number);
    btn.addEventListener('click', () => togglePaid(billId, personIdx));
  });
}

function togglePaid(billId: number, personIdx: number): void {
  const bill = findBill(billId);
  if (!bill) return;

  const nowPaid = !bill.people[personIdx].paid;
  bill.people[personIdx].paid = nowPaid;
  putBill(bill).catch(() => {});
  updateHistoryBadge();
  renderDetailPeople(bill);

  // Trigger ripple animation only on the button that just changed
  if (nowPaid) {
    const btn = $('detailPeople').querySelector<HTMLButtonElement>(
      `[data-toggle-paid="${billId}-${personIdx}"]`
    );
    if (btn) {
      btn.classList.add('just-paid');
      btn.addEventListener('animationend', () => btn.classList.remove('just-paid'), { once: true });
    }
  }
}

// The heading holds a button, so it stays a heading for screen readers
function renderDetailTitle(bill: Bill): void {
  const titleEl = $('detailTitle');
  titleEl.innerHTML = `<button class="title-edit" aria-label="Rename ${esc(bill.label)}">${esc(bill.label)} <span class="pencil-icon" aria-hidden="true"></span></button>`;
  titleEl.querySelector('button')!.addEventListener('click', () => void editBillLabel(bill));
}

async function editBillLabel(bill: Bill): Promise<void> {
  const label = await promptDialog('Rename this bill', bill.label, { yes: 'Rename' });
  if (label === null || !label.trim() || label.trim() === bill.label) return;
  bill.label = label.trim();
  putBill(bill).catch(() => {});
  renderDetailTitle(bill);
  showToast('Renamed');
}

export function deleteBill(): void {
  // Two-tap confirm: first tap arms, second tap deletes
  if (!state.deleteArmed) {
    state.deleteArmed = true;
    $('detailDelBtn').innerHTML = DELETE_ICON + 'Tap again to delete';
    $('detailDelBtn').classList.add('del-confirm');
    if (state.deleteTimer) clearTimeout(state.deleteTimer);
    state.deleteTimer = setTimeout(() => {
      state.deleteArmed = false;
      $('detailDelBtn').innerHTML = DELETE_ICON + 'Delete Bill';
      $('detailDelBtn').classList.remove('del-confirm');
    }, 3000);
    return;
  }

  if (state.deleteTimer) clearTimeout(state.deleteTimer);
  const id = state.viewingBillId!;
  state.history = state.history.filter(b => b.id !== id);
  deleteBillFromDB(id).catch(() => {});
  showToast('Deleted');
  updateHistoryBadge();
  renderHistory();
  goTo('screenHistory');
}

const SWIPE_THRESHOLD = 80;

function initSwipe(): void {
  $('historyList').querySelectorAll<HTMLElement>('[data-swipe]').forEach(wrap => {
    const card = wrap.querySelector('.history-card') as HTMLElement;
    const billId = Number(wrap.dataset.swipe);
    let startX = 0, startY = 0, dx = 0, swiping = false;

    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      swiping = false;
      card.style.transition = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const moveX = e.touches[0].clientX - startX;
      const moveY = e.touches[0].clientY - startY;
      if (!swiping && Math.abs(moveY) > Math.abs(moveX)) return;
      if (Math.abs(moveX) > 10) swiping = true;
      if (!swiping) return;
      e.preventDefault();
      dx = Math.min(0, moveX);
      card.style.transform = `translateX(${dx}px)`;
    }, { passive: false });

    card.addEventListener('touchend', () => {
      card.style.transition = 'transform .25s ease';
      if (dx < -SWIPE_THRESHOLD) {
        tap();
        card.style.transform = `translateX(-100%)`;
        card.addEventListener('transitionend', async () => {
          if (await confirmDialog('Delete this bill?', 'This action cannot be undone.')) {
            swipeDelete(billId);
          } else {
            card.style.transform = '';
          }
        }, { once: true });
      } else {
        card.style.transform = '';
      }
    });
  });
}

function swipeDelete(id: number): void {
  state.history = state.history.filter(b => b.id !== id);
  deleteBillFromDB(id).catch(() => {});
  updateHistoryBadge();
  renderHistory();
  showToast('Deleted');
}

export function updateHistoryBadge(): void {
  const unsettled = state.history.filter(b => b.people.some(p => !p.paid)).length;
  const badge = $('histBadge');

  if (unsettled > 0) {
    const changed = badge.textContent !== String(unsettled);
    badge.textContent = String(unsettled);
    badge.style.display = 'flex';
    if (changed) {
      badge.classList.remove('pop');
      void badge.offsetWidth;
      badge.classList.add('pop');
    }
  } else {
    badge.style.display = 'none';
  }
  renderOwed();
}

// Home lists the most recent bills that someone hasn't paid back yet
function renderOwed(): void {
  const owed = state.history.filter(b => b.people.some(p => !p.paid)).slice(0, 3);
  $('owedSection').hidden = owed.length === 0;
  $('owedList').innerHTML = owed.map(bill => {
    const unpaid = bill.people.filter(p => !p.paid);
    const paidCount = bill.people.length - unpaid.length;
    const who = unpaid.length === 1 ? unpaid[0].name : unpaid.length + ' people';
    return `<button class="owed-card" data-owed="${bill.id}">
      <span class="owed-top"><b>${esc(bill.label)}</b><b class="owed-amt">${fmt(unpaid.reduce((s, p) => s + p.amount, 0))}</b></span>
      <span class="owed-bottom"><span>${esc(who)}</span><span class="history-status ${paidCount ? 'status-partial' : 'status-none'}">${paidCount} of ${bill.people.length} paid</span></span>
    </button>`;
  }).join('');
  $('owedList').querySelectorAll<HTMLButtonElement>('[data-owed]').forEach(btn => {
    btn.addEventListener('click', () => viewBill(Number(btn.dataset.owed)));
  });
}
