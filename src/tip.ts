import { $, tap } from './helpers';
import { fmt } from './money';
import { state, getBillTotals } from './state';
import { save } from './storage';
import { updateSummary } from './summary';

export function savePresets(): void {
  save('sp_tipPresets', JSON.stringify(state.tipPresets));
}

export function renderPresets(): void {
  const list = $('presetsList');
  list.innerHTML = state.tipPresets.map((pct: number, i: number) => `
    <div class="preset-row">
      <input class="preset-input" type="number" inputmode="decimal" value="${pct}" min="0" max="100"
             data-preset="${i}" aria-label="Tip preset ${i + 1}" enterkeyhint="done">
      <span class="unit-label">%</span>
      ${state.tipPresets.length > 2
        ? `<button class="preset-del" data-action="removePreset" data-arg="${i}" aria-label="Remove ${pct}% preset"><span class="trash-icon"></span></button>`
        : ''}
    </div>
  `).join('');

  $('presetAddBtn').style.display = state.tipPresets.length >= 4 ? 'none' : 'block';
}

export function updatePreset(index: number, val: string): void {
  const clamped = Math.max(0, Math.min(100, Math.round(parseFloat(val) || 0)));
  state.tipPresets[index] = clamped;
  state.tipPresets.sort((a: number, b: number) => a - b);
  state.tipPresets = [...new Set(state.tipPresets)];
  savePresets();
  renderPresets();
}

export function addPreset(): void {
  if (state.tipPresets.length >= 4) return;
  let val = 25;
  while (state.tipPresets.includes(val) && val > 0) val -= 5;
  if (val <= 0) val = state.tipPresets[state.tipPresets.length - 1] + 5;
  state.tipPresets.push(Math.min(val, 100));
  state.tipPresets.sort((a: number, b: number) => a - b);
  state.tipPresets = [...new Set(state.tipPresets)];
  savePresets();
  renderPresets();
  const idx = state.tipPresets.indexOf(Math.min(val, 100));
  const input = $('presetsList').querySelector<HTMLInputElement>(`[data-preset="${idx}"]`);
  if (input) { input.focus(); input.select(); }
}

export function removePreset(index: string): void {
  if (state.tipPresets.length <= 2) return;
  const i = Number(index);
  state.tipPresets.splice(i, 1);
  savePresets();
  renderPresets();
  const target = Math.min(i, state.tipPresets.length - 1);
  $('presetsList').querySelector<HTMLInputElement>(`[data-preset="${target}"]`)?.focus();
}

export function renderTipRow(): void {
  const row = $('tipRow');
  const printed = state.receipt?.tip ?? null;
  // A tip already printed on the scanned receipt, offered so it isn't added twice
  const receiptBtn = printed !== null
    ? `<button class="tip-btn receipt-tip ${state.useReceiptTip ? 'active' : ''}" data-action="chooseReceiptTip" aria-pressed="${state.useReceiptTip}">Tip on receipt: ${fmt(printed)}</button>`
    : '';
  const { sub, tax } = getBillTotals();
  const tipOn = state.tipBase === 'post' ? sub + tax : sub;
  row.innerHTML = receiptBtn + state.tipPresets.map((pct: number) => {
    const on = pct === state.tipPct && !state.useReceiptTip;
    const dollar = tipOn > 0 ? `<span class="tip-dollar">${fmt(tipOn * pct / 100)}</span>` : '';
    return `<button class="tip-btn ${on ? 'active' : ''}" data-action="setTip" data-arg="${pct}" aria-pressed="${on}">${pct}%${dollar}</button>`;
  }).join('') + `<input class="custom-tip" id="customTip" type="number" inputmode="decimal" placeholder="%" aria-label="Custom tip percent" data-action="setCustomTip" enterkeyhint="done">`;

  const customInput = $('customTip') as HTMLInputElement;
  if (!state.useReceiptTip && !state.tipPresets.includes(state.tipPct)) {
    customInput.value = String(state.tipPct);
  }
}

export function chooseReceiptTip(): void {
  tap();
  state.useReceiptTip = true;
  renderTipRow();
  updateSummary();
}

export function setTipBase(base: 'pre' | 'post'): void {
  tap();
  state.tipBase = base;
  $('tipPreTax').classList.toggle('active', base === 'pre');
  $('tipPostTax').classList.toggle('active', base === 'post');
  $('tipPreTax').setAttribute('aria-pressed', String(base === 'pre'));
  $('tipPostTax').setAttribute('aria-pressed', String(base === 'post'));
  updateSummary();
}

export function setTip(arg: string): void {
  tap();
  const pct = Number(arg);
  state.tipPct = pct;
  state.useReceiptTip = false;
  const custom = $('customTip') as HTMLInputElement | null;
  if (custom) custom.value = '';
  document.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn => {
    const on = btn.dataset.action === 'setTip' && Number(btn.dataset.arg) === pct;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  save('sp_tip', String(pct));
  updateSummary();
}

export function setCustomTip(): void {
  const custom = $('customTip') as HTMLInputElement | null;
  if (!custom) return;
  const val = Math.min(100, parseFloat(custom.value));
  if (!isNaN(val) && val >= 0) {
    state.tipPct = val;
    state.useReceiptTip = false;
    if (val !== parseFloat(custom.value)) custom.value = String(val);
    document.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-pressed', 'false'); });
    save('sp_tip', String(val));
    updateSummary();
  }
}

// The preset fields save when you leave them, not on every keystroke
export function initTipSettings(): void {
  $('presetsList').addEventListener('change', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('[data-preset]');
    if (input) updatePreset(Number(input.dataset.preset), input.value);
  });
}
