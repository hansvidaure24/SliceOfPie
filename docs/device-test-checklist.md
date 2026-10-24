# Real-device test checklist

For the UI/UX redesign on `ui-shell` (phases 0–4). The checks below need a real phone. Everything that could be checked in a desktop browser already has been (see the end of this file).

## Before you start

- Test over **HTTPS**. Service workers, install, share target and the camera all need a secure origin, so a phone hitting `http://192.168.x.x:4173` won't do. Use a Vercel preview deployment of the branch, or production once merged.
- Test in both a **browser tab** and the **installed app**. Some things only happen in one of them (noted below).
- Have one real receipt handy, ideally a long one with tax and a printed tip.

Devices: **iPhone (Safari)**, **Android (Chrome)**, and optionally an **iPad** and a **Windows/Mac laptop (Chrome or Edge)**.

---

## 1. Install

| Check | iPhone | Android | Laptop |
|---|---|---|---|
| Settings shows an **Install SliceOfPie** card (browser tab only, gone once installed) | ☐ | ☐ | ☐ |
| iPhone: tapping Install shows the Share → Add to Home Screen steps, with only a "Got it" button | ☐ | – | – |
| Android/laptop: tapping Install opens the browser's install dialog, with screenshots | – | ☐ | ☐ |
| After the **first** saved bill, "Keep SliceOfPie on your home screen?" appears once, and never again after "Not now" | ☐ | ☐ | ☐ |
| Laptop at full width: the Install card sits at the bottom of the left rail | – | – | ☐ |
| Installed icon looks right (not cropped) on the home screen and in the app switcher | ☐ | ☐ | ☐ |

## 2. Safe areas and the system bars (installed app)

| Check | iPhone | Android |
|---|---|---|
| The top bar and Home's logo sit **below** the clock/notch/Dynamic Island, with nothing hidden under it | ☐ | ☐ |
| The bottom tabs and the Next/Share bar sit **above** the home indicator, with no gap below them | ☐ | ☐ |
| Scrolling a long Items list: content slides under the top bar and nothing shows through above it | ☐ | ☐ |
| Landscape: nothing is hidden behind the notch on the left or right | ☐ | ☐ |

## 3. Back and resume

| Check | iPhone | Android |
|---|---|---|
| Android back gesture/button on any split step goes back **one step**, not out of the app | – | ☐ |
| Back on the bill screen with an unsaved bill asks "Discard it?"; Cancel stays put, and back again closes the sheet | – | ☐ |
| Back from Home leaves the app (one press, not two) | – | ☐ |
| Halfway through a split, switch to another app for a few minutes (or force-close it), then reopen: same screen, same items, toast "Picked up where you left off" | ☐ | ☐ |
| A draft older than 3 hours is **not** resumed | ☐ | ☐ |

## 4. Typing on a phone keyboard

| Check | iPhone | Android |
|---|---|---|
| Prices and totals open the **decimal** keypad | ☐ | ☐ |
| With the keyboard open on Items, the field you're typing in stays visible (not hidden behind the bottom bar or keyboard) | ☐ | ☐ |
| The keyboard's Next/Go key moves name → price → next item, and adds a new item from the last price | ☐ | ☐ |
| The "Name this bill" sheet: the keyboard doesn't cover the Save button | ☐ | ☐ |

## 5. Scanning

| Check | iPhone | Android |
|---|---|---|
| First scan asks "Download the receipt scanner?"; "Type it in" goes to manual entry with nothing downloaded | ☐ | ☐ |
| "Download and scan" shows download progress, then reads the receipt | ☐ | ☐ |
| Settings → Receipt scanner now says **Ready offline**; the scan screen says "Scanner ready offline" | ☐ | ☐ |
| **Airplane mode**, then scan another receipt: works with no signal | ☐ | ☐ |
| Settings → Remove frees the space, and the next scan asks to download again | ☐ | ☐ |
| Live camera opens on Take Photo; the hints (too dark, hold steady) show; the shutter works | ☐ | ☐ |
| A blurry or dark photo offers Retake | ☐ | ☐ |
| Airplane mode **before** the scanner was ever downloaded: the scan screen says it needs a connection, and scanning drops to manual entry | ☐ | ☐ |

