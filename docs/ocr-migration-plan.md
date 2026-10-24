# Tesseract → PaddleOCR migration plan

Adapts `Downloads/receipt-scanner-plan.md` to how SliceOfPie is actually built. Nothing has been changed yet.

## What exists today

| Area | Current state |
| --- | --- |
| Stack | Vite 5, strict TS, vanilla DOM. One mutable `state` object (`src/state.ts`). Screens are `<div class="screen">` in `index.html`, switched by `goTo(id)` (`src/navigation.ts`). |
| Capture | Single `<input type="file" id="photoInput" accept="image/*">`. `takePhoto()` adds `capture="environment"`, `uploadPhoto()` removes it (`src/items.ts:12-22`). No in-app camera, no `getUserMedia`. Only reachable in **by-item** mode (`screenCapture`). |
| Hand-off | `change` listener in `src/main.ts:86-98` shows a blob preview, then `await runOCR(file)`. |
| OCR | `tesseract.js@5` from jsDelivr via a `<script defer>` in `index.html:23`, typed by an ambient `declare const Tesseract` (`src/items.ts:6`). Uses `data.text` only (no boxes or confidence), no preprocessing. |
| Parsing | `parseReceipt(text)` (`src/items.ts:53`): line regexes, a SKIP keyword list, tax detection (max tax line), qty prefixes ("2x", "3 Burger") **split into N unit items** so they can be assigned to different people. Returns `{ items, tax }`; total, merchant and date are ignored. |
| Review | `screenItems` already does this: editable name/price rows, tax input, "Fix anything the scan missed". |
| Offline | `src/sw.ts` only does `precacheAndRoute(self.__WB_MANIFEST)`. Tesseract's script, worker, core wasm and `eng.traineddata` are all fetched from CDNs at runtime and **never cached**, so OCR doesn't work offline today even though the README says it does (the code falls back to manual entry). |
| Data model | `Bill` (`src/types.ts`) has `label`, `date`, `total`, `people[]`. No merchant, no receipt image, no item list. History lives in IndexedDB, capped at 50 bills. |
| Hosting | Static on Vercel (`vercel.json`). No COOP/COEP headers. |
| Tests | None. `typescript ^7`, no test runner. |

## Measured costs (checked against npm and the model hosts, Oct 2026)

`@paddleocr/paddleocr-js@0.4.2` hard-depends on `onnxruntime-web` **and** `@techstark/opencv-js`, so OpenCV.js comes along whether we want it or not.

| Asset | Size (uncompressed) |
| --- | --- |
| `ort-wasm-simd-threaded.wasm` (ORT 1.22) | 11.2 MB |
| `opencv.js` (4.10, wasm embedded) | 10.4 MB |
| PP-OCRv6_tiny det + rec | 1.8 + 4.5 = **6.3 MB** |
| PP-OCRv5_mobile det + `en_` rec (English only) | 4.8 + 7.9 = **12.7 MB** |
| PP-OCRv5_mobile det + `latin_` rec (EU accents) | 4.8 + 8.1 = **12.9 MB** |
| PP-OCRv5_mobile det + multilingual rec (SDK default for `lang: "en"`) | 4.8 + 16.7 = **21.5 MB** |
| PP-OCRv6_small det + rec | 9.9 + 21.3 = 31.2 MB |
| `scanic` | under 100 KB gz; its optional ML detector fetches about 2 MB more |

First scan therefore costs **about 28–43 MB** on disk (less over the wire for the JS/wasm). That is far past the plan's ~5 MB "ask first" line, so it needs your sign-off (see Decisions).

SDK notes from the package source:
- Model tars default to `paddle-model-ecology.bj.bcebos.com` (Baidu, Beijing) and ORT wasm defaults to jsDelivr. Both need to be self-hosted to satisfy "no runtime CDN".
- Custom model assets must be **uncompressed `.tar`** files containing `inference.onnx` + `inference.yml`. The official tars already are.
- Detection resizes to `text_det_limit_side_len` 960 by default, which is too small for long receipts. Raise it or tile (Phase 4).
- `worker: true` runs the pipeline in the package's own worker. `ImageBitmap`/`Blob` inputs are transferred, `cv.Mat` is not.

