import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

let draft: typeof import('../src/draft');
let st: typeof import('../src/state');
beforeAll(async () => {
  draft = await import('../src/draft');
  st = await import('../src/state');
});

beforeEach(() => {
  store.clear();
  st.state.people = [{ name: 'Me', isMe: true }, { name: 'Carmine' }];
  st.state.items = [{ name: 'Tacos', price: 18, assignees: [0, 1] }];
  st.state.splitMode = 'item';
  st.state.tipPct = 20;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resuming a bill in progress', () => {
  it('brings back the bill and the screen it was on', () => {
    draft.saveDraft('screenItems');
    st.state.people = [];
    st.state.items = [];
    st.state.tipPct = 15;

    expect(draft.restoreDraft()).toBe('screenItems');
    expect(st.state.people.map(p => p.name)).toEqual(['Me', 'Carmine']);
    expect(st.state.items).toEqual([{ name: 'Tacos', price: 18, assignees: [0, 1] }]);
    expect(st.state.tipPct).toBe(20);
  });

  it('remembers the last screen when saved again without one (e.g. leaving the app)', () => {
    draft.saveDraft('screenSummary');
    draft.saveDraft();
    expect(draft.restoreDraft()).toBe('screenSummary');
  });

  it('ignores and clears a draft older than three hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00'));
    draft.saveDraft('screenItems');
    vi.setSystemTime(new Date('2026-10-24T15:00:01'));
    expect(draft.restoreDraft()).toBeNull();
    expect(store.has('sp_draft')).toBe(false);
  });

  it('keeps a draft just under three hours old', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00'));
    draft.saveDraft('screenItems');
    vi.setSystemTime(new Date('2026-10-24T14:59:00'));
    expect(draft.restoreDraft()).toBe('screenItems');
  });

  it('clears a damaged draft instead of failing', () => {
    store.set('sp_draft', '{not json');
    expect(draft.restoreDraft()).toBeNull();
    expect(store.has('sp_draft')).toBe(false);
  });

  it('has nothing to restore after a new bill clears it', () => {
    draft.saveDraft('screenItems');
    draft.clearDraft();
    expect(draft.restoreDraft()).toBeNull();
  });
});
