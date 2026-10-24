import { personColor } from './colors';
import { currencyDecimals, toUnits } from './money';
import { state, getBillTotals } from './state';
import type { Breakdown, Item } from './types';

// The money math, kept free of the page so it can be tested on its own

// Who each item is on, ignoring anyone no longer at the table
function validAssignees(item: Item, peopleCount: number): number[] {
  return (item.assignees || []).filter(i => Number.isInteger(i) && i >= 0 && i < peopleCount);
}

// What each person owes: an even share of the total, or the items they had
// plus the same fraction of the tax and tip. In whole cents that add up to
// the bill, or whole units when rounding up.
export function calcOwes(): Breakdown[] {
  const exact = exactShares();
  const amounts = state.roundUp ? exact.map(Math.ceil) : toCents(exact, payerIndex());
  return state.people.map((person, i) => ({ name: person.name, amount: amounts[i], color: personColor(i) }));
}

function exactShares(): number[] {
  const { tax, tip, total } = getBillTotals();
  const count = state.people.length;

  if (state.splitMode === 'even') return state.people.map(() => total / count);

  // By item: an item shared by several people is split equally between them
  const owes = Array(count).fill(0) as number[];
  for (const item of state.items) {
    const assigned = validAssignees(item, count);
    if (assigned.length === 0) continue;
    const share = (item.price || 0) / assigned.length;
    assigned.forEach(personIdx => owes[personIdx] += share);
  }
  const itemTotal = owes.reduce((sum, val) => sum + val, 0);

  return owes.map(owed => {
    // Nothing assigned yet: tax and tip are split evenly until there is
    const personTax = itemTotal > 0 ? (owed / itemTotal) * tax : tax / count;
    const personTip = itemTotal > 0 ? (owed / itemTotal) * tip : tip / count;
    return owed + personTax + personTip;
  });
}

function payerIndex(): number {
  return state.payer === 'me' ? state.people.findIndex(p => p.isMe) : state.payer;
}

// $100 three ways is $33.33, $33.33 and $33.34: everyone else's share is
// rounded to the nearest cent and whoever paid takes what's left over, so the
// shares always add up to the bill. When the payer had nothing on it, the
// spare cents go to the shares that were closest to rounding up.
export function toCents(exact: number[], payer: number): number[] {
  const scale = 10 ** currencyDecimals();
  const scaled = exact.map(x => x * scale);
  const target = toUnits(exact.reduce((s, x) => s + x, 0));
  if (exact[payer] > 0) {
    const units = exact.map(toUnits);
    units[payer] = 0;
    units[payer] = target - units.reduce((s, x) => s + x, 0);
    return units.map(u => u / scale);
  }
  // 33.33 * 100 can come out as 3332.9999999
  const units = scaled.map(x => Math.floor(x + 1e-6));
  let left = target - units.reduce((s, x) => s + x, 0);
  const byRemainder = scaled.map((_, i) => i).sort((a, b) => (scaled[b] - units[b]) - (scaled[a] - units[a]) || a - b);
  for (const i of byRemainder) {
    if (left <= 0) break;
    units[i]++;
    left--;
  }
  return units.map(u => u / scale);
}

// Items with a price that nobody is on yet, by position in the list. Includes a
// negative "Discount" line, which also has to go to someone.
export function unassignedIndexes(): number[] {
  if (state.splitMode !== 'item') return [];
  return state.items.flatMap((it, i) => (it.price || 0) !== 0 && !it.assignees?.length ? [i] : []);
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
