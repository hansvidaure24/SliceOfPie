// Buttons name what they do with data-action (and data-arg when it takes one),
// and one listener runs it. No inline onclick, so the page can ship a strict
// Content-Security-Policy.
export type Action = (arg?: string) => unknown;

export function initActions(actions: Record<string, Action>): void {
  const run = (el: HTMLElement) => {
    const action = actions[el.dataset.action!];
    if (!action) {
      console.warn('No action named', el.dataset.action);
      return;
    }
    void action(el.dataset.arg);
  };

  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    // Text fields run their action as you type, below
    if (el && !el.matches('input, textarea, select')) run(el);
  });

  document.addEventListener('input', (e) => {
    const el = e.target as HTMLElement;
    if (el.matches('input[data-action], textarea[data-action]')) run(el);
  });
}
