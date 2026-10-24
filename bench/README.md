# OCR benchmark

```bash
npm run bench
```

This downloads the benchmark-only models into `bench/models/` (gitignored), starts the dev server and opens `/bench/`. Click **Run benchmark**.

Each fixture in `test/fixtures/receipts/` is rendered as four synthetic images, and every engine reads all of them:

| Variant | What it simulates |
| --- | --- |
| clean | Flat scan, black on white, ~32 px text |
| photo | Phone photo: 3.5° tilt, slight blur, JPEG noise, paper on a table, ~44 px text |
| faded | Worn thermal paper: grey ink, 6° tilt, more blur and noise, ~44 px text |
| small | Distant or downscaled shot, ~18 px text |

Metrics:
- **CER**: character error rate against the fixture text
- **Amounts exact**: every item price and the tax match, ignoring item names. This is what changes who owes what.
- **Parse exact**: the parser's full output (names included) matches what it produces from the true text
- **Median scan**: per image on the machine running the page, not a phone

The images are synthetic, so treat this as a relative comparison. Add real receipt photos to tighten it (see `test/fixtures/receipts/README.md`).

## Results, 2026-10-23

Desktop Chromium (built-in browser), single-threaded wasm (the page isn't cross-origin isolated), 4 fixtures × 4 variants.

| Engine | Model download | CER | CER clean / photo / faded / small | Amounts exact | Parse exact | Median scan |
| --- | --- | --- | --- | --- | --- | --- |
| **PP-OCRv5 mobile det + latin rec** (shipped) | 12.9 MB | **2.1%** | 0.9 / 2.7 / 2.9 / 2.1% | **16/16** | 8/16 | 1.7 s |
| PP-OCRv6 tiny det + rec | 6.3 MB | 4.4% | 2.2 / 4.2 / 8.7 / 2.6% | 10/16 | 6/16 | 0.8 s |
| Tesseract 5 (eng) | ~11 MB from CDN | 24.9% | 3.2 / 6.4 / 81.8 / 8.1% | 4/16 | 1/16 | 0.5 s |

All of PP-OCRv5's "parse exact" misses are cosmetic name differences (`OZ` for `oz`, `lOpc` for `10pc`, a dropped `...`). Every price and tax was right.

**Decision:** ship PP-OCRv5 mobile + latin. It halves the character errors of v6 tiny and is the only engine that got every amount right, for 6.6 MB more on a one-time download that totals about 36 MB either way (the OCR worker and ONNX Runtime wasm are ~23 MB). It's about twice as slow as tiny, so measure on a real mid-range phone. If scans there take much over 5 s, enabling wasm threads (needs COOP/COEP headers) is the first thing to try before switching models.
