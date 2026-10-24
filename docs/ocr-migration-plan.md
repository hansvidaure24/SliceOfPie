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
- **Not done yet:** idle pre-warming and a "download for offline" button in Settings. Wasm threads are also off (no COOP/COEP), so scans are single-threaded: about 1.7 s per receipt on desktop, untested on a phone.

### Step 2: Field extraction (Phase 6)
- Change `parseReceipt(lines: OcrLine[], opts: { currency })` to return `{ merchant, date, items, subtotal, tax, total, currency, confidence, fieldSources }`.
- ~~Row merging~~: done in Step 1 (`rows.ts`).
- The name cleanup regex strips every non-ASCII letter, so a perfectly read "Crème brûlée" becomes "Cr me brul e". Allow Unicode letters (`\p{L}`) now that the recognizer reads Latin accents.
- Keep the current heuristics: the SKIP list, tax max, the $10k ceiling, and **qty → N unit items**. The original plan doesn't mention that last one, but by-item assignment depends on it.
- Add total, date, merchant and the `items + tax ≈ total` sanity check as the plan describes. Use the user's selected currency (`helpers.ts`) as the prior for `1.234,56` vs `1,234.56`. JPY and other zero-decimal currencies need prices without `.dd`, which the current regexes reject.
- `fieldSources` maps each field or item index to its source line boxes, for Step 5.
- Tests: one fixture per real receipt, asserting items/tax/total. Add regression cases for the current regex behavior.

### Step 3: Quality gate and cleanup on still images (Phases 3 + 4)
These run on any image, uploaded or captured, so they come before the live camera.
- Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, falling back to `<img>` decode, which is EXIF-aware in current Safari and Chrome.
- `src/scan/quality.ts`: pure functions over `Uint8ClampedArray` for Laplacian variance (3×3) and a luminance histogram (near-white / near-black fractions). Unit-test them with synthetic images. Log values for each fixture and pick the threshold from real data, starting at 100–200 at a 1000 px long side.
- "Photo is blurry, retake?" uses the existing `confirmDialog` pattern with Retake / Use anyway.
- Cleanup: `scanic.scanDocument(img)` → corners → `extractDocument` warp. If no corners are found, show `createCornerEditor` (Scanic ships it) for manual handles, or fall back to the full image. Then grayscale + mild contrast stretch (no binarization) and resize to a 1500–2000 px long side. Very tall receipts get overlapping vertical tiles at roughly 1:2 aspect, with OCR lines de-duplicated across the overlap by box.
- Since Paddle already pulls in OpenCV.js, its `warpPerspective` is a fallback if Scanic struggles. Don't add a second OpenCV.

### Step 4: Live camera with guidance (Phases 1 + 2)
- New screen `screenCamera`, reached from "Take Photo" on `screenCapture` when `navigator.mediaDevices?.getUserMedia` exists. Without it, the button keeps today's `capture="environment"` behavior. Also keep "Upload Photo" (native camera/gallery), which the plan notes often gives the sharpest image.
- `getUserMedia({ video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } } })`. Apply `focusMode: 'continuous'` and show the torch toggle only when `getCapabilities()` reports them. Shutter uses `ImageCapture.takePhoto()` when available and a full-res canvas frame otherwise (iOS).
- Stop tracks in `goTo` when leaving `screenCamera`, on `visibilitychange`, and on `pagehide`. Permission denied: show a clear message and switch to Upload.
- Guidance: a `setInterval` of about 4 Hz draws a downscaled frame (640 px long side) and runs Scanic detection, in an `OffscreenCanvas` worker where supported (unverified that Scanic runs in a worker; check early). Draw the quad on an overlay canvas. Show one hint at a time based on quad area, skew, mean luminance and contrast with the background. Auto-capture once the corners have stayed within about 3% of the frame diagonal for 1 s, with the manual shutter always available.

### Step 5: Review (Phase 7), reusing `screenItems`
- Add a collapsible cropped-receipt thumbnail above the item list. Tapping an item row highlights its `fieldSources` box on the image.
- Low-confidence rows (OCR score under a threshold, or failing the sanity check) get a warning style that reuses `--warn`/`triangle-warning.svg`.
- Prefill the bill label with the merchant, and add a "Receipt total" check row that warns when items + tax ≠ total.
- What gets saved depends on Decision 3.

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
