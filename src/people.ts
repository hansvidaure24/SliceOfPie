import { $, esc, tap } from './helpers';
import { personColor } from './colors';
import { showToast } from './notify';
import { state } from './state';
import { removePersonFromItems, pruneAssignees } from './bill';
import { renderLiveSummary } from './layout';
import { onEnterScreen } from './router';

onEnterScreen('screenPeople', () => {
  updateCounterState();
  renderNames();
  $('peopleNextBtn').textContent = state.splitMode === 'even' ? 'Next: Total' : 'Next: Scan';
});

export function loadLastGroup(): void {
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
export const PLACEHOLDER = /^person \d+$/i;

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

export async function pickContacts(): Promise<void> {
  let picked: { name?: string[] }[];
  try {
    picked = await contacts!.select(['name'], { multiple: true });
  } catch {
    return; // cancelled
  }
  if (!picked.length) return;
  const added = picked.filter(c => c.name?.[0] && addPersonNamed(c.name[0])).length;
  showPeople();
  if (added > 0 && added === picked.length) showToast('Added ' + added + (added === 1 ? ' person' : ' people'));
  else if (added < picked.length) showToast(otherCount() >= MAX_OTHERS ? 'Up to ' + MAX_OTHERS + ' people besides you' : 'Some were already on the list');
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

function nextPlaceholder(): string {
  const taken = new Set(state.people.map(p => p.name.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = 'Person ' + n;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export function changePeople(delta: number): void {
  tap();
  const target = Math.max(1, Math.min(8, otherCount() + delta));

  while (otherCount() < target) {
    state.people.push({ name: nextPlaceholder() });
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
  if (delta > 0) focusLastName();
}

function focusLastName(): void {
  const inputs = $('namesList').querySelectorAll<HTMLInputElement>('.person-name-input');
  const last = inputs[inputs.length - 1];
  if (last) setTimeout(() => { last.focus(); last.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50);
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
      <div class="person-icon" style="background:${personColor(i)}"></div>
      <input class="person-name-input" value="${esc(person.name)}"
             placeholder="${person.isMe ? 'Your name' : 'Name'}"
             maxlength="20"
             data-person="${i}"
             aria-label="${person.isMe ? 'Your name' : 'Person ' + (i + 1) + ' name'}"
             enterkeyhint="${i < state.people.length - 1 ? 'next' : 'done'}"
             autocomplete="off" autocapitalize="words" spellcheck="false"
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
    ? '<button class="btn btn-secondary contacts-btn" data-action="pickContacts"><span class="person-icon"></span>Add from contacts</button>'
    : '';
  const lastGroup = state.history[0];
  const lastNames = lastGroup ? new Set(lastGroup.people.map(p => p.name.toLowerCase())) : null;
  const currentNames = new Set(state.people.map(p => p.name.toLowerCase()));
  const sameGroup = lastNames && lastNames.size === currentNames.size && [...lastNames].every(n => currentNames.has(n));
  const quickAdd = state.history.length > 0 && (recent.length > 0 || !sameGroup) ? `
    <div class="quick-add">
      <span class="section-label">Add again</span>
      <div class="quick-add-chips">
        ${recent.map(name => `<button class="name-chip" data-action="addRecentName" data-arg="${esc(name)}"><span class="add-icon" aria-hidden="true"></span>${esc(name)}</button>`).join('')}
        ${sameGroup ? '' : `<button class="name-chip" data-action="loadLastGroup">Last group${lastGroup.label ? ' · ' + esc(lastGroup.label) : ''}</button>`}
      </div>
    </div>` : '';

  $('namesList').innerHTML = rows + joinRow + contactsBtn + quickAdd;
}

// A name from "Add again"
export function addRecentName(name: string): void {
  tap();
  if (addPersonNamed(name)) { showPeople(); focusLastName(); }
  else showToast('Up to ' + MAX_OTHERS + ' people besides you');
}

// The name fields, through one set of listeners since the list is redrawn
export function initPeople(): void {
  const nameField = (e: Event) => (e.target as HTMLElement).closest<HTMLInputElement>('[data-person]');
  const fallback = (idx: number) => state.people[idx]?.isMe ? 'Me' : 'Person ' + (idx + 1);
  $('namesList').addEventListener('input', (e) => {
    const input = nameField(e);
    const person = input && state.people[Number(input.dataset.person)];
    if (!person) return;
    person.name = input.value || fallback(Number(input.dataset.person));
    renderLiveSummary();
  });
  $('namesList').addEventListener('focusout', (e) => {
    const input = nameField(e);
    if (input && !input.value.trim()) input.value = fallback(Number(input.dataset.person));
  });
}
