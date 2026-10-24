import { $, COLORS, esc, showToast } from './helpers';
import { state } from './state';

function loadLastGroup(): void {
  const last = state.history[0];
  if (!last) return;
  state.people = last.people.map((p, i) => ({
    name: p.name,
    isMe: state.imPartOfBill && i === 0,
  }));
  const el = $('peopleCount');
  el.textContent = String(state.people.length);
  el.setAttribute('aria-label', state.people.length + ' people splitting');
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

  const ctr = $('peopleCount');
  ctr.textContent = String(state.people.length);
  ctr.setAttribute('aria-label', state.people.length + ' people splitting');
  updateCounterState();
  renderNames();
}

export function updateCounterState(): void {
  ($('btnMinus') as HTMLButtonElement).disabled = otherCount() <= 1;
  ($('btnPlus') as HTMLButtonElement).disabled = otherCount() >= 8;
  $('peopleSubtitle').textContent = state.imPartOfBill
    ? 'How many others are splitting?'
    : 'How many people at the table?';
}

export function renderNames(): void {
  const rows = state.people.map((person, i) => `
    <div class="person-name-row">
      <div class="person-icon" style="background:${person.isMe ? 'var(--crust)' : COLORS[i % 8]}"></div>
      <input class="person-name-input" value="${esc(person.name)}"
             placeholder="${person.isMe ? 'Your name' : 'Name'}"
             maxlength="20"
             data-person="${i}"
             aria-label="${person.isMe ? 'Your name' : 'Person ' + (i + 1) + ' name'}"
             ${person.isMe ? 'data-me' : ''}>
      ${person.isMe ? '<div class="me-toggle-row"><span class="me-label">I\'m splitting</span><button class="toggle on" data-toggle="partOfBill" onclick="togglePartOfBill()" role="switch" aria-checked="true" aria-label="I\'m part of this bill"></button></div>' : ''}
    </div>
  `).join('');

  const joinRow = !state.imPartOfBill ? `
    <div class="person-name-row join-row">
      <span class="join-label">Not splitting?</span>
      <button class="toggle" data-toggle="partOfBill" onclick="togglePartOfBill()" role="switch" aria-checked="false" aria-label="Join this bill"></button>
    </div>
  ` : '';

  const lastGroupBtn = state.history.length > 0
    ? '<button class="btn btn-ghost last-group-btn">Last group</button>'
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
