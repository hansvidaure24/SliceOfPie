import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// state.ts reads saved settings from localStorage when it loads
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

let mod: typeof import('../src/state');
beforeAll(async () => {
  mod = await import('../src/state');
});

beforeEach(() => {
  const { state } = mod;
  state.splitMode = 'item';
  state.items = [{ name: 'Soup', price: 100 }];
  state.taxAmt = 9;
  state.tipPct = 18;
  state.tipBase = 'pre';
  state.receipt = null;
  state.useReceiptTip = false;
});

describe('bill totals with a scanned receipt', () => {
  it('uses the tip percentage when there is no printed tip', () => {
    expect(mod.getBillTotals()).toMatchObject({ sub: 100, tax: 9, tip: 18, total: 127 });
    expect(mod.tipLabel()).toBe('Tip (18%)');
  });

  it('uses the printed tip instead of adding a percentage on top', () => {
    mod.state.receipt = { merchant: null, date: null, total: 129, tip: 20 };
    mod.state.useReceiptTip = true;
    expect(mod.getBillTotals()).toMatchObject({ tip: 20, total: 129 });
    expect(mod.tipLabel()).toBe('Tip (from receipt)');
    expect(mod.effectiveTipPct()).toBe(20);
  });

  it('goes back to the percentage when the user picks one', () => {
    mod.state.receipt = { merchant: null, date: null, total: 129, tip: 20 };
    mod.state.useReceiptTip = false;
    expect(mod.getBillTotals().tip).toBe(18);
    expect(mod.effectiveTipPct()).toBe(18);
  });

  it('records the printed tip as a percentage of whatever the tip is based on', () => {
    mod.state.receipt = { merchant: null, date: null, total: 131.69, tip: 20.09 };
    mod.state.useReceiptTip = true;
    mod.state.tipBase = 'post';
    expect(mod.effectiveTipPct()).toBe(18.4); // 20.09 / 109.00
  });

  it('subtracts a discount line from the subtotal', () => {
    mod.state.items = [{ name: 'Milk', price: 6.49 }, { name: 'Discount', price: -1 }];
    mod.state.taxAmt = 0;
    expect(mod.getBillTotals().sub).toBeCloseTo(5.49);
  });
});
