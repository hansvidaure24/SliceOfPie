import { describe, it, expect, vi, beforeAll } from 'vitest';

// A browser set to block site data throws on every localStorage call
const blocked = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

let storage: typeof import('../src/storage');
let st: typeof import('../src/state');
let money: typeof import('../src/money');
let draft: typeof import('../src/draft');
beforeAll(async () => {
  // Loading these reads saved settings; none of them may throw
  storage = await import('../src/storage');
  st = await import('../src/state');
  money = await import('../src/money');
  draft = await import('../src/draft');
});

describe('when the browser blocks storage', () => {
  it('starts with the default settings', () => {
    expect(st.state.tipPct).toBe(18);
    expect(st.state.tipPresets).toEqual([15, 18, 20]);
    expect(st.state.payment.name).toBe('');
    expect(money.getCurrency()).toBe('$');
  });

  it('keeps working when a setting cannot be saved', () => {
    expect(() => money.setCurrency('€')).not.toThrow();
    expect(money.getCurrency()).toBe('€');
    expect(storage.save('sp_tip', '20')).toBe(false);
  });

  it('has no draft to resume and saving one is harmless', () => {
    expect(draft.restoreDraft()).toBeNull();
    expect(() => draft.saveDraft('screenItems')).not.toThrow();
    expect(() => draft.clearDraft()).not.toThrow();
  });
});

describe('a saved value that is not valid JSON', () => {
  it('falls back to the default', async () => {
    vi.resetModules();
    const store = new Map([['sp_tipPresets', '{oops']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    const fresh = await import('../src/storage');
    expect(fresh.loadJSON('sp_tipPresets', [15, 18, 20])).toEqual([15, 18, 20]);
    expect(store.has('sp_tipPresets')).toBe(false);
  });
});
