import { $, tap, fmt } from './helpers';
import { state } from './state';
import { updateSummary } from './summary';

export function savePresets(): void {
  localStorage.setItem('sp_tipPresets', JSON.stringify(state.tipPresets));
}

export function renderPresets(): void {
  const list = $('presetsList');
  list.innerHTML = state.tipPresets.map((pct: number, i: number) => `
    <div class="preset-row">
      <input class="preset-input" type="number" inputmode="decimal" value="${pct}" min="0" max="100"
             data-preset="${i}" aria-label="Tip preset ${i + 1}">
      <span class="unit-label">%</span>
      ${state.tipPresets.length > 2
        ? `<button class="preset-del" data-preset-del="${i}" aria-label="Remove ${pct}% preset"><span class="trash-icon"></span></button>`
        : ''}
    </div>
  `).join('');

  list.querySelectorAll<HTMLInputElement>('[data-preset]').forEach(input => {
    input.addEventListener('change', () => updatePreset(Number(input.dataset.preset), input.value));
  });
  list.querySelectorAll<HTMLButtonElement>('[data-preset-del]').forEach(btn => {
    btn.addEventListener('click', () => removePreset(Number(btn.dataset.presetDel)));
  });

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
  state.tipPresets.push(25);
  state.tipPresets.sort((a: number, b: number) => a - b);
  state.tipPresets = [...new Set(state.tipPresets)];
  savePresets();
  renderPresets();
}

export function removePreset(index: number): void {
  if (state.tipPresets.length <= 2) return;
  state.tipPresets.splice(index, 1);
  savePresets();
  renderPresets();
}

export function renderTipRow(): void {
  const row = $('tipRow');
  const printed = state.receipt?.tip ?? null;
  // A tip already printed on the scanned receipt, offered so it isn't added twice
  const receiptBtn = printed !== null
    ? `<button class="tip-btn receipt-tip ${state.useReceiptTip ? 'active' : ''}" data-tip-receipt>Tip on receipt: ${fmt(printed)}</button>`
    : '';
  row.innerHTML = receiptBtn + state.tipPresets.map((pct: number) =>
    `<button class="tip-btn ${pct === state.tipPct && !state.useReceiptTip ? 'active' : ''}" data-tip="${pct}">${pct}%</button>`
  ).join('') + `<input class="custom-tip" id="customTip" type="number" inputmode="decimal" placeholder="%" aria-label="Custom tip percent">`;

  row.querySelectorAll<HTMLButtonElement>('[data-tip]').forEach(btn => {
    btn.addEventListener('click', () => setTip(Number(btn.dataset.tip)));
  });
  row.querySelector<HTMLButtonElement>('[data-tip-receipt]')?.addEventListener('click', chooseReceiptTip);

  const customInput = $('customTip') as HTMLInputElement;
  if (!state.useReceiptTip && !state.tipPresets.includes(state.tipPct)) {
    customInput.value = String(state.tipPct);
  }
  customInput.addEventListener('input', setCustomTip);
}

export function chooseReceiptTip(): void {
  tap();
  state.useReceiptTip = true;
  renderTipRow();
  updateSummary();
}

export function setTipBase(base: 'pre' | 'post'): void {
  state.tipBase = base;
  $('tipPreTax').classList.toggle('active', base === 'pre');
  $('tipPostTax').classList.toggle('active', base === 'post');
  updateSummary();
}

export function setTip(pct: number): void {
  tap();
  state.tipPct = pct;
  state.useReceiptTip = false;
  const custom = $('customTip') as HTMLInputElement | null;
  if (custom) custom.value = '';
  document.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tip !== undefined && Number(btn.dataset.tip) === pct)
  );
  localStorage.setItem('sp_tip', String(pct));
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
    document.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn => btn.classList.remove('active'));
    localStorage.setItem('sp_tip', String(val));
    updateSummary();
  }
}
