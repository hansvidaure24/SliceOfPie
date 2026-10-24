import { $, COLORS, esc, fmt } from './helpers';
import { state } from './state';
import { goTo } from './navigation';
import { renderAssign } from './assign';
import { processReceipt } from './scan/process';
import { OcrUnavailableError } from './scan/engine';

export function takePhoto(): void {
  const input = $('photoInput') as HTMLInputElement;
  input.setAttribute('capture', 'environment');
  input.click();
}

export function uploadPhoto(): void {
  const input = $('photoInput') as HTMLInputElement;
  input.removeAttribute('capture');
  input.click();
}

export async function runOCR(file: File): Promise<void> {
  try {
    const parsed = await processReceipt(file, {
      onProgress: pct => {
        ($('progressFill') as HTMLElement).style.width = pct + '%';
        $('progressFill').parentElement!.setAttribute('aria-valuenow', String(pct));
        $('progressText').textContent = 'Scanning... ' + pct + '%';
      }
    });
    state.items = parsed.items.length ? parsed.items : [{ name: '', price: 0 }];
    state.taxAmt = parsed.tax;
    ($('taxInput') as HTMLInputElement).value = String(state.taxAmt || '');
    $('itemsSubtitle').textContent = 'Fix anything the scan missed';
    enterItemsScreen();
  } catch (err) {
    $('progressText').textContent = err instanceof OcrUnavailableError
      ? 'OCR unavailable offline — entering manual mode'
      : 'Scan failed — entering manual mode';
    setTimeout(skipToManual, 1000);
  }
}

export function skipToManual(): void {
  state.items = [{ name: '', price: 0 }];
  state.taxAmt = 0;
  ($('taxInput') as HTMLInputElement).value = '';
  $('itemsSubtitle').textContent = 'Add your items';
  enterItemsScreen();
  const first = $('itemsList').querySelector<HTMLInputElement>('.item-name');
  if (first) setTimeout(() => first.focus(), 300);
}

export function enterItemsScreen(): void {
  renderItems();
  updateRunning();
  if (state.splitMode === 'item') renderAssign();
  $('assignSection').style.display = state.splitMode === 'item' ? 'block' : 'none';
  goTo('screenItems');
}

export function renderItems(): void {
  $('itemsList').innerHTML = state.items.map((item, i) => `
    <div class="item-row">
      <input class="item-name" value="${esc(item.name)}" placeholder="Item name" data-item-name="${i}" aria-label="Item ${i + 1} name">
      <input class="item-price" type="number" inputmode="decimal" step="0.01"
             value="${item.price || ''}" placeholder="0.00" data-item-price="${i}" aria-label="Item ${i + 1} price">
      <button class="item-del" data-item-del="${i}" aria-label="Remove item"${state.items.length <= 1 ? ' disabled style="visibility:hidden"' : ''}><span class="trash-icon"></span></button>
    </div>
  `).join('');

  const list = $('itemsList');

  list.querySelectorAll<HTMLInputElement>('[data-item-name]').forEach(input => {
    input.addEventListener('input', () => {
      state.items[Number(input.dataset.itemName)].name = input.value;
    });
  });

  list.querySelectorAll<HTMLInputElement>('[data-item-price]').forEach(input => {
    input.addEventListener('input', () => {
      state.items[Number(input.dataset.itemPrice)].price = parseFloat(input.value) || 0;
      updateRunning();
    });
  });

  list.querySelectorAll<HTMLButtonElement>('[data-item-del]').forEach(btn => {
    btn.addEventListener('click', () => removeItem(Number(btn.dataset.itemDel)));
  });
}

export function addItem(): void {
  state.items.push({ name: '', price: 0 });
  renderItems();
  if (state.splitMode === 'item') renderAssign();
  const inputs = $('itemsList').querySelectorAll<HTMLInputElement>('.item-name');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

export function removeItem(index: number): void {
  if (state.items.length <= 1) return;
  state.items.splice(index, 1);
  renderItems();
  updateRunning();
  if (state.splitMode === 'item') renderAssign();
}

export function updateRunning(): void {
  const sub = state.items.reduce((sum, item) => sum + (item.price || 0), 0);
  const taxNote = state.taxAmt ? ' + ' + fmt(state.taxAmt) + ' tax' : '';
  $('runningSub').textContent = 'Subtotal: ' + fmt(sub) + taxNote;
}
