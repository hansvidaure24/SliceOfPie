import { $, esc, fmt, showToast, defaultLabel } from './helpers';
import { state, getBillTotals, getPayerName, isPayer, findBill } from './state';
import { calcOwes } from './summary';
import { goTo } from './navigation';
import { shareBill } from './share';
import { putBill, deleteBillFromDB } from './db';
import type { Bill } from './types';

const DELETE_ICON = '<span class="trash-icon" style="margin-right:6px"></span>';

export function startSaveBill(): void {
  const { total } = getBillTotals();
  if (total <= 0) { showToast('Nothing to save'); return; }
  if (state.billSavedThisSession) { showToast('Already saved'); return; }
  ($('saveLabelInput') as HTMLInputElement).value = defaultLabel();
  $('saveLabelWrap').classList.add('show');
  ($('saveLabelInput') as HTMLInputElement).focus();
}

export function confirmSave(): void {
  const label = ($('saveLabelInput') as HTMLInputElement).value.trim() || defaultLabel();
  const breakdown = calcOwes();
  const { total } = getBillTotals();

  const bill: Bill = {
    id: Date.now(),
    date: new Date().toISOString(),
    label,
    total,
    tipPct: state.tipPct,
    splitMode: state.splitMode,
    payerName: getPayerName(),
    people: breakdown.map((entry, i) => ({
      name: entry.name,
      amount: entry.amount,
      color: entry.color,
      paid: isPayer(i),
    })),
  };

  state.history.unshift(bill);
  if (state.history.length > 50) state.history.pop();
  putBill(bill);

  state.billSavedThisSession = true;
  $('saveLabelWrap').classList.remove('show');
  $('saveBillBtn').innerHTML = '<span class="check-icon" style="margin-right:6px"></span>Saved!';
  ($('saveBillBtn') as HTMLElement).style.opacity = '.5';
  updateHistoryBadge();
  showToast('Bill saved!');
}

export function renderHistory(): void {
  if (state.history.length === 0) {
    $('historyList').innerHTML = `
      <div class="empty-state">
        <div class="bill-icon" style="width:48px;height:48px;background:var(--muted);margin:0 auto 12px;display:block"></div>
        No saved bills yet.<br>
        <span style="color:var(--muted)">Split a bill and tap Save!</span>
      </div>`;
    return;
  }

  $('historyList').innerHTML = state.history.map(bill => {
    const date = new Date(bill.date);
    const dateStr = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
    const paidCount = bill.people.filter(p => p.paid).length;
    const totalPeople = bill.people.length;

    let statusClass: string, statusText: string;
    if (paidCount === 0) { statusClass = 'status-none'; statusText = 'Unpaid'; }
    else if (paidCount >= totalPeople) { statusClass = 'status-done'; statusText = 'All paid'; }
    else { statusClass = 'status-partial'; statusText = paidCount + '/' + totalPeople + ' paid'; }

    return `<div class="history-card" data-bill="${bill.id}" tabindex="0" role="button">
      <div class="history-top">
        <span class="history-label">${esc(bill.label)}</span>
        <span class="history-date">${dateStr}</span>
      </div>
      <div class="history-bottom">
        <span class="history-total">${fmt(bill.total)}</span>
        <span style="display:flex;align-items:center;gap:8px">
          <button class="btn btn-ghost" style="display:inline;width:auto;padding:4px 10px;font-size:.7rem;border-radius:20px" data-reshare="${bill.id}">
            <span class="share-icon" style="margin-right:4px"></span>Share
          </button>
          <span class="history-status ${statusClass}">${statusText}</span>
          <span class="chevron-icon"></span>
        </span>
      </div>
    </div>`;
  }).join('');

  $('historyList').querySelectorAll<HTMLElement>('[data-bill]').forEach(card => {
    const open = () => viewBill(Number(card.dataset.bill));
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });

  $('historyList').querySelectorAll<HTMLButtonElement>('[data-reshare]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      shareBill(Number(btn.dataset.reshare));
    });
  });
}

export function viewBill(id: number): void {
  const bill = findBill(id);
  if (!bill) return;

  state.viewingBillId = id;
  state.deleteArmed = false;
  $('detailDelBtn').innerHTML = DELETE_ICON + 'Delete Bill';
  $('detailDelBtn').classList.remove('del-confirm');
  const titleEl = $('detailTitle');
  titleEl.innerHTML = esc(bill.label) + ' <span class="pencil-icon" style="width:16px;height:16px;vertical-align:middle;opacity:.5"></span>';
  titleEl.onclick = () => editBillLabel(bill);

  const date = new Date(bill.date);
  $('detailDate').textContent = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  $('detailSummaryCard').innerHTML = `
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
      <div style="display:flex;align-items:center;gap:10px">
        <div class="person-icon" style="background:${person.color}"></div>
        <div>
          <div class="detail-name" style="color:${person.color}">${esc(person.name)}</div>
          <div class="detail-amount">${person.paid ? 'Paid' : 'Owes ' + fmt(person.amount)}</div>
        </div>
      </div>
      <button class="paid-btn ${person.paid ? 'paid' : ''}" data-toggle-paid="${bill.id}-${i}">
        ${person.paid ? '<span class="check-icon" style="margin-right:4px"></span>Paid' : 'Not yet'}
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
  putBill(bill);
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

function editBillLabel(bill: Bill): void {
  const titleEl = $('detailTitle');
  const input = document.createElement('input');
  input.className = 'save-label-input';
  input.value = bill.label;
  input.style.cssText = 'font-size:1.2rem;text-align:center;width:100%';
  titleEl.innerHTML = '';
  titleEl.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const newLabel = input.value.trim() || bill.label;
    bill.label = newLabel;
    putBill(bill);
    titleEl.innerHTML = esc(newLabel) + ' <span class="pencil-icon" style="width:16px;height:16px;vertical-align:middle;opacity:.5"></span>';
    titleEl.onclick = () => editBillLabel(bill);
    showToast('Label updated');
  };

  input.addEventListener('blur', save, { once: true });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
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
  deleteBillFromDB(id);
  showToast('Deleted');
  updateHistoryBadge();
  renderHistory();
  goTo('screenHistory');
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
}
