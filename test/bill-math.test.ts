import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// state.ts and money.ts read saved settings from localStorage when they load
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

let bill: typeof import('../src/bill');
let st: typeof import('../src/state');
let money: typeof import('../src/money');
let colors: typeof import('../src/colors');
beforeAll(async () => {
  bill = await import('../src/bill');
  st = await import('../src/state');
  money = await import('../src/money');
  colors = await import('../src/colors');
});

const amounts = () => bill.calcOwes().map(b => b.amount);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

beforeEach(() => {
  const { state } = st;
  state.people = [{ name: 'Me', isMe: true }, { name: 'Carmine' }];
  state.splitMode = 'item';
  state.items = [];
  state.taxAmt = 0;
  state.quickTotalAmt = 0;
  state.quickTaxAmt = 0;
  state.taxIncluded = true;
  state.tipPct = 0;
  state.tipBase = 'pre';
  state.roundUp = false;
  state.receipt = null;
  state.useReceiptTip = false;
  state.payer = 'me';
  state.imPartOfBill = true;
  money.setCurrency('$');
});

describe('even split', () => {
  it('divides the total equally', () => {
    st.state.splitMode = 'even';
    st.state.people.push({ name: 'Jo' });
    st.state.quickTotalAmt = 90;
    expect(amounts()).toEqual([30, 30, 30]);
  });

  it('adds tax that is not included and a pre-tax tip before dividing', () => {
    Object.assign(st.state, { splitMode: 'even', quickTotalAmt: 100, quickTaxAmt: 8, taxIncluded: false, tipPct: 20 });
    st.state.people.push({ name: 'Jo' }, { name: 'Sam' });
    // 100 + 8 tax + 20 tip (20% of 100) = 128, over 4 people
    expect(amounts()).toEqual([32, 32, 32, 32]);
  });

  it('tips on the post-tax amount when asked', () => {
    Object.assign(st.state, { splitMode: 'even', quickTotalAmt: 100, quickTaxAmt: 10, taxIncluded: false, tipPct: 10, tipBase: 'post' });
    // 100 + 10 + 11 = 121 over 2
    expect(amounts()).toEqual([60.5, 60.5]);
  });

  it('rounds each share up to a whole amount', () => {
    Object.assign(st.state, { splitMode: 'even', quickTotalAmt: 100, roundUp: true });
    st.state.people.push({ name: 'Jo' });
    expect(amounts()).toEqual([34, 34, 34]);
  });
});

