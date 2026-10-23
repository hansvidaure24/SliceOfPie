import { $, tap } from './helpers';
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
      <span style="color:var(--muted);font-size:.85rem">%</span>
      ${state.tipPresets.length > 2
        ? `<button class="preset-del" data-preset-del="${i}"><span class="trash-icon"></span></button>`
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
  row.innerHTML = state.tipPresets.map((pct: number) =>
    `<button class="tip-btn ${pct === state.tipPct ? 'active' : ''}" data-tip="${pct}">${pct}%</button>`
  ).join('') + `<input class="custom-tip" id="customTip" type="number" inputmode="decimal" placeholder="%" aria-label="Custom tip percent">`;

  row.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn => {
    btn.addEventListener('click', () => setTip(Number(btn.dataset.tip)));
  });

  const customInput = $('customTip') as HTMLInputElement;
  if (!state.tipPresets.includes(state.tipPct)) {
    customInput.value = String(state.tipPct);
  }
  customInput.addEventListener('input', setCustomTip);
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
  const custom = $('customTip') as HTMLInputElement | null;
  if (custom) custom.value = '';
  document.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn =>
    btn.classList.toggle('active', Number(btn.dataset.tip) === pct)
  );
  localStorage.setItem('sp_tip', String(pct));
  updateSummary();
  $('summaryCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function setCustomTip(): void {
  const custom = $('customTip') as HTMLInputElement | null;
  if (!custom) return;
  const val = parseFloat(custom.value);
  if (!isNaN(val) && val >= 0) {
    state.tipPct = val;
    document.querySelectorAll<HTMLButtonElement>('.tip-btn').forEach(btn => btn.classList.remove('active'));
    localStorage.setItem('sp_tip', String(val));
    updateSummary();
  }
}
