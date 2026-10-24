import { $, COLORS, esc, showToast } from './helpers';
import { state } from './state';
import { removePersonFromItems, pruneAssignees } from './bill';
import { renderLiveSummary } from './layout';

function loadLastGroup(): void {
  const last = state.history[0];
  if (!last) return;
  state.people = last.people.map((p, i) => ({
    name: p.name,
    isMe: state.imPartOfBill && i === 0,
  }));
  // Items already on someone who isn't in this group come off them
  pruneAssignees(state.items, state.people.length);
  if (typeof state.payer === 'number' && state.payer >= state.people.length) state.payer = state.imPartOfBill ? 'me' : 0;
  showPeople();
  showToast('Loaded ' + last.people.length + ' people from "' + last.label + '"');
}

// Contact Picker API (Android Chrome); elsewhere the button isn't shown
interface ContactsManager {
  select(props: string[], opts?: { multiple?: boolean }): Promise<{ name?: string[] }[]>;
}
const contacts = (navigator as Navigator & { contacts?: ContactsManager }).contacts;

const MAX_OTHERS = 8;
const PLACEHOLDER = /^person \d+$/i;

// Fills the first unnamed "Person N" slot, or adds a person; false if not added
function addPersonNamed(raw: string): boolean {
  const name = raw.trim().slice(0, 20);
  if (!name || state.people.some(p => p.name.toLowerCase() === name.toLowerCase())) return false;
  const blank = state.people.find(p => !p.isMe && PLACEHOLDER.test(p.name));
  if (blank) blank.name = name;
  else if (otherCount() < MAX_OTHERS) state.people.push({ name });
  else return false;
  return true;
}

function showPeople(): void {
  const ctr = $('peopleCount');
  ctr.textContent = String(state.people.length);
  ctr.setAttribute('aria-label', state.people.length + ' people splitting');
  updateCounterState();
  renderNames();
  renderLiveSummary();
}

async function pickContacts(): Promise<void> {
  let picked: { name?: string[] }[];
  try {
    picked = await contacts!.select(['name'], { multiple: true });
  } catch {
    return; // cancelled
  }
  const added = picked.filter(c => c.name?.[0] && addPersonNamed(c.name[0])).length;
  showPeople();
  if (added < picked.length) showToast(otherCount() >= MAX_OTHERS ? 'Up to ' + MAX_OTHERS + ' people besides you' : 'Some were already on the list');
}

// People from saved bills, newest first, who aren't on this one yet
function recentNames(): string[] {
  const skip = new Set([state.payment.name.toLowerCase(), 'me', ...state.people.map(p => p.name.toLowerCase())]);
  const names: string[] = [];
  for (const bill of state.history) {
    for (const person of bill.people) {
      const key = person.name.toLowerCase();
      if (skip.has(key) || PLACEHOLDER.test(key)) continue;
      skip.add(key);
      names.push(person.name);
    }
  }
  return names.slice(0, 6);
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
        removePersonFromItems(state.items, i);
        break;
      }
    }
  }

  if (typeof state.payer === 'number' && state.payer >= state.people.length) {
    state.payer = state.imPartOfBill ? 'me' : 0;
  }

  showPeople();
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
      <div class="person-icon" style="background:${COLORS[i % 8]}"></div>
      <input class="person-name-input" value="${esc(person.name)}"
             placeholder="${person.isMe ? 'Your name' : 'Name'}"
             maxlength="20"
             data-person="${i}"
             aria-label="${person.isMe ? 'Your name' : 'Person ' + (i + 1) + ' name'}"
             ${person.isMe ? 'data-me' : ''}>
      ${person.isMe ? '<div class="me-toggle-row"><span class="me-label">I\'m splitting</span><button class="toggle on" data-toggle="partOfBill" data-action="togglePartOfBill" role="switch" aria-checked="true" aria-label="I\'m part of this bill"></button></div>' : ''}
    </div>
  `).join('');

  const joinRow = !state.imPartOfBill ? `
    <div class="person-name-row join-row">
      <span class="join-label">Not splitting?</span>
      <button class="toggle" data-toggle="partOfBill" data-action="togglePartOfBill" role="switch" aria-checked="false" aria-label="Join this bill"></button>
    </div>
  ` : '';

  const recent = recentNames();
  const contactsBtn = contacts
    ? '<button class="btn btn-secondary contacts-btn" data-contacts><span class="person-icon"></span>Add from contacts</button>'
    : '';
  const quickAdd = state.history.length > 0 ? `
    <div class="quick-add">
      <span class="section-label">Add again</span>
      <div class="quick-add-chips">
        ${recent.map(name => `<button class="name-chip" data-recent="${esc(name)}"><span class="add-icon" aria-hidden="true"></span>${esc(name)}</button>`).join('')}
        <button class="name-chip" data-last-group>Last group</button>
      </div>
    </div>` : '';

  $('namesList').innerHTML = rows + joinRow + contactsBtn + quickAdd;

  $('namesList').querySelector('[data-last-group]')?.addEventListener('click', loadLastGroup);
  $('namesList').querySelector('[data-contacts]')?.addEventListener('click', () => void pickContacts());
  $('namesList').querySelectorAll<HTMLButtonElement>('[data-recent]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (addPersonNamed(btn.dataset.recent!)) showPeople();
      else showToast('Up to ' + MAX_OTHERS + ' people besides you');
    });
  });

  $('namesList').querySelectorAll<HTMLInputElement>('[data-person]').forEach(input => {
    const idx = Number(input.dataset.person);
    const fallback = state.people[idx].isMe ? 'Me' : 'Person ' + (idx + 1);
    input.addEventListener('input', () => {
      state.people[idx].name = input.value || fallback;
      renderLiveSummary();
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) input.value = fallback;
    });
  });
}