describe('split by item', () => {
  it('charges each person for their items plus the same fraction of tax and tip', () => {
    Object.assign(st.state, { taxAmt: 6, tipPct: 18 });
    st.state.items = [
      { name: 'Burger', price: 20, assignees: [0] },
      { name: 'Salad', price: 10, assignees: [1] },
      { name: 'Nachos', price: 30, assignees: [0, 1] },
    ];
    // Items: me 35, Carmine 25 (of 60). Tax 6, tip 18% of 60 = 10.80, total 76.80
    const [me, carmine] = amounts();
    expect(me).toBeCloseTo(35 + 3.5 + 6.3, 10);
    expect(carmine).toBeCloseTo(25 + 2.5 + 4.5, 10);
    expect(me + carmine).toBeCloseTo(76.8, 10);
  });

  it('always adds up to the bill total, in whole cents, when every item is on someone', () => {
    // A fixed pseudo-random sweep of prices, people and assignments
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 200; round++) {
      const people = 1 + Math.floor(rand() * 8);
      st.state.people = Array.from({ length: people }, (_, i) => ({ name: 'P' + i, isMe: i === 0 }));
      st.state.items = Array.from({ length: 1 + Math.floor(rand() * 10) }, (_, i) => {
        const assignees = Array.from({ length: people }, (_, p) => p).filter(() => rand() < 0.5);
        return { name: 'Item ' + i, price: Math.round(rand() * 5000) / 100, assignees: assignees.length ? assignees : [0] };
      });
      Object.assign(st.state, { taxAmt: Math.round(rand() * 900) / 100, tipPct: Math.round(rand() * 25), tipBase: rand() < 0.5 ? 'pre' : 'post' });
      const shares = amounts();
      // The same as the Total line shows
      expect(money.fmt(sum(shares))).toBe(money.fmt(st.getBillTotals().total));
      for (const share of shares) expect(Math.abs(share * 100 - Math.round(share * 100))).toBeLessThan(1e-6);
    }
  });

  it('leaves unassigned items out of everyone\'s share', () => {
    st.state.items = [
      { name: 'Burger', price: 20, assignees: [0] },
      { name: 'Mystery', price: 15, assignees: [] },
    ];
    expect(amounts()).toEqual([20, 0]);
  });

  it('takes a discount assigned to everyone off each share', () => {
    st.state.items = [
      { name: 'Burger', price: 20, assignees: [0] },
      { name: 'Salad', price: 10, assignees: [1] },
      { name: 'Discount', price: -6, assignees: [0, 1] },
    ];
    expect(amounts()).toEqual([17, 7]);
  });

  it('splits tax and tip evenly while nothing is assigned yet', () => {
    Object.assign(st.state, { taxAmt: 4, tipPct: 10 });
    st.state.items = [{ name: 'Burger', price: 20 }];
    // Tax 4 and tip 2 (10% of 20), shared by 2
    expect(amounts()).toEqual([3, 3]);
  });

  it('uses the tip printed on a scanned receipt instead of a percentage', () => {
    Object.assign(st.state, { tipPct: 18, useReceiptTip: true, receipt: { merchant: null, date: null, total: 33, tip: 3 } });
    st.state.items = [{ name: 'A', price: 20, assignees: [0] }, { name: 'B', price: 10, assignees: [1] }];
    expect(amounts()).toEqual([22, 11]);
  });

  it('rounds each share up when asked', () => {
    st.state.roundUp = true;
    st.state.items = [{ name: 'A', price: 10.2, assignees: [0] }, { name: 'B', price: 9.01, assignees: [1] }];
    expect(amounts()).toEqual([11, 10]);
  });

  it('ignores assignments to people who are no longer at the table', () => {
    st.state.items = [{ name: 'A', price: 12, assignees: [0, 5] }];
    expect(amounts()).toEqual([12, 0]);
  });

  it('colors each person by position, the same everywhere', () => {
    st.state.people.push({ name: 'Jo' });
    expect(bill.calcOwes().map(b => b.color)).toEqual([colors.COLORS[0], colors.COLORS[1], colors.COLORS[2]]);
  });
});

describe('whole cents', () => {
  it('gives the leftover cent to whoever paid, so the others add up to what is owed back', () => {
    Object.assign(st.state, { splitMode: 'even', quickTotalAmt: 100 });
    st.state.people.push({ name: 'Jo' });
    expect(amounts()).toEqual([33.34, 33.33, 33.33]);
    st.state.payer = 2;
    expect(amounts()).toEqual([33.33, 33.33, 33.34]);
  });

  it('rounds everyone but the payer to the nearest cent of their exact share', () => {
    Object.assign(st.state, { taxAmt: 1, tipPct: 0 });
    st.state.people.push({ name: 'Jo' });
    st.state.payer = 1;
    st.state.items = [{ name: 'Pizza', price: 10, assignees: [0, 1, 2] }, { name: 'Soda', price: 2.99, assignees: [0] }];
    // Items 12.99 plus 1 tax = 13.99, shared in proportion to the items
    const exact = [10 / 3 + 2.99, 10 / 3, 10 / 3].map(x => x * 13.99 / 12.99);
    const [me, carmine, jo] = amounts();
    expect(Math.abs(me - exact[0])).toBeLessThanOrEqual(0.005);
    expect(Math.abs(jo - exact[2])).toBeLessThanOrEqual(0.005);
    expect(Math.abs(carmine - exact[1])).toBeLessThan(0.02);
    expect(me + carmine + jo).toBeCloseTo(13.99, 10);
  });

  it('gives the cent to the share closest to rounding up when the payer had nothing', () => {
    st.state.people.push({ name: 'Jo' }, { name: 'Sam' });
    st.state.items = [{ name: 'Wine', price: 10, assignees: [1, 2, 3] }];
    expect(amounts()).toEqual([0, 3.34, 3.33, 3.33]);
  });

  it('works in whole units for currencies without cents', () => {
    money.setCurrency('¥');
    Object.assign(st.state, { splitMode: 'even', quickTotalAmt: 1000 });
    st.state.people.push({ name: 'Jo' });
    expect(amounts()).toEqual([334, 333, 333]);
  });

  it('keeps an even split exact when it already divides', () => {
    Object.assign(st.state, { splitMode: 'even', quickTotalAmt: 84.2, quickTaxAmt: 0, tipPct: 18 });
    st.state.people.push({ name: 'Jo' });
    expect(amounts()).toEqual([33.12, 33.12, 33.12]);
  });
});