## Adapted phase order

The original plan starts with the camera. I'd swap the engine first instead. The existing file input already covers "Upload / native camera", so changing the engine first lets us compare Paddle and Tesseract on real receipts before building any camera UI. If iOS memory or download size turns out to be a dealbreaker, we find out in week one and not after the camera work is done. Every step below leaves the app building and working.

### Step 0: Harness and seams (no user-visible change)
- Add `vitest` (dev-only). Add a `test` script.
- Create `test/fixtures/receipts/`: real receipt photos (gitignored if private), plus the OCR outputs saved as JSON so parser tests run without a model.
- Split `src/items.ts`:
  - `src/scan/process.ts`: `processReceipt(image: Blob | ImageBitmap): Promise<ScanResult>`, the single entry point the plan asks for. `main.ts`'s change handler calls this instead of `runOCR`.
  - `src/scan/engine.ts`: `interface OcrEngine { recognize(img, onProgress): Promise<OcrLine[]> }` with `OcrLine = { text, score, box: [x0,y0,x1,y1] }`.
  - `src/scan/engine-tesseract.ts`: today's code moved behind the interface. It returns text lines only, with no boxes, so the parser's input stays byte-for-byte the same. Paddle adds boxes in Step 1.
  - `src/scan/parse.ts`: `parseReceipt` moves here unchanged, plus a `linesToText` adapter so current behavior is pinned by tests before anything changes.
- Pin the Tesseract CDN URL to an exact version while it's still in use (`@5` floats).

### Step 1: PaddleOCR engine (Phase 5)
- `npm i @paddleocr/paddleocr-js`. Add `src/scan/engine-paddle.ts`, lazily created on first scan and memoised:
  ```ts
  PaddleOCR.create({
    textDetectionModelName: 'PP-OCRv5_mobile_det',      // pick per Decision 2
    textDetectionModelAsset: { url: '/ocr/models/PP-OCRv5_mobile_det.tar' },
    textRecognitionModelName: 'en_PP-OCRv5_mobile_rec',
    textRecognitionModelAsset: { url: '/ocr/models/en_PP-OCRv5_mobile_rec.tar' },
    worker: true,
    ortOptions: { backend: 'wasm', wasmPaths: '/ocr/ort/', numThreads: crossOriginIsolated ? 2 : 1, simd: true },
  })
  ```
- **Self-hosting:** add `scripts/fetch-ocr-assets.mjs`, run as `prebuild`/`predev`. It downloads the pinned model tars into `public/ocr/models/` with SHA-256 checks and copies ORT wasm from `node_modules` into `public/ocr/ort/`. Gitignore `public/ocr/` so 25+ MB of binaries stay out of git. Vercel runs it during build.
- **Service worker:** add `workbox-routing` + `workbox-strategies`. Register a `CacheFirst` route for `/ocr/**` and for the lazy OpenCV/Paddle JS chunks, in a versioned cache (`ocr-v1`). Add `globIgnores` for those chunks in `vite.config.ts` so they aren't precached on install for users who never scan. Workbox's default 2 MB precache limit would skip them with a warning anyway; make that explicit.
- **"Downloading scanner (first time only)"**: on first scan, check `caches.has('ocr-v1')` and show download progress in the existing `progressText`/`progressFill`. Optional: a "Download scanner for offline use" button in Settings, plus warming the model at idle via `requestIdleCallback`, but only once the user has scanned before. Don't spend 30 MB of someone's data on page load.
- **Threads:** multi-threaded wasm needs `crossOriginIsolated`. Adding `COOP: same-origin` + `COEP: require-corp` in `vercel.json` would block the Google Fonts `<link>` unless it gets `crossorigin` or the fonts are self-hosted. Ship single-threaded first, measure, and add isolation only if the speedup is worth it.
- Feature flag `localStorage.sp_ocrEngine = 'tesseract' | 'paddle'` so both engines can be compared on the same fixtures during this step.
- **Done when:** a receipt scanned through the existing upload path returns `OcrLine[]` with boxes and scores, works in airplane mode after the first scan, and the UI stays responsive.

