import { $, esc, defaultLabel, tap } from './helpers';
import { copyText } from './share';
import { getPaymentLines } from './payment';
import { fmt } from './money';
import { showToast } from './notify';
import { confirmDialog, promptDialog } from './dialog';
import { goTo, onEnterScreen } from './router';
import { state, getBillTotals, getPayerName, isPayer, findBill, effectiveTipPct } from './state';
import { calcOwes } from './bill';

import { putBill, deleteBillFromDB, keepDataOnDevice } from './db';
import { maybeNudgeInstall } from './install';
import type { Bill } from './types';

const DELETE_ICON = '<span class="trash-icon"></span>';
let swipeHintShown = false;

export function relativeDate(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (today.getTime() - day.getTime()) / 86_400_000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (now.getFullYear() !== date.getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
}
// Delete Bill on the detail screen takes two taps; the first one arms it for a few seconds
let deleteArmed = false;
let deleteTimer: ReturnType<typeof setTimeout> | null = null;

onEnterScreen('screenHistory', renderHistory);

// Keeps a change to a saved bill, or puts things back the way they were and says so
async function persist(write: Promise<void>, undo: () => void, failMsg: string): Promise<void> {
  try {
    await write;
  } catch {
    undo();
    showToast(failMsg);
  }
}

export async function startSaveBill(): Promise<void> {
  const { total } = getBillTotals();
  if (total <= 0) { showToast('Nothing to save'); return; }
  if (state.billSavedThisSession) { showToast('Already saved'); return; }
  const label = await promptDialog('Name this bill', billLabel(), { yes: 'Save' });
  if (label === null) return;
  await saveBill(label.trim() || billLabel());
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

async function saveBill(label: string): Promise<void> {
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

  try {
    await putBill(bill);
  } catch {
    showToast('Could not save. Storage may be full or blocked.');
    return;
  }
  state.history.unshift(bill);
  if (state.history.length > 50) {
    const old = state.history.pop();
    // Only keeps the list short; a failure leaves one extra bill, nothing lost
    if (old) deleteBillFromDB(old.id).catch(() => {});
  }

  keepDataOnDevice();
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
    $('historySubtitle').textContent = 'Past splits and who still owes';
    $('historyList').innerHTML = `
      <div class="empty-state">
        No saved bills yet.<br>
        <span class="empty-hint">Split a bill and tap Save!</span><br>
        <div style="display:flex;gap:var(--space-2);justify-content:center;margin-top:var(--space-4);flex-wrap:wrap">
          <button class="btn btn-primary btn-inline" data-action="startSplit" data-arg="item"><span class="camera-icon"></span>Scan a receipt</button>
          <button class="btn btn-secondary btn-inline" data-action="startSplit" data-arg="even"><span class="pencil-icon"></span>Enter a total</button>
        </div>
      </div>`;
    return;
  }
  const unsettled = state.history.filter(b => b.people.some(p => !p.paid)).length;
  $('historySubtitle').textContent = unsettled
    ? unsettled + (unsettled === 1 ? ' bill' : ' bills') + ' still unpaid'
    : 'All settled — nothing owed';

  $('historyList').innerHTML = state.history.map(bill => {
    const [ry, rm, rd] = (bill.receiptDate ?? '').split('-').map(Number);
    const date = bill.receiptDate ? new Date(ry, rm - 1, rd) : new Date(bill.date);
    const dateStr = relativeDate(date);
    const paidCount = bill.people.filter(p => p.paid).length;
    const totalPeople = bill.people.length;

    let statusClass: string, statusText: string;
    if (paidCount === 0) { statusClass = 'status-none'; statusText = 'Unpaid'; }
    else if (paidCount >= totalPeople) { statusClass = 'status-done'; statusText = 'All paid'; }
    else { statusClass = 'status-partial'; statusText = paidCount + '/' + totalPeople + ' paid'; }

    // The card's own button covers it, so clicks and the keyboard both land there
    return `<div class="swipe-wrap" role="listitem">
      <div class="swipe-behind"><span class="trash-icon"></span> Delete</div>
      <div class="history-card" data-action="viewBill" data-arg="${bill.id}">
        <button class="history-open" aria-label="${esc(bill.label)}, ${fmt(bill.total)}, ${statusText}"></button>
        <button class="history-del" data-action="askDeleteBill" data-arg="${bill.id}" aria-label="Delete ${esc(bill.label)}">&times;</button>
        <div class="history-top">
          <span class="history-label">${esc(bill.label)}</span>
          <span class="history-date">${dateStr}</span>
        </div>
        <div class="history-bottom">
          <span class="history-total">${fmt(bill.total)}${bill.splitMode === 'even' && totalPeople > 1 ? '<span class="history-each"> · ' + fmt(bill.total / totalPeople) + ' ea</span>' : ''}${bill.splitMode === 'item' ? '<span class="history-tag">By item</span>' : ''}</span>
          <span class="history-meta">
            <span class="history-status ${statusClass}">${statusText}</span>
            <span class="chevron-icon"></span>
          </span>
        </div>
      </div>
    </div>`;
  }).join('');

  if (!swipeHintShown) {
    swipeHintShown = true;
    const first = $('historyList').querySelector('.swipe-wrap');
    if (first) first.classList.add('swipe-hint');
  }
}

export function viewBill(id: number): void {
  const bill = findBill(id);
  if (!bill) return;

  state.viewingBillId = id;
  deleteArmed = false;
  $('detailDelBtn').innerHTML = DELETE_ICON + 'Delete Bill';
  $('detailDelBtn').classList.remove('del-confirm');
  renderDetailTitle(bill);

  // The date printed on the receipt (when scanned) is when the meal happened
  const [y, m, d] = (bill.receiptDate ?? '').split('-').map(Number);
  const date = bill.receiptDate ? new Date(y, m - 1, d) : new Date(bill.date);
  const rel = relativeDate(date);
  const long = date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('detailDate').textContent = (rel === 'Today' || rel === 'Yesterday') ? rel + ' · ' + long : long;

  const unpaid = bill.people.filter(p => !p.paid);
  const perPerson = bill.splitMode === 'even' && unpaid.length
    ? `<div class="sum-line"><span>Each owes</span><span>${fmt(unpaid[0].amount)}</span></div>` : '';
  $('detailSummaryCard').innerHTML = `
    <div class="section-label">Summary</div>
    <div class="sum-line"><span>Total</span><span>${fmt(bill.total)}</span></div>
    <div class="sum-line"><span>Tip</span><span>${bill.tipPct}%</span></div>
    <div class="sum-line"><span>Split</span><span>${bill.splitMode === 'even' ? 'Even' : 'By item'}, ${bill.people.length} people</span></div>
    ${perPerson}
    <div class="sum-line"><span>Paid by</span><span>${esc(bill.payerName)}</span></div>
  `;

  const unpaidCount = bill.people.filter(p => !p.paid).length;
  $('detailPeopleLabel').textContent = unpaidCount
    ? 'Who owes what · ' + unpaidCount + ' of ' + bill.people.length + ' unpaid'
    : 'Who owes what · all paid';

  renderDetailPeople(bill);
  goTo('screenDetail');
}

function renderDetailPeople(bill: Bill): void {
  $('detailPeople').innerHTML = bill.people.map((person, i) => `
    <div class="detail-person">
      <button class="detail-who" data-copy-person="${i}" style="--who:${person.color}" aria-label="Copy ${esc(person.name)}'s share">
        <div class="person-icon" style="background:${person.color}"></div>
        <div>
          <div class="detail-name">${esc(person.name)}</div>
          <div class="detail-amount${person.paid ? ' paid-text' : ''}">${person.paid ? 'Paid' : 'Owes ' + fmt(person.amount)}</div>
        </div>
      </button>
      <button class="paid-btn ${person.paid ? 'paid' : ''}" data-action="togglePaid" data-arg="${i}" aria-pressed="${person.paid}">
        <span class="check-icon"></span><span class="sr-only">${esc(person.name)} </span>Paid
      </button>
    </div>
  `).join('');
}

// Marks someone on the open bill as paid, or not
export function togglePaid(personIdx: number): void {
  tap();
  const bill = findBill(state.viewingBillId!);
  const person = bill?.people[personIdx];
  if (!bill || !person) return;

  const nowPaid = !person.paid;
  person.paid = nowPaid;
  const redraw = () => {
    updateHistoryBadge();
    if (state.viewingBillId === bill.id) {
      renderDetailPeople(bill);
      const uc = bill.people.filter(p => !p.paid).length;
      $('detailPeopleLabel').textContent = uc
        ? 'Who owes what · ' + uc + ' of ' + bill.people.length + ' unpaid'
        : 'Who owes what · all paid';
    }
  };
  redraw();
  void persist(putBill(bill), () => { person.paid = !nowPaid; redraw(); }, 'Could not save that change');

  // Trigger ripple animation only on the button that just changed
  if (nowPaid) {
    const btn = $('detailPeople').querySelector<HTMLButtonElement>(
      `[data-action="togglePaid"][data-arg="${personIdx}"]`
    );
    if (btn) {
      btn.classList.add('just-paid');
      btn.addEventListener('animationend', () => btn.classList.remove('just-paid'), { once: true });
    }
    if (bill.people.every(p => p.paid)) {
      showToast('All settled!');
      const card = $('detailSummaryCard');
      card.classList.remove('all-settled');
      void card.offsetWidth;
      card.classList.add('all-settled');
    }
  }
}

// The heading holds a button, so it stays a heading for screen readers
function renderDetailTitle(bill: Bill): void {
  const titleEl = $('detailTitle');
  titleEl.innerHTML = `<button class="title-edit" data-action="renameBill" aria-label="Rename ${esc(bill.label)}">${esc(bill.label)} <span class="pencil-icon" aria-hidden="true"></span></button>`;
}

export async function renameBill(): Promise<void> {
  const bill = findBill(state.viewingBillId!);
  if (!bill) return;
  const label = await promptDialog('Rename this bill', bill.label, { yes: 'Rename' });
  if (label === null || !label.trim() || label.trim() === bill.label) return;
  const before = bill.label;
  bill.label = label.trim();
  renderDetailTitle(bill);
  try {
    await putBill(bill);
    showToast('Renamed');
  } catch {
    bill.label = before;
    renderDetailTitle(bill);
    showToast('Could not rename the bill');
  }
}

export function deleteBill(): void {
  tap();
  // Two-tap confirm: first tap arms, second tap deletes
  if (!deleteArmed) {
    deleteArmed = true;
    $('detailDelBtn').innerHTML = DELETE_ICON + 'Tap again to delete';
    $('detailDelBtn').classList.add('del-confirm');
    if (deleteTimer) clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      deleteArmed = false;
      $('detailDelBtn').innerHTML = DELETE_ICON + 'Delete Bill';
      $('detailDelBtn').classList.remove('del-confirm');
    }, 3000);
    return;
  }

  if (deleteTimer) clearTimeout(deleteTimer);
  removeBill(state.viewingBillId!);
  goTo('screenHistory');
}