describe('keeping item assignments right as people change', () => {
  it('drops a removed person and renumbers everyone after them', () => {
    const items = [{ name: 'A', price: 1, assignees: [0, 1, 2] }, { name: 'B', price: 1, assignees: [2] }, { name: 'C', price: 1, assignees: [1] }];
    bill.removePersonFromItems(items, 1);
    expect(items.map(i => i.assignees)).toEqual([[0, 1], [1], []]);
  });

  it('moves everyone up when someone joins at the front', () => {
    const items = [{ name: 'A', price: 1, assignees: [0, 2] }];
    bill.insertPersonInItems(items, 0);
    expect(items[0].assignees).toEqual([1, 3]);
  });

  it('removing then re-adding "me" at the front keeps everyone else on their items', () => {
    const items = [{ name: 'A', price: 1, assignees: [0, 1] }, { name: 'B', price: 1, assignees: [2] }];
    bill.removePersonFromItems(items, 0);
    bill.insertPersonInItems(items, 0);
    // I'm off A; Carmine (1) and Jo (2) are back at their old positions
    expect(items.map(i => i.assignees)).toEqual([[1], [2]]);
  });

  it('drops assignments to people beyond a smaller group', () => {
    const items = [{ name: 'A', price: 1, assignees: [0, 3, 4] }];
    bill.pruneAssignees(items, 4);
    expect(items[0].assignees).toEqual([0, 3]);
  });
});

describe('who paid', () => {
  it('names you when you paid', () => {
    st.state.people[0].name = 'Hans';
    expect(st.getPayerName()).toBe('Hans');
    expect(st.isPayer(0)).toBe(true);
    expect(st.isPayer(1)).toBe(false);
  });

  it('names the person picked as payer', () => {
    st.state.payer = 1;
    expect(st.getPayerName()).toBe('Carmine');
    expect(st.isPayer(1)).toBe(true);
    expect(st.isPayer(0)).toBe(false);
  });
});

describe('money formatting', () => {
  it('shows cents for most currencies', () => {
    expect(money.fmt(12.5)).toBe('$12.50');
    expect(money.fmt(-6)).toBe('-$6.00');
    expect(money.fmt(-0.001)).toBe('$0.00');
    // 178.365 is stored as 178.36499999...; half a cent still rounds up
    expect(money.fmt(178.365)).toBe('$178.37');
    expect(money.fmt(-2.005)).toBe('-$2.01');
  });

  it('shows whole amounts for currencies without cents', () => {
    money.setCurrency('¥');
    expect(money.fmt(1234.4)).toBe('¥1234');
    money.setCurrency('₩');
    expect(money.fmt(5000)).toBe('₩5000');
  });
});
