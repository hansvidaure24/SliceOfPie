import { $, esc } from './helpers';
import { announce } from './notify';
import { state } from './state';
import { setAside } from './layout';

// What surrounds each screen: the bottom tabs, the top bar, or nothing (camera)
type Chrome = 'tabs' | 'bar' | 'flow' | 'none';
const CHROME: Record<string, Chrome> = {
  screenWelcome: 'tabs',
  screenHistory: 'tabs',
  screenSettings: 'tabs',
  screenDetail: 'bar',
  screenPeople: 'flow',
  screenQuick: 'flow',
  screenCapture: 'flow',
  screenItems: 'flow',
  screenSummary: 'flow',
  screenCamera: 'none',
};
const BAR_TITLES: Record<string, string> = { screenDetail: 'Saved bill' };

// The steps of each kind of split, as shown in the top bar
const STEPS: Record<'even' | 'item', [string, string[]][]> = {
  even: [['People', ['screenPeople']], ['Total', ['screenQuick', 'screenCapture']], ['Bill', ['screenSummary']]],
  item: [['People', ['screenPeople']], ['Scan', ['screenCapture']], ['Items', ['screenItems']], ['Bill', ['screenSummary']]],
};

let lastAnnounced = '';

export function renderChrome(id: string): void {
  const chrome = CHROME[id] ?? 'bar';
  document.body.dataset.chrome = chrome;
  setAside(id);
  $('appTitle').textContent = BAR_TITLES[id] ?? '';
  $('appNewBill').hidden = id !== 'screenSummary';

  const steps = chrome === 'flow' ? STEPS[state.splitMode] : [];
  const at = steps.findIndex(([, screens]) => screens.includes(id));
  $('appSteps').innerHTML = steps.map(([label], i) =>
    `<li class="${i < at ? 'done' : ''}"${i === at ? ' aria-current="step"' : ''}>${esc(label)}</li>`
  ).join('');
  $('appSteps').setAttribute('aria-label', at >= 0 ? `Step ${at + 1} of ${steps.length}` : 'Progress');
  if (at >= 0 && id !== lastAnnounced) announce(`Step ${at + 1} of ${steps.length}: ${steps[at][0]}`);
  lastAnnounced = id;

  document.querySelectorAll<HTMLElement>('#tabBar [data-tab]').forEach(tab => {
    if (tab.dataset.tab === id) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}
