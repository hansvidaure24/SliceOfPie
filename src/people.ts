import { $, COLORS, esc, showToast } from './helpers';
import { state } from './state';

function loadLastGroup(): void {
  const last = state.history[0];
  if (!last) return;
  state.people = last.people.map((p, i) => ({
    name: p.name,
    isMe: state.imPartOfBill && i === 0,
  }));
  $('peopleCount').textContent = String(state.people.length);
  renderNames();
  showToast('Loaded ' + last.people.length + ' people from "' + last.label + '"');
}

function otherCount(): number {
  return state.people.filter(p => !p.isMe).length;
}

export function changePeople(delta: number): void {
  const target = Math.max(1, Math.min(8, otherCount() + delta));

  while (otherCount() < target) {
    state.people.push({ name: 'Person ' + (otherCount() + 1) });
  }
  while (otherCount() > target) {
    for (let i = state.people.length - 1; i >= 0; i--) {
      if (!state.people[i].isMe) {
        state.people.splice(i, 1);
        // Fix assignee indices: drop references to removed person, shift down indices above it
        for (const item of state.items) {
          if (item.assignees) item.assignees = item.assignees.filter(a => a !== i).map(a => a > i ? a - 1 : a);
        }
        break;
      }
    }
  }

  if (typeof state.payer === 'number' && state.payer >= state.people.length) {
    state.payer = state.imPartOfBill ? 'me' : 0;
  }

  $('peopleCount').textContent = String(state.people.length);
  renderNames();
}

export function renderNames(): void {
  const rows = state.people.map((person, i) => `
    <div class="person-name-row">
      <div class="person-icon" style="background:${person.isMe ? 'var(--crust)' : COLORS[i % 8]}"></div>
      <input class="person-name-input" value="${esc(person.name)}"
             placeholder="${person.isMe ? 'Your name' : 'Name'}"
             data-person="${i}"
             aria-label="${person.isMe ? 'Your name' : 'Person ' + (i + 1) + ' name'}"
             style="${person.isMe ? 'border-bottom-color:var(--crust)' : ''}">
      ${person.isMe ? '<button class="toggle on" id="partOfBillToggle" onclick="togglePartOfBill()" role="switch" aria-checked="true" aria-label="I\'m part of this bill" style="flex-shrink:0"></button>' : ''}
    </div>
  `).join('');

  const joinRow = !state.imPartOfBill ? `
    <div class="person-name-row" style="justify-content:center;gap:8px;padding:10px 0;opacity:.7">
      <span style="font-size:.8rem;color:var(--muted)">Not splitting?</span>
      <button class="toggle" id="partOfBillToggle" onclick="togglePartOfBill()" role="switch" aria-checked="false" aria-label="Join this bill" style="flex-shrink:0"></button>
    </div>
  ` : '';

  const lastGroupBtn = state.history.length > 0
    ? '<button class="btn btn-ghost last-group-btn" style="margin-top:8px;padding:8px;font-size:.75rem;width:auto;display:inline-block;border-color:var(--surface2)">Last group</button>'
    : '';

  $('namesList').innerHTML = rows + joinRow + lastGroupBtn;

  const lastBtn = $('namesList').querySelector('.last-group-btn');
  if (lastBtn) {
    lastBtn.addEventListener('click', loadLastGroup);
  }

  $('namesList').querySelectorAll<HTMLInputElement>('[data-person]').forEach(input => {
    const idx = Number(input.dataset.person);
    const fallback = state.people[idx].isMe ? 'Me' : 'Person ' + (idx + 1);
    input.addEventListener('input', () => {
      state.people[idx].name = input.value || fallback;
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) input.value = fallback;
    });
  });
}
