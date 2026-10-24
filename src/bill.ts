import { COLORS } from './helpers';
import { state, getBillTotals } from './state';
import type { Breakdown, Item } from './types';

// The money math, kept free of the page so it can be tested on its own

// Who each item is on, ignoring anyone no longer at the table
function validAssignees(item: Item, peopleCount: number): number[] {
  return (item.assignees || []).filter(i => Number.isInteger(i) && i >= 0 && i < peopleCount);
}

// What each person owes: an even share of the total, or the items they had
// plus the same fraction of the tax and tip
export function calcOwes(): Breakdown[] {
  const { tax, tip, total } = getBillTotals();
  const count = state.people.length;

  if (state.splitMode === 'even') {
    let perPerson = total / count;
    if (state.roundUp) perPerson = Math.ceil(perPerson);
    return state.people.map((p, i) => ({
      name: p.name,
      amount: perPerson,
      color: COLORS[i % 8],
    }));
  }

  // By item: an item shared by several people is split equally between them
  const owes = Array(count).fill(0) as number[];
  for (const item of state.items) {
    const assigned = validAssignees(item, count);
    if (assigned.length === 0) continue;
    const share = (item.price || 0) / assigned.length;
    assigned.forEach(personIdx => owes[personIdx] += share);
  }
  const itemTotal = owes.reduce((sum, val) => sum + val, 0);

  return state.people.map((person, i) => {
    // Nothing assigned yet: tax and tip are split evenly until there is
    const personTax = itemTotal > 0 ? (owes[i] / itemTotal) * tax : tax / count;
    const personTip = itemTotal > 0 ? (owes[i] / itemTotal) * tip : tip / count;
    let amount = owes[i] + personTax + personTip;
    if (state.roundUp) amount = Math.ceil(amount);
    return { name: person.name, amount, color: COLORS[i % 8] };
  });
}

// Person `removed` left: take them off every item and renumber everyone after them
export function removePersonFromItems(items: Item[], removed: number): void {
  for (const item of items) {
    if (item.assignees) item.assignees = item.assignees.filter(a => a !== removed).map(a => a > removed ? a - 1 : a);
  }
}

// Someone joined at `at`: everyone from there on moves up one
export function insertPersonInItems(items: Item[], at: number): void {
  for (const item of items) {
    if (item.assignees) item.assignees = item.assignees.map(a => a >= at ? a + 1 : a);
  }
}

// After the whole group was swapped out, drop assignments to people who aren't there
export function pruneAssignees(items: Item[], peopleCount: number): void {
  for (const item of items) {
    if (item.assignees) item.assignees = validAssignees(item, peopleCount);
  }
}