## 6. Sharing a photo in (Android only)

| Check | Android |
|---|---|
| Installed app appears in the Share sheet for a photo in Google Photos/Gallery | ☐ |
| Sharing opens SliceOfPie straight on the scan screen and reads the photo | ☐ |
| Sharing while the app is already open reuses that window (doesn't open a second one) | ☐ |

## 7. App shortcuts (installed app)

| Check | iPhone | Android | Laptop |
|---|---|---|---|
| Long-press (or right-click) the app icon shows **Scan a receipt**, **Enter the total**, **Who owes me** | – (iOS doesn't support these) | ☐ | ☐ |
| Each one lands on People (by item / even) or History | – | ☐ | ☐ |

## 8. People

| Check | iPhone | Android |
|---|---|---|
| **Add from contacts** appears on Android Chrome, picks several people, and fills "Person N" slots first | – (not supported) | ☐ |
| "Add again" shows names from saved bills, and tapping one adds them | ☐ | ☐ |

## 9. The bill and sharing out

| Check | iPhone | Android |
|---|---|---|
| The headline reads right when you paid, when someone else paid, and when you're not part of the bill | ☐ | ☐ |
| Share opens the system share sheet with the text breakdown (including your payment handles) | ☐ | ☐ |
| Share as image produces a readable PNG you can send in Messages/WhatsApp | ☐ | ☐ |
| Light taps (haptics) on chips and toggles (Android) | – | ☐ |

## 10. Look and feel

| Check | iPhone | Android |
|---|---|---|
| Light and dark both follow the system setting; Settings → Theme overrides it | ☐ | ☐ |
| With **Reduce Motion** on, the logo doesn't bob and screens don't slide | ☐ | ☐ |
| Larger text size (iOS Dynamic Type / Android font size): nothing overlaps or gets cut off | ☐ | ☐ |
| VoiceOver/TalkBack reads person chips as "Carmine, toggle button, pressed" (or similar) and history cards with label, total and status | ☐ | ☐ |

## 11. Updates

| Check | Any |
|---|---|
| After a new deploy, the installed app shows "A new version is ready. Reload" instead of a dialog | ☐ |
| Reloading mid-split brings the bill back | ☐ |

## 12. Tablet and laptop (optional)

| Check | iPad | Laptop |
|---|---|---|
| iPad portrait (768+ wide): split screens show the Live summary panel beside them | ☐ | ☐ |
| Laptop: left rail, item grid with a column per person, Alt+1–9 toggles a person | – | ☐ |
| Laptop: dragging a receipt photo onto the scan or total screen scans it; Ctrl+V of a copied image does too | – | ☐ |
| A saved bill shows the bill list on its left, and clicking another bill switches to it | – | ☐ |

---

## Already checked in a desktop browser

Run against the production build (`vite build` + `vite preview`) in headless Edge, 24 Oct 2026:

- **Lighthouse 13.5** (Home screen): Performance 99 mobile / 100 desktop, Accessibility 100, Best Practices 100, SEO 100. Mobile LCP 2.1 s, TBT 0 ms, CLS 0.
- **axe-core 4.10** on 11 screens and sheets (Home, People, Scan, Items, Bill by item, Bill even, Name sheet, History, Saved bill, Settings, Total) in dark and light: no violations.
- **Offline**: with the network cut after the first visit, the app loads, both fonts come from the cache, a split computes, and Tesseract is not fetched.
- **320 px wide** with long names and a long item name: no sideways scrolling on any screen.
- **Reduced motion**: no animations; only one screen visible after rapid navigation.
- **Keyboard**: Tab reaches the item fields and person chips with a visible focus ring; Space toggles a chip and keeps focus; Escape goes back.
- **Back navigation** (browser Back), **draft resume after reload**, **scanner download → Ready offline**, **share target → scan**, **drag-and-drop / paste**, and the `?start=` shortcuts.