**As built (2026-10-23).** Done, with these departures from the sketch above:
- **Models:** PP-OCRv5 mobile det + `latin_PP-OCRv5_mobile_rec`, chosen with the benchmark (`bench/README.md`). It got every price and tax right on 16/16 synthetic images; v6 tiny managed 10/16 and Tesseract 4/16.
- **Own worker, not the SDK's `worker: true`.** The SDK's prebuilt worker bundles the WebGPU build of ONNX Runtime 1.24.3, which needs a 25 MB wasm. `src/scan/paddle.worker.ts` runs the SDK's main-thread pipeline inside our own worker, and `vite.config.ts` aliases `onnxruntime-web` to its wasm-only build (12 MB). The SDK decodes Blobs through a DOM canvas, so the worker decodes with `OffscreenCanvas` and passes an OpenCV Mat. That needs Safari 16.4+; older browsers fall back to Tesseract.
- **No `wasmPaths` / no copied wasm.** Vite emits ONNX Runtime's wasm as a content-hashed asset, which the runtime finds on its own. `public/ocr/` only holds the model tars. `onnxruntime-web` is pinned to 1.24.3 to match what the SDK was built against, and the fetch script fails the build if they drift.
- **First download:** ~36 MB in total (worker chunk with OpenCV 10.6 MB, wasm 12.4 MB, models 12.9 MB), fetched on the main thread with a byte-accurate progress bar. The service worker caches each file in `ocr-v1` (cache-first). Verified with `vite preview`: first scan downloads and caches all four files, a scan with the server stopped works from the cache, and a scan offline before any download shows the existing "OCR unavailable offline" message.
- **Row merging moved here from Step 2** (`src/scan/rows.ts`), because PaddleOCR returns one box per text run and Step 1 would otherwise have split every price from its item. It corrects for photo tilt first: without that, a 3.5° tilt in the benchmark paired prices with the wrong items.
- **Fallback order:** PaddleOCR, then Tesseract if PaddleOCR fails or can't run. `localStorage.sp_ocrEngine = 'tesseract'` forces the old engine.
- **Real photos are slower than the benchmark:** 3.3 s and 4.3 s for two 1512×2016 phone photos on desktop (1.8 s for an 812 px image), against 1.7 s for the synthetic images. On a phone, expect several times that. Step 3's resize to a ~1500–2000 px long side and wasm threads are the levers. Measure on a device before Step 4.
- **Not done yet:** idle pre-warming and a "download for offline" button in Settings. Wasm threads are also off (no COOP/COEP), so scans are single-threaded: about 1.7 s per receipt on desktop, untested on a phone.

### Step 2: Field extraction (Phase 6)
**As built (2026-10-23).** `parseReceipt(lines | text, { zeroDecimal, monthFirst, today })` in `src/scan/parse.ts` returns `{ merchant, date, items, subtotal, discount, tax, taxIncluded, tip, total, confidence }`. Three real receipts (`test/fixtures/receipts/real/`) parse correctly on every field, against 2 of 3 wrong before.
- **Amounts:** `1,234.56`, `1.234,56`, `3,50 €`, `$-1.00`, `(2.50)`, trailing tax-code letters (`3.49 T`). Zero-decimal currencies (¥, ₩, …) accept `¥800` and `1,200` but not bare integers, which are too often zip codes. The decimal style is read per number, so no currency prior is needed; the user's currency only decides zero-decimal mode and the date order (`receiptHints()` in `helpers.ts`).
- **Sections:** items stop at the first subtotal/total line. Lines are classified as subtotal, tax, tip, total, discount, payment or metadata with keyword lists that include common French, German, Spanish and Italian words.
- **Totals:** tries combinations of tax (summed, e.g. GST + PST, or a single line), printed tip and "tax already included" until `subtotal + tax + tip` matches a printed total, so it picks "Payment Total" over "Bill Total" when a tip was added. `confidence: 'high'` only when items match the subtotal and the arithmetic closes. A suggested-tip table (several `Tip 18%` lines or "suggested") isn't a tip.
- **Names:** wrapped names are joined above the price (a line starting with a count, as on the Mango receipt) and below it (left-aligned lines with real words, as on the hot pot receipt). Fragments the Latin model makes of CJK lines are skipped. Accents and brackets are kept, dot leaders dropped, and names are capped at 80 characters (was 40).
- **Quantities:** `2x`, `2 x` and `3 @ 2.50` now split like `3 Fries` did. The rounding cent goes on the last unit so units add up to the line.
- **Merchant** is the first name-like line above the first price, skipping addresses, phones and table info. **Date** reads numeric, ISO and month-name formats, uses the currency's order for ambiguous dates, and rejects impossible or future dates.
- **App change:** when tax is already included in the prices, the items screen now gets 0 tax instead of adding the VAT a second time.
- **Not done:** `fieldSources` (box per field) moves to Step 5, which is the first step that needs it. Tip, total, merchant and date are parsed but not yet used by the UI. A receipt with a printed tip still gets the app's own tip percentage on top, and the even-split prefill and merchant-as-label are still to do (Step 5).