// The x on a history card
export async function askDeleteBill(id: string): Promise<void> {
  if (await confirmDialog('Delete this bill?', 'This action cannot be undone.', { yes: 'Delete', warn: true })) removeBill(Number(id));
}

function removeBill(id: number): void {
  const bill = findBill(id);
  if (!bill) return;
  state.history = state.history.filter(b => b !== bill);
  const redraw = () => {
    updateHistoryBadge();
    renderHistory();
  };
  redraw();
  showToast('Deleted');
  void persist(deleteBillFromDB(id), () => {
    state.history = [...state.history, bill].sort((a, b) => b.id - a.id);
    redraw();
  }, 'Could not delete the bill');
}

const SWIPE_THRESHOLD = 80;

function initDetailCopy(): void {
  $('detailPeople').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-copy-person]');
    if (!btn) return;
    const bill = findBill(state.viewingBillId!);
    const person = bill?.people[Number(btn.dataset.copyPerson)];
    if (!bill || !person) return;
    tap();
    if (person.paid) { showToast(person.name + ' already paid'); return; }
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 600);
    const lines = [person.name + ' owes ' + fmt(person.amount)];
    const myName = state.payment.name?.toLowerCase();
    if (myName && bill.payerName.toLowerCase() === myName) {
      const payLines = getPaymentLines();
      if (payLines.length) lines.push(...payLines);
    }
    void copyText(lines.join('\n'));
  });
}

