import { $, esc, tap } from './helpers';
import { personColor, inkOn } from './colors';
import { fmt } from './money';
import { state } from './state';
import { renderLiveSummary } from './layout';
import { unassignedIndexes } from './bill';
import { onEnterScreen } from './router';

onEnterScreen('screenItems', renderAssign);

export function unassignedCount(): number {
  return unassignedIndexes().length;
}

// The Items screen's bottom bar: the running total, and whether anything still needs a person
export function updateItemsCta(): void {
  const sub = state.items.reduce((s, it) => s + (it.price || 0), 0);
  $('itemsCtaTotal').textContent = fmt(sub + state.taxAmt);
  const unassigned = unassignedIndexes();
  const note = $('itemsCtaNote');
  note.textContent = unassigned.length
    ? unassigned.length + (unassigned.length === 1 ? ' item' : ' items') + ' unassigned'
    : state.taxAmt ? 'Items + tax' : 'Subtotal';
  note.classList.toggle('warn', unassigned.length > 0);
  $('itemsList').querySelectorAll<HTMLElement>('[data-row]').forEach(row => {
    row.classList.toggle('unassigned', unassigned.includes(Number(row.dataset.row)));
  });
  renderLiveSummary();
}

// The person chips under an item: tap a name to put it on their share
export function whoChips(itemIdx: number): string {
  if (state.splitMode !== 'item') return '';
  const item = state.items[itemIdx];
  if (!item.assignees) item.assignees = [];
  const everyone = state.people.length > 1 && item.assignees.length === state.people.length;
  const chips = state.people.map((person, personIdx) => {
    const on = item.assignees!.includes(personIdx);
    return `<button class="who-chip${on ? ' on' : ''}" style="--who:${personColor(personIdx)};--who-ink:${inkOn(personColor(personIdx))}"
      data-assign="${itemIdx}-${personIdx}" aria-pressed="${on}" title="${esc(person.name)}">${esc(person.name)}</button>`;
  }).join('');
  const all = state.people.length > 1
    ? `<button class="who-chip who-all${everyone ? ' on' : ''}" data-assign-all="${itemIdx}" aria-pressed="${everyone}">Everyone</button>`
    : '';
  return chips + all;
}

// Column headings for the wide layout, where people become columns
export function itemsHead(): string {
  if (state.splitMode !== 'item') return '';
  const names = state.people.map((p, i) =>
    `<span class="head-person" style="--who:${personColor(i)}" title="${esc(p.name)}">${esc(p.name)}</span>`
  ).join('');
  return `<div class="items-head" data-items-head aria-hidden="true"><span>Item</span><span class="head-price">Price</span>${names}${state.people.length > 1 ? '<span class="head-person">All</span>' : ''}</div>`;
}

export function whoColumns(): number {
  return state.people.length + (state.people.length > 1 ? 1 : 0);
}

// Redraws every item's chips, e.g. after people were renamed or added
export function renderAssign(): void {
  const head = $('itemsList').querySelector('[data-items-head]');
  if (head) head.outerHTML = itemsHead();
  const cols = whoColumns();
  $('itemsList').style.setProperty('--who-cols', cols ? `repeat(${cols}, 3.25rem)` : '0px');
  $('itemsList').querySelectorAll<HTMLElement>('[data-who]').forEach(group => {
    keepingFocus(group, () => { group.innerHTML = whoChips(Number(group.dataset.who)); });
  });
  updateItemsCta();
}

function renderChips(itemIdx: number): void {
  const group = $('itemsList').querySelector<HTMLElement>(`[data-who="${itemIdx}"]`);
  if (group) keepingFocus(group, () => { group.innerHTML = whoChips(itemIdx); });
  updateItemsCta();
}

// Redrawing chips replaces the buttons; put keyboard focus back on the same one
function keepingFocus(group: HTMLElement, redraw: () => void): void {
  const focused = document.activeElement as HTMLElement | null;
  const key = group.contains(focused) ? focused!.dataset.assign ?? 'all-' + focused!.dataset.assignAll : null;
  redraw();
  if (!key) return;
  const sel = key.startsWith('all-') ? `[data-assign-all="${key.slice(4)}"]` : `[data-assign="${key}"]`;
  group.querySelector<HTMLElement>(sel)?.focus();
}

function toggleAssign(itemIdx: number, personIdx: number): void {
  const assignees = state.items[itemIdx].assignees || (state.items[itemIdx].assignees = []);
  const pos = assignees.indexOf(personIdx);
  pos >= 0 ? assignees.splice(pos, 1) : assignees.push(personIdx);
  renderChips(itemIdx);
}

// Everyone, or nobody when everyone was already on it
function toggleAll(itemIdx: number): void {
  const item = state.items[itemIdx];
  item.assignees = item.assignees?.length === state.people.length ? [] : state.people.map((_, i) => i);
  renderChips(itemIdx);
}

// One listener for every chip, since rows are redrawn as items change
export function initAssign(): void {
  // Alt+1..9 puts person N on the item whose field has focus
  $('itemsList').addEventListener('keydown', (e) => {
    if (!e.altKey || !/^Digit[1-9]$/.test(e.code) || state.splitMode !== 'item') return;
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
    const personIdx = Number(e.code.slice(5)) - 1;
    if (!row || personIdx >= state.people.length) return;
    e.preventDefault();
    toggleAssign(Number(row.dataset.row), personIdx);
  });

  $('itemsList').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-assign],[data-assign-all]');
    if (!btn) return;
    tap();
    if (btn.dataset.assignAll !== undefined) {
      toggleAll(Number(btn.dataset.assignAll));
      return;
    }
    const [itemIdx, personIdx] = btn.dataset.assign!.split('-').map(Number);
    toggleAssign(itemIdx, personIdx);
  });
}

// Brings the first item nobody is on into view
export function showFirstUnassigned(): void {
  const first = unassignedIndexes()[0];
  const row = $('itemsList').querySelector<HTMLElement>(`[data-row="${first}"]`);
  if (!row) return;
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
}