### Step 3: Quality gate and cleanup on still images (Phases 3 + 4)
These run on any image, uploaded or captured, so they come before the live camera.
- Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, falling back to `<img>` decode, which is EXIF-aware in current Safari and Chrome.
- `src/scan/quality.ts`: pure functions over `Uint8ClampedArray` for Laplacian variance (3×3) and a luminance histogram (near-white / near-black fractions). Unit-test them with synthetic images. Log values for each fixture and pick the threshold from real data, starting at 100–200 at a 1000 px long side.
- "Photo is blurry, retake?" uses the existing `confirmDialog` pattern with Retake / Use anyway.
- Cleanup: `scanic.scanDocument(img)` → corners → `extractDocument` warp. If no corners are found, show `createCornerEditor` (Scanic ships it) for manual handles, or fall back to the full image. Then grayscale + mild contrast stretch (no binarization) and resize to a 1500–2000 px long side. Very tall receipts get overlapping vertical tiles at roughly 1:2 aspect, with OCR lines de-duplicated across the overlap by box.
- Since Paddle already pulls in OpenCV.js, its `warpPerspective` is a fallback if Scanic struggles. Don't add a second OpenCV.


**As built (2026-10-24).** Measured first, then built only what the measurements supported.
- **Upright decode and size cap** (`src/scan/image.ts`): `prepareImage()` decodes with EXIF orientation applied (with an `<img>` fallback), caps the long side at 2560 px, and re-encodes as JPEG 0.92. A photo stored sideways with an EXIF rotation tag scans the same as the original.
- **Faster text detection:** where the time goes on the 1512×2016 photos (desktop, rough): detection 1.4 s and recognition 1.9–2.9 s. Detecting on a copy capped at 1280 px (`textDetLimitType: 'max'`) while recognition still reads full-resolution crops cut detection to ~0.5 s with every field still correct: hot pot 4.2 s → ~3.4 s, Mango 3.3 s → ~2.4 s. This matters more on phones: a 12 MP photo would otherwise make detection grow with the megapixels. Downscaling the whole photo instead, or batching 16 crops, broke item names on the hot pot receipt. Recognition is now most of the time; wasm threads are the remaining lever.
- **Quality gate** (`src/scan/quality.ts`). Calibrated with 10 copies of each real photo (blur 1–5 px, brightness 18–220%), recording both the metrics and whether OCR still read every amount:
  - PaddleOCR is far more forgiving than this plan assumed. It read copies blurred by 3 px, darkened to 18% and brightened 1.6×, and the Mango photo blurred by 5 px still worked. Meanwhile the hot pot photo failed at 2 px blur. No blur or brightness threshold separates "readable" from "not" without nagging on good photos.
  - So the gate before OCR only catches hopeless photos: edge strength (mean of the strongest 1% of Laplacian responses, which isn't fooled by blank paper) under 10, or mean brightness under 20. It offers **Retake / Use anyway**.
  - The real gate runs after OCR: the parser's `confidence` (do items + tax + tip match the printed totals). It flagged 4 of the 5 failures. A low-confidence scan offers **Retake / Check items** ("No prices found" offers **Retake / Enter manually**).
  - The 5th failure was a dark copy where OCR read the quantity "1" as "7" and split one $1.99 item into seven, and the arithmetic still closed. The parser now only splits a quantity when the line total divides evenly by it (or matches an "@ unit price"); otherwise it keeps one item and leaves the number visible.
- **Not done, on purpose:**
  - **Auto-crop / perspective correction.** Scanic's classical detector got all three real photos wrong: a 73×120 px box around the barcode area of a full-frame receipt, a skewed quad for a receipt running off the frame, and a sliver of hand and table for a receipt held in hand. PaddleOCR reads all three correctly uncropped, so a crop could only make things worse. Scanic was removed. Its ML detector wasn't tried: it downloads its model from a CDN and would need self-hosting.
  - **Grayscale + contrast stretch:** dark and overexposed copies already read fine, so there was nothing for it to fix.
  - **Manual corner handles and tiling very tall receipts:** no auto-crop to correct, and no long-receipt sample to test tiling against. Revisit if a real long receipt fails.

### Step 4: Live camera with guidance (Phases 1 + 2)
- New screen `screenCamera`, reached from "Take Photo" on `screenCapture` when `navigator.mediaDevices?.getUserMedia` exists. Without it, the button keeps today's `capture="environment"` behavior. Also keep "Upload Photo" (native camera/gallery), which the plan notes often gives the sharpest image.
- `getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } } })`. Apply `focusMode: 'continuous'` and show the torch toggle only when `getCapabilities()` reports them. Shutter uses `ImageCapture.takePhoto()` when available and a full-res canvas frame otherwise (iOS).
- Stop tracks in `goTo` when leaving `screenCamera`, on `visibilitychange`, and on `pagehide`. Permission denied: show a clear message and switch to Upload.
- **Rethink before building:** Step 3 showed Scanic misses real receipts (full-frame, running off the edges, held in hand), so the outline/auto-capture below needs a different detector or a simpler guide (e.g. a fixed frame plus the blur/brightness check on live frames).
- Guidance: a `setInterval` of about 4 Hz draws a downscaled frame (640 px long side) and runs Scanic detection, in an `OffscreenCanvas` worker where supported (unverified that Scanic runs in a worker; check early). Draw the quad on an overlay canvas. Show one hint at a time based on quad area, skew, mean luminance and contrast with the background. Auto-capture once the corners have stayed within about 3% of the frame diagonal for 1 s, with the manual shutter always available.

**As built (2026-10-24).** A live camera without an outline detector (`src/camera.ts`, `screenCamera`):
- **When it's used:** "Take Photo" opens it on touch devices that support `getUserMedia`. Desktops keep the file picker, since a laptop webcam is a worse way to photograph a receipt than a phone. "Upload Photo" and the phone's own camera app (via the file input) are unchanged.
- **Camera:** rear camera at up to 4032×3024, continuous focus and a torch button when the camera reports them. The shutter uses `ImageCapture.takePhoto()` (full-resolution still) where available and falls back to the video frame (iOS). The photo then goes through the same `scanPhoto()` path as an upload.
- **Guidance without detection:** a fixed receipt-shaped guide frame plus one hint at a time, from a 1000 px grayscale copy of the frame four times a second (`src/scan/live-hints.ts`): "Too dark" (suggests the light when there is one), "Hold still" (frame-to-frame motion), "Focusing…" (no sharp edges), then "Looks good". A hint only changes after two matching frames, so it doesn't flicker. The frame turns green when ready.
- **No auto-capture:** without knowing where the receipt is, it would fire at the table. The shutter is manual.
- **Lifecycle:** the camera is released when leaving the screen (close button, Escape, or after the shot), when the app is backgrounded (and restarted on return), and on `pagehide`. If permission is denied or there's no camera, the screen explains why and offers "Use camera app" and "Upload Photo".
- **Verified** in the browser pane at phone size with a stand-in camera (a canvas stream of the Mango photo): hints switch for steady, shaken and darkened frames; the shot parses to the correct four items; tracks end after the shot, on close and on Escape; the blocked state shows its message and buttons; the desktop opens the file picker. **Not verified on a real phone:** torch, focus, `ImageCapture` stills, iOS Safari/PWA behavior, and whether the hint thresholds (dark below mean 60, motion above 8, edges below 12) suit real camera noise. Tune those on a device.

### Step 5: Review (Phase 7), reusing `screenItems`
- Add a collapsible cropped-receipt thumbnail above the item list. Tapping an item row highlights its `fieldSources` box on the image.
- Low-confidence rows (OCR score under a threshold, or failing the sanity check) get a warning style that reuses `--warn`/`triangle-warning.svg`.
- Prefill the bill label with the merchant, and add a "Receipt total" check row that warns when items + tax ≠ total.
- What gets saved depends on Decision 3.

**As built (2026-10-24).** Built around putting the parsed fields to use. All verified in the app with the real receipts:
- **No double tip.** When the receipt has a printed tip, the summary's tip row gets a "Tip on receipt: $20.09" button, selected automatically, so the app uses that exact amount instead of adding its own percentage. Tapping a percentage switches back. The summary, share text and image export say "Tip (from receipt)", and the pre/post-tax choice is hidden while it's selected. History stores the equivalent percentage (Mango: 18%). The hot pot receipt now totals $131.69, as printed, instead of $131.69 + 18%.
- **Receipt total check** on the items screen: a live line that turns green ("Matches the receipt total of $38.38") or warns ("Items + tax + tip come to $131.06; the receipt says $131.69") as items are edited.
- **Discounts** (e.g. a member discount) become a negative "Discount" item. The unassigned-items warning now covers it, so it can't be silently left out.
- **Even split:** "Scan receipt" on the total screen goes to the capture screen; a scan fills the total (before any printed tip) with "tax included" on, and returns. "Enter manually" and Back return to the total screen. If no total is found, the prompt offers Retake or Enter manually.
- **Saved bills** (Decision 3a): the merchant prefills the bill label (all-caps names title-cased: "AROMA CAFE" → "Aroma Cafe"), and `Bill` gains optional `merchant` and `receiptDate`. History details show the receipt's date when there is one. No images are stored.
- **Not done:** the receipt thumbnail with tap-to-highlight and per-row low-confidence styling. Both need box-level `fieldSources` from the parser, and the total check above already points at a misread. Worth doing if real use shows people struggling to find the bad line.

### Step 6: Remove Tesseract and update docs
- Delete the `<script>` from `index.html`, `engine-tesseract.ts`, and the feature flag.
- Update the README (tech stack, privacy, "Why no tests?", project structure), the in-app privacy note, the meta description, and the share/OG text if it mentions OCR.
- Write the deliverable summary the plan asks for: files touched, measured OCR time on a test device, blur threshold, known limitations.

## Decisions needed before Step 1

1. **Download budget.** About 28–43 MB on first scan (ORT 11 MB + OpenCV 10 MB + models 6–22 MB), cached afterwards. OK? Or should we prefer the smallest option (PP-OCRv6_tiny, about 28 MB total) if accuracy holds up?
2. **Receipt languages.** English only (`en_` rec, 7.9 MB), Latin-script incl. accents for EUR/GBP etc. (`latin_` rec, 8.1 MB), or CJK too (multilingual rec, 16.7 MB)? The app supports 41 currencies, so this is a real question.
3. **Data model.** The plan says to save the cropped image and confirmed fields. `Bill` currently stores neither, and 50 bills × a ~150 KB WebP is about 7.5 MB in IndexedDB. Options: (a) don't persist the image, only add optional `merchant`/`receiptDate` to `Bill`; (b) persist a compressed thumbnail; (c) full cropped image. I'd recommend (a) for privacy and simplicity.
4. **Routing.** Step 4 adds `screenCamera`. Should scanning also be offered in **even-split** mode to prefill total and tax on `screenQuick`? Today scanning only exists in by-item mode.

## Risks

- **iOS memory:** ORT wasm plus a 16 MB rec model in an installed PWA on older iPhones can get the tab killed. Test early on the oldest target device; PP-OCRv6_tiny is the fallback.
- **Pre-release SDK:** `paddleocr-js` is at 0.x, so pin it exactly. The API has already changed once (PP-OCRv6 added).
- **COEP side effects** if threads are enabled (fonts, any cross-origin image).
- **Repo and deploy size:** keep model binaries out of git (fetched at build).