// Swipe a card left to delete it. One set of listeners on the list, since cards are redrawn.
export function initHistory(): void {
  initDetailCopy();
  const list = $('historyList');
  let card: HTMLElement | null = null;
  let startX = 0, startY = 0, dx = 0, swiping = false;

  list.addEventListener('touchstart', (e) => {
    card = (e.target as HTMLElement).closest<HTMLElement>('.history-card');
    if (!card) return;
    // The hint's animation holds the card's position, which would stop it following the finger
    card.closest('.swipe-hint')?.classList.remove('swipe-hint');
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    swiping = false;
    card.style.transition = 'none';
  }, { passive: true });

  list.addEventListener('touchmove', (e) => {
    if (!card) return;
    const moveX = e.touches[0].clientX - startX;
    const moveY = e.touches[0].clientY - startY;
    if (!swiping && Math.abs(moveY) > Math.abs(moveX)) return;
    if (Math.abs(moveX) > 10) swiping = true;
    if (!swiping) return;
    e.preventDefault();
    dx = Math.min(0, moveX);
    card.style.transform = `translateX(${dx}px)`;
  }, { passive: false });

  list.addEventListener('touchend', () => {
    const swiped = card;
    card = null;
    if (!swiped) return;
    swiped.style.transition = 'transform .25s ease';
    if (dx >= -SWIPE_THRESHOLD) {
      swiped.style.transform = '';
      return;
    }
    tap();
    swiped.style.transform = `translateX(-100%)`;
    const billId = Number(swiped.dataset.arg);
    // Ask once the card has slid away; the timer covers a transition that never runs
    let asked = false;
    const ask = async () => {
      if (asked) return;
      asked = true;
      if (await confirmDialog('Delete this bill?', 'This action cannot be undone.', { yes: 'Delete', warn: true })) {
        removeBill(billId);
      } else {
        swiped.style.transform = '';
      }
    };
    swiped.addEventListener('transitionend', () => void ask(), { once: true });
    setTimeout(() => void ask(), 400);
  });
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
  const allOwed = state.history.filter(b => b.people.some(p => !p.paid));
  const owed = allOwed.slice(0, 3);
  const allCaughtUp = owed.length === 0 && state.history.length > 0;
  $('owedSection').hidden = state.history.length === 0;
  const label = $('owedSectionLabel');
  label.classList.toggle('caught-up', allCaughtUp);
  if (allCaughtUp) {
    label.innerHTML = '<span class="check-icon"></span>All caught up!';
    $('owedList').innerHTML = '';
  } else {
    const totalOwed = allOwed.reduce((s, b) => s + b.people.filter(p => !p.paid).reduce((a, p) => a + p.amount, 0), 0);
    label.textContent = 'Still unpaid · ' + fmt(totalOwed);
  }
  const linkLabel = state.history.length === 1 ? '1 bill' : state.history.length + ' bills';
  $('owedLink').innerHTML = linkLabel + ' <span class="chevron-icon"></span>';
  if (!owed.length) return;
  $('owedList').innerHTML = owed.map(bill => {
    const unpaid = bill.people.filter(p => !p.paid);
    const paidCount = bill.people.length - unpaid.length;
    const who = unpaid.length <= 2
      ? unpaid.map(p => p.name).join(' & ')
      : unpaid[0].name + ' + ' + (unpaid.length - 1) + ' more';
    return `<button class="owed-card" data-action="viewBill" data-arg="${bill.id}">
      <span class="owed-top"><b>${esc(bill.label)}</b><b class="owed-amt">${fmt(unpaid.reduce((s, p) => s + p.amount, 0))}</b></span>
      <span class="owed-bottom"><span>${esc(who)} → ${esc(bill.payerName)}</span><span class="history-status ${paidCount ? 'status-partial' : 'status-none'}">${paidCount} of ${bill.people.length} paid</span></span>
    </button>`;
  }).join('');
}
