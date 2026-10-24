# How SliceOfPie works

A tour of the code for anyone reading it, and the questions it tends to raise. File names are under `src/`.

## Starting up

`main.ts` runs once when the page loads. It:

1. Registers every button's job in one table (`initActions`). Buttons in the HTML say what they do with `data-action="newBill"`, and one click listener in `actions.ts` looks the name up. There's no inline `onclick`, which is what lets the page ship a strict Content-Security-Policy.
2. Restores settings (theme, currency, payment details, tip presets) and any bill in progress (`draft.ts`).
3. Works out which screen to open: a shared photo, a home-screen shortcut (`?start=scan`), the bill in progress, or Home.
4. Loads saved bills from IndexedDB and starts the service worker (`update.ts`).

## State and the money math

- `state.ts` holds one plain object with everything about the current bill: people, items, tax, tip, who paid. Modules change it directly and then call the render function for whatever they changed. With one user and one screen at a time, a store or signals library would add complexity without solving anything.
- `bill.ts` works out who owes what. It doesn't touch the page, so it's tested on its own (`test/bill-math.test.ts`).
  - Each person's exact share is their items plus the same fraction of tax and tip.
  - Shares are then turned into whole cents (`toCents`). Everyone else is rounded to the nearest cent, and the payer takes whatever is left, so the shares always add up to the bill.
  - All rounding goes through `toUnits` in `money.ts`, which first cleans up float noise (178.365 is stored as 178.36499…). That way the total line and the shares can't round in different directions.
- `money.ts` also knows which currencies have no cents (¥, ₩, …).

## Screens and navigation

- Every screen is a `<div class="screen">` in `index.html`, and only one has the `active` class at a time.
- `router.ts` switches screens (`goTo`), keeps the address bar in sync (`#items`, `#bill`), and handles Back. Other modules hook in rather than the router knowing about them:
  - `onEnterScreen('screenHistory', renderHistory)` redraws a screen when it opens.
  - `onLeaveScreen('screenCamera', stopCamera)` releases the camera when you leave.
  - `setBackRoutes` says where Back goes from each screen.
- **The back gesture trick.** Away from Home, the router pushes one extra history entry with an ID. When the system back gesture fires, the browser lands on the entry below, `popstate` runs the app's own Back, and the app doesn't close. If the browser arrives back on that same ID, it was Forward, not Back. This replaced a version where a reload broke Back.
- `chrome.ts` draws what surrounds each screen: the tab bar, the top bar, or the step bar ("People · Scan · Items · Bill").
- `flow.ts` is the split itself: starting one, moving between steps, and resetting for a new bill.
- There are no import cycles (checked with `madge`). Screens register with the router instead of the router importing every screen.

## Saving things

| Where | What | Why there |
|---|---|---|
| `localStorage` via `storage.ts` | Settings, the bill in progress | Small and synchronous. `storage.ts` catches the errors browsers throw when storage is blocked or full, so the app still starts with defaults. |
| IndexedDB via `db.ts` | Saved bills | Can grow, and it's asynchronous. A failed write puts the screen back the way it was and says so. |
| A JSON file via `backup.ts` | Export and import | The only way to move bills to a new phone. `backup-format.ts` checks every field of an imported file, and colors must be plain hex because they end up in a `style` attribute. |

After the first saved bill, the app calls `navigator.storage.persist()` so the browser doesn't clear its data when the phone runs low on space.

## Scanning a receipt

1. **Photo.** From the live camera (`camera.ts`), the file picker, drag and drop, paste, or another app's share sheet.
2. `items.ts` → `runOCR` loads the scanner code on first use (it isn't in the startup bundle).
3. `scan/image.ts` turns the photo the right way up and shrinks it. `scan/quality.ts` checks blur and brightness and offers a retake.
4. `scan/process.ts` tries PaddleOCR and falls back to Tesseract if PaddleOCR can't run.
5. `scan/engine-paddle.ts` runs PaddleOCR in a Web Worker (`paddle.worker.ts`) so the page stays responsive. The model files (about 36 MB with the runtime) download once, after the user agrees, and are kept in their own cache for offline use.
6. `scan/rows.ts` puts the text boxes back into receipt lines. OCR returns each piece of text separately, so an item and its price have to be matched by height, after correcting for a tilted photo.
7. `scan/parse.ts` turns the lines into items, quantities, discounts, subtotal, tax, tip, total, merchant and date. It's tested against saved OCR output from real receipts (`test/fixtures/receipts/real/`).

## Offline and updates

- `sw.ts` is the service worker. It precaches the app so it opens with no signal, keeps the scanner files in a separate cache, and receives photos shared from other apps (`/share-target`).
- A new version doesn't take over by itself. `update.ts` decides when:
  - **On Home, History or Settings:** straight away, with one reload.
  - **In the middle of a bill:** it shows "A new version is ready" and waits for Reload. The bill survives the reload as a draft.
- Scanner files from older versions are deleted once the current ones have loaded successfully, so they don't pile up.

## Security

The page's Content-Security-Policy (`security-headers.json`, mirrored in `vercel.json`) allows no inline script and no `eval`. The OCR worker gets its own looser policy, because the OpenCV build inside it needs `eval`. A test checks the two files match, and an end-to-end test runs a whole split while watching for any policy violation.

## Tests

- **Unit (Vitest, `test/`):**
  - money math, including a 200-case sweep;
  - storage being blocked;
  - draft expiry;
  - the receipt parser on real receipts;
  - photo quality checks;
  - update timing;
  - the backup file format;
  - security headers.
- **End-to-end (Playwright, `e2e/`):** each test runs on a phone-sized and a desktop screen. They cover:
  - full splits with known answers;
  - back navigation and resume;
  - offline use;
  - scanning a drawn receipt;
  - axe accessibility checks on every screen in both themes;
  - a real service worker update;
  - the live camera, using Chromium's test camera;
  - backups.
- **CI (`.github/workflows/ci.yml`):** runs everything on every push, plus Lighthouse with a minimum score.

## Questions you might get

**Why no framework?**
The whole app is about 4,900 lines. Rendering is explicit (`renderHistory()`, `updateSummary()`), so you can always find what changed a screen. It also starts with about 23 KB of JavaScript. A framework would mostly add weight here.

**How do you know the shares always add up?**
They're computed in whole cents, with the payer taking the remainder, and a test checks 200 random bills. Rounding goes through one function, so the total and the shares can't disagree.

**What happens with no signal?**
The app and its fonts are precached, so it opens and splits normally. Scanning works offline once the scanner has been downloaded. Before that, the scan screen says it needs a connection and you can type the items in.

**How does the back button work in an installed web app?**
See "The back gesture trick" above.

**How do updates reach people without losing their bill?**
See "Offline and updates". The short version: never swap versions mid-bill without asking, and keep the bill as a draft across the reload.

**What was the hardest bug?**
The iPhone launch bug: [ios-pwa-launch-bug.md](ios-pwa-launch-bug.md).

**How did you test the camera and the scanner without a phone?**
Chromium can stand in for a camera with a moving test pattern. For the scanner, the tests draw a receipt onto a canvas and scan it, online and then offline.
