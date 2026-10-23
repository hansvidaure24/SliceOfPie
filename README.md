# SliceOfPie

Split bills without the awkward math. Snap a receipt, assign items, add tip, and share who owes what — all offline, all on-device.

**[Live Demo](https://slice-of-pie-xi.vercel.app/)**

<p align="center">
  <img src="docs/demo.gif" alt="SliceOfPie demo" width="600">
</p>

<p align="center">
  <img src="docs/screenshot-welcome.png" alt="Welcome screen" width="180">&nbsp;&nbsp;
  <img src="docs/screenshot-summary.png" alt="Bill summary" width="180">&nbsp;&nbsp;
  <img src="docs/screenshot-history.png" alt="Bill history" width="180">
</p>
<p align="center"><sub>Welcome &bull; Summary with pie chart &bull; Bill history with paid tracking</sub></p>

## Why

Every bill-splitting app I found either required everyone to sign up, needed an internet connection, or wanted my data. SliceOfPie runs entirely in your browser — no accounts, no backend, no tracking. Install it as a PWA and it works at the restaurant even without signal.

## Features

- **Even or by-item split** — assign items to specific people or split the total evenly
- **OCR receipt scanning** — snap a photo or upload an image, Tesseract.js extracts line items on-device
- **Tip & tax** — preset tip buttons, custom %, pre-tax or post-tax, round-up toggle
- **Bill history** — saved to IndexedDB, track who's paid with one tap, swipe to delete
- **Export as image** — generate a shareable PNG of the bill breakdown
- **Dark/light theme** — auto-detects OS preference, or set manually
- **Currency selector** — USD, EUR, GBP, JPY, and more
- **Share** — native share sheet or clipboard, includes your payment details
- **Payment settings** — Venmo, Zelle, Cash App, or custom method included in shared text
- **Installable PWA** — works offline, add to home screen on any device
- **Responsive** — mobile-first design with 2-column desktop layout
- **Privacy-first** — no server, no analytics, no cookies. Everything stays on your device

## Tech Stack

- **Vite 5** + **TypeScript** (strict mode)
- **vite-plugin-pwa** with `injectManifest` strategy
- **Workbox** for precaching and offline support
- **Tesseract.js 5** for client-side OCR
- **IndexedDB** for bill history (auto-migrates from localStorage)
- No runtime dependencies beyond Tesseract.js (loaded from CDN)

## Architecture Decisions

**Why vanilla TS instead of React/Vue/Svelte?**
The app is ~2,600 lines across 17 modules. A framework would add a build step, a virtual DOM, and a state management library to solve problems this app doesn't have. Manual DOM updates via `renderX()` functions mean every state change is explicit and traceable. The result is a faster load, smaller bundle, and zero framework churn.

**Why a mutable state object instead of a store/signals?**
A single `state.ts` object holds all app state. Each module imports it, mutates directly, and calls the appropriate render function. This works because:
- The app has one user, one screen at a time, no concurrent updates
- Every mutation site is greppable (`state.` across 17 files)
- There's no virtual DOM diffing that needs immutability to detect changes

Reactive patterns (signals, proxies, event buses) solve coordination problems that don't exist here. Adding them would be complexity for complexity's sake.

**Why IndexedDB instead of localStorage?**
Bill history can grow to 50 entries with nested people arrays. localStorage has a ~5MB limit and blocks the main thread on read. IndexedDB is async, has no practical size limit, and supports structured cloning. The app auto-migrates existing localStorage data on first load.

**Why CSS mask for icons instead of an icon library?**
SVG files in `public/` are referenced via CSS `mask-image`. This means icons inherit `currentColor` and respond to theme changes automatically — no icon component, no fill props, no sprite sheet. One line of CSS per icon.

**Why no tests?**
Honest answer: it's a portfolio project and the scope didn't justify a test harness yet. The OCR parser (`parseReceipt`) and bill calculator (`calcOwes`) are the two functions that would benefit most from unit tests — they have the most branching logic and edge cases.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

## Build

```bash
npm run build
npm run preview
```

Output goes to `dist/`. Deploy anywhere that serves static files — a `vercel.json` is included if you use Vercel.

## Project Structure

```text
src/
  main.ts          Entry point, event wiring
  state.ts         Centralized app state
  db.ts            IndexedDB wrapper
  people.ts        People counter & name inputs
  items.ts         OCR parsing & item list
  assign.ts        Item-to-person assignment
  summary.ts       Bill calculation & breakdown
  tip.ts           Tip presets & custom tip
  pie.ts           Animated pie chart (rAF)
  history.ts       Save/load/delete/swipe bills
  share.ts         Share text generation
  export-image.ts  Canvas-based PNG export
  payment.ts       Payment method settings
  navigation.ts    Screen transitions
  toggles.ts       Toggle switch handlers
  helpers.ts       Utilities, theme, currency
  types.ts         TypeScript interfaces
  sw.ts            Service worker (Workbox precache)
public/
  *.svg            UI icons (CSS mask technique)
  icon-*.png       PWA icons (192, 512, maskable)
  logo-*.png       Welcome screen artwork
```

## Privacy

All data is stored locally on your device using IndexedDB and localStorage. Nothing is sent to any server. OCR runs entirely in the browser via Tesseract.js. See the in-app privacy note in Settings.

## License

[MIT](LICENSE)
