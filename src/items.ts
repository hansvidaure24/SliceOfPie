import { $, COLORS, esc, fmt, receiptHints, confirmDialog, showToast, setToggle } from './helpers';
import { state } from './state';
import { goTo, updateQuickCta } from './navigation';
import { updateItemsCta, whoChips, itemsHead, whoColumns } from './assign';
import { processReceipt } from './scan/process';
import { OcrUnavailableError } from './scan/engine';
import { prepareImage } from './scan/image';
import { assessQuality } from './scan/quality';
import { okToDownloadScanner } from './scanner-status';

// The phone's own camera app via the file input (the live camera is in camera.ts)
export function takePhotoNative(): void {
  const input = $('photoInput') as HTMLInputElement;
  input.setAttribute('capture', 'environment');
  input.click();
}

export function uploadPhoto(): void {
  const input = $('photoInput') as HTMLInputElement;
  input.removeAttribute('capture');
  input.click();
}

// Resolves true when the user chose to retake, after resetting the capture screen
async function offerRetake(msg: string, sub: string, keepLabel: string): Promise<boolean> {
  if (await confirmDialog(msg, sub, { yes: keepLabel, no: 'Retake', warn: true })) return false;
  goTo('screenCapture');
  showToast('Take another photo');
  return true;
}

// Entry point for a photo from the file input or the live camera
let scanning = false;
export async function scanPhoto(photo: Blob): Promise<void> {
  if (scanning) return;
  scanning = true;
  const img = $('previewImg') as HTMLImageElement;
  if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(photo);
  img.style.display = 'block';
  img.setAttribute('aria-hidden', 'false');
  $('progressWrap').style.display = 'block';
  try {
    await runOCR(photo);
  } finally {
    scanning = false;
  }
}

