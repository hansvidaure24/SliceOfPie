import { $, COLORS, esc } from './helpers';
import { state } from './state';

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
      if (!state.people[i].isMe) { state.people.splice(i, 1); break; }
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

  $('namesList').innerHTML = rows + joinRow;

  $('namesList').querySelectorAll<HTMLInputElement>('[data-person]').forEach(input => {
    const idx = Number(input.dataset.person);
    const fallback = state.people[idx].isMe ? 'Me' : 'Person ' + (idx + 1);
    input.addEventListener('input', () => {
      state.people[idx].name = input.value || fallback;
    });
  });
}
