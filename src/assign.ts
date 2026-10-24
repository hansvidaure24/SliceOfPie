import { $, COLORS, esc, fmt } from './helpers';
import { state } from './state';

// The Items screen's bottom bar: the running total, and whether anything still needs a person
export function updateItemsCta(): void {
  const sub = state.items.reduce((s, it) => s + (it.price || 0), 0);
  $('itemsCtaTotal').textContent = fmt(sub + state.taxAmt);
  const unassigned = state.splitMode === 'item'
    ? state.items.filter(it => (it.price || 0) !== 0 && !it.assignees?.length).length
    : 0;
  const note = $('itemsCtaNote');
  note.textContent = unassigned
    ? unassigned + (unassigned === 1 ? ' item' : ' items') + ' unassigned'
    : state.taxAmt ? 'Items + tax' : 'Subtotal';
  note.classList.toggle('warn', unassigned > 0);
}

export function renderAssign(): void {
  $('assignList').innerHTML = state.items.map((item, itemIdx) => {
    if (!item.assignees) item.assignees = [];

    const badges = state.people.map((person, personIdx) => {
      const on = item.assignees!.includes(personIdx);
      const style = on ? `background:${COLORS[personIdx % 8]};border-color:${COLORS[personIdx % 8]}` : '';
      return `<button class="person-badge ${on ? 'on' : ''}" style="${style}"
        data-assign="${itemIdx}-${personIdx}">${esc(person.name)}</button>`;
    }).join('');

    return `<div class="assign-wrap">
      <div class="assign-item-label">${esc(item.name || 'Item ' + (itemIdx + 1))} — ${fmt(item.price || 0)}</div>
      <div class="assign-row">
        ${badges}
        <button class="assign-action" data-assign-all="${itemIdx}">All</button>
        <button class="assign-action" data-assign-clear="${itemIdx}">Clear</button>
      </div>
    </div>`;
  }).join('');
  updateItemsCta();

  const list = $('assignList');

  list.querySelectorAll<HTMLButtonElement>('[data-assign]').forEach(btn => {
    const [itemIdx, personIdx] = btn.dataset.assign!.split('-').map(Number);
    btn.addEventListener('click', () => toggleAssign(itemIdx, personIdx));
  });

  list.querySelectorAll<HTMLButtonElement>('[data-assign-all]').forEach(btn => {
    btn.addEventListener('click', () => assignAll(Number(btn.dataset.assignAll)));
  });

  list.querySelectorAll<HTMLButtonElement>('[data-assign-clear]').forEach(btn => {
    btn.addEventListener('click', () => assignClear(Number(btn.dataset.assignClear)));
  });
}

function toggleAssign(itemIdx: number, personIdx: number): void {
  const assignees = state.items[itemIdx].assignees || (state.items[itemIdx].assignees = []);
  const pos = assignees.indexOf(personIdx);
  pos >= 0 ? assignees.splice(pos, 1) : assignees.push(personIdx);
  renderAssign();
}

function assignAll(itemIdx: number): void {
  state.items[itemIdx].assignees = state.people.map((_, i) => i);
  renderAssign();
}

function assignClear(itemIdx: number): void {
  state.items[itemIdx].assignees = [];
  renderAssign();
}