export async function runOCR(file: Blob): Promise<void> {
  if (!(await okToDownloadScanner())) {
    skipToManual();
    return;
  }
  let image = file;
  try {
    const prepared = await prepareImage(file);
    image = prepared.blob;
    const q = assessQuality(prepared.gray, prepared.grayWidth, prepared.grayHeight);
    if ((q.blurry || q.dark) && await offerRetake(
      q.dark ? 'This photo is too dark to read' : 'This photo is too blurry to read',
      q.dark ? 'Add more light, then take it again.' : 'Hold the phone steady with the receipt in focus.',
      'Use anyway',
    )) return;
  } catch {
    // Couldn't decode it ourselves; let the OCR engine try the original
  }

  try {
    const parsed = await processReceipt(image, {
      onProgress: p => {
        const bar = $('progressFill').parentElement!;
        // PaddleOCR can't report recognition progress, so show an indeterminate bar
        bar.classList.toggle('indeterminate', p.pct === undefined);
        if (p.pct === undefined) {
          bar.removeAttribute('aria-valuenow');
          $('progressText').textContent = 'Reading receipt...';
          return;
        }
        ($('progressFill') as HTMLElement).style.width = p.pct + '%';
        bar.setAttribute('aria-valuenow', String(p.pct));
        $('progressText').textContent = p.phase === 'download'
          ? 'Downloading scanner (first time only)... ' + p.pct + '%'
          : 'Scanning... ' + p.pct + '%';
      },
      parse: receiptHints(),
    });
    const receipt = { merchant: parsed.merchant, date: parsed.date, total: parsed.total, tip: parsed.tip };

    if (state.splitMode === 'even') {
      // Even split only needs the bill total, before any tip printed on it
      const bill = parsed.total !== null ? parsed.total - (parsed.tip ?? 0)
        : parsed.subtotal !== null ? parsed.subtotal + (parsed.taxIncluded ? 0 : parsed.tax)
        : null;
      if (bill === null || bill <= 0) {
        if (await offerRetake('No total found', 'Retake the photo with the bottom of the receipt in view, or type the total yourself.', 'Enter manually')) return;
        skipToManual();
        return;
      }
      state.receipt = receipt;
      state.useReceiptTip = parsed.tip !== null;
      fillQuickTotal(Math.round(bill * 100) / 100);
      goTo('screenQuick');
      showToast('Total filled in from the receipt');
      return;
    }

    // The parser checks items + tax + tip against the printed totals; when that
    // fails the photo was usually misread
    const noTotals = parsed.subtotal === null && parsed.total === null;
    if (parsed.confidence === 'low' && await offerRetake(
      !parsed.items.length ? 'No prices found' : noTotals ? 'No total to check against' : 'Some amounts may be wrong',
      !parsed.items.length
        ? 'Retake the photo with the whole receipt in view, or enter the items yourself.'
        : noTotals
          ? "The receipt's total wasn't found, so the items couldn't be double-checked. Look them over, or retake the photo with the bottom of the receipt in view."
          : "The items don't add up to the receipt's total. Retake the photo, or check the items yourself.",
      parsed.items.length ? 'Check items' : 'Enter manually',
    )) return;
    state.receipt = receipt;
    // Don't stack the app's tip percentage on a tip that's already on the receipt
    state.useReceiptTip = parsed.tip !== null;
    state.items = parsed.items.length ? parsed.items : [{ name: '', price: 0 }];
    // A negative line so the split reflects what was actually paid; it needs
    // assigning like any item (usually to everyone)
    if (parsed.discount > 0) state.items.push({ name: 'Discount', price: -parsed.discount });
    // VAT already inside the item prices (EU receipts) must not be added again
    state.taxAmt = parsed.taxIncluded ? 0 : parsed.tax;
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

function fillQuickTotal(amount: number): void {
  state.quickTotalAmt = amount;
  ($('quickTotal') as HTMLInputElement).value = amount.toFixed(2);
  // The receipt total already includes tax
  state.taxIncluded = true;
  setToggle('taxIncToggle', true);
  $('quickTaxCard').classList.add('hidden');
  state.quickTaxAmt = 0;
  ($('quickTax') as HTMLInputElement).value = '';
  updateQuickCta();
}

export function skipToManual(): void {
  state.receipt = null;
  state.useReceiptTip = false;
  if (state.splitMode === 'even') {
    goTo('screenQuick');
    ($('quickTotal') as HTMLInputElement).focus();
    return;
  }
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
  goTo('screenItems');
}

export function renderItems(): void {
  const byItem = state.splitMode === 'item';
  const cols = whoColumns();
  $('itemsList').style.setProperty('--who-cols', cols ? `repeat(${cols}, 3.25rem)` : '0px');
  $('itemsList').innerHTML = itemsHead() + state.items.map((item, i) => `
    <div class="item-row" data-row="${i}">
      <div class="item-main">
        <input class="item-name" value="${esc(item.name)}" placeholder="Item name" data-item-name="${i}" aria-label="Item ${i + 1} name">
        <input class="item-price" type="number" inputmode="decimal" step="0.01"
               value="${item.price || ''}" placeholder="0.00" data-item-price="${i}" aria-label="Item ${i + 1} price">
        <button class="item-del" data-item-del="${i}" aria-label="Remove item"${state.items.length <= 1 ? ' disabled hidden' : ''}><span class="trash-icon"></span></button>
      </div>
      ${byItem ? `<div class="item-who" data-who="${i}" role="group" aria-label="Who had item ${i + 1}">${whoChips(i)}</div>` : ''}
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

  // Enter moves name → price → next item, adding one at the end
  list.querySelectorAll<HTMLInputElement>('.item-name, .item-price').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const i = Number(input.dataset.itemName ?? input.dataset.itemPrice);
      if (input.dataset.itemName !== undefined) {
        list.querySelector<HTMLInputElement>(`[data-item-price="${i}"]`)?.focus();
      } else if (i < state.items.length - 1) {
        list.querySelector<HTMLInputElement>(`[data-item-name="${i + 1}"]`)?.focus();
      } else {
        addItem();
      }
    });
  });

  list.querySelectorAll<HTMLButtonElement>('[data-item-del]').forEach(btn => {
    btn.addEventListener('click', () => removeItem(Number(btn.dataset.itemDel)));
  });
}

export function addItem(): void {
  state.items.push({ name: '', price: 0 });
  renderItems();
  updateItemsCta();
  const inputs = $('itemsList').querySelectorAll<HTMLInputElement>('.item-name');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

export function removeItem(index: number): void {
  if (state.items.length <= 1) return;
  state.items.splice(index, 1);
  renderItems();
  updateRunning();
}

export function updateRunning(): void {
  const sub = state.items.reduce((sum, item) => sum + (item.price || 0), 0);
  const taxNote = state.taxAmt ? ' + ' + fmt(state.taxAmt) + ' tax' : '';
  $('runningSub').textContent = 'Subtotal: ' + fmt(sub) + taxNote;
  updateItemsCta();

  // Compare against the scanned receipt's total, so a misread price stands out
  const check = $('receiptCheck');
  const total = state.receipt?.total ?? null;
  if (total === null) {
    check.textContent = '';
    check.className = 'receipt-check';
    return;
  }
  const tip = state.receipt?.tip ?? 0;
  const ours = Math.round((sub + state.taxAmt + tip) * 100) / 100;
  const matches = Math.abs(ours - total) < 0.015;
  check.className = 'receipt-check ' + (matches ? 'ok' : 'off');
  check.textContent = matches
    ? 'Matches the receipt total of ' + fmt(total)
    : (tip ? 'Items + tax + tip' : 'Items + tax') + ' come to ' + fmt(ours) + '; the receipt says ' + fmt(total);
}
