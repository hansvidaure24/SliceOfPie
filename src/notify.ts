import { $ } from './helpers';

// Said by screen readers without showing anything
export function announce(msg: string): void {
  const el = $('announcer');
  el.textContent = '';
  // A fresh text node after a tick so the same message is read again
  setTimeout(() => { el.textContent = msg; }, 50);
}

let toastTimer = 0;
export function showToast(msg: string): void {
  clearTimeout(toastTimer);
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2000);
}
