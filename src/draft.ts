import { state } from './state';

// The bill being split, kept so the app picks up where it left off after a
// reload. iOS often drops a backgrounded PWA while you switch to Venmo.
const KEY = 'sp_draft';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

const FIELDS = [
  'people', 'splitMode', 'items', 'taxAmt', 'quickTotalAmt', 'quickTaxAmt',
  'tipPct', 'tipBase', 'receipt', 'useReceiptTip', 'taxIncluded', 'roundUp',
  'payer', 'imPartOfBill', 'billSavedThisSession', 'billLabel',
] as const;

type DraftFields = Pick<typeof state, typeof FIELDS[number]>;
interface Draft extends DraftFields {
  screen: string;
  savedAt: number;
}

let currentScreen = 'screenWelcome';

export function saveDraft(screen?: string): void {
  if (screen) currentScreen = screen;
  const draft: Record<string, unknown> = { screen: currentScreen, savedAt: Date.now() };
  for (const key of FIELDS) draft[key] = state[key];
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch { /* storage full or blocked; resuming is a convenience */ }
}

export function clearDraft(): void {
  localStorage.removeItem(KEY);
}

// Copies a recent draft into state and returns the screen it was on
export function restoreDraft(): string | null {
  let draft: Draft;
  try {
    draft = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    clearDraft();
    return null;
  }
  if (!draft || Date.now() - draft.savedAt > MAX_AGE_MS || !Array.isArray(draft.people)) {
    clearDraft();
    return null;
  }
  Object.assign(state, Object.fromEntries(FIELDS.map(key => [key, draft[key]])));
  return draft.screen;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveDraft();
});
window.addEventListener('pagehide', () => saveDraft());
