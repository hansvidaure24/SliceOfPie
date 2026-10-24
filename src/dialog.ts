import { $ } from './helpers';

// warn shows the "!" badge: for discarding, deleting, or a photo that may be misread
export interface DialogLabels { yes?: string; no?: string; warn?: boolean }

export function confirmDialog(msg: string, sub = '', labels: DialogLabels = {}): Promise<boolean> {
  return openDialog(msg, sub, labels, null).then(result => result !== null);
}

// The same sheet with a text field; resolves to the text, or null when cancelled
export function promptDialog(msg: string, value: string, labels: DialogLabels = {}): Promise<string | null> {
  return openDialog(msg, '', labels, value);
}

export function dialogOpen(): boolean {
  return ($('confirmDialog') as HTMLDialogElement).open;
}

// A native modal <dialog>: the browser keeps focus inside it, makes the page
// behind it inert, and turns Escape into a cancel
function openDialog(msg: string, sub: string, labels: DialogLabels, value: string | null): Promise<string | null> {
  return new Promise(resolve => {
    const dialog = $('confirmDialog') as HTMLDialogElement;
    const yesBtn = $('confirmYes');
    const noBtn = $('confirmNo');
    const input = $('confirmInput') as HTMLInputElement;
    yesBtn.textContent = labels.yes ?? 'Confirm';
    noBtn.textContent = labels.no ?? 'Cancel';
    // An empty label means there's nothing to choose, just a message to close
    noBtn.hidden = labels.no === '';
    $('confirmMsg').textContent = msg;
    $('confirmSub').textContent = sub;
    $('confirmSub').hidden = !sub;
    input.hidden = value === null;
    input.value = value ?? '';
    dialog.classList.toggle('warn', !!labels.warn);
    dialog.setAttribute('role', value === null ? 'alertdialog' : 'dialog');
    if (!dialog.open) dialog.showModal();
    if (value === null) {
      (noBtn.hidden ? yesBtn : noBtn).focus();
    } else {
      input.focus();
      input.select();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.target === input) {
        e.preventDefault();
        cleanup(input.value);
      }
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      cleanup(null);
    };
    // A click on the dimmed backdrop lands on the <dialog> itself, outside its body
    const onBackdrop = (e: MouseEvent) => { if (e.target === dialog) cleanup(null); };
    dialog.addEventListener('keydown', onKey);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('click', onBackdrop);
    const cleanup = (result: string | null) => {
      dialog.removeEventListener('keydown', onKey);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('click', onBackdrop);
      yesBtn.onclick = null;
      noBtn.onclick = null;
      dialog.close();
      resolve(result);
    };
    yesBtn.onclick = () => cleanup(input.value);
    noBtn.onclick = () => cleanup(null);
  });
}
