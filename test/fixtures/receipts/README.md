# Receipt fixtures

Each receipt is a pair:

- `<name>.txt`: raw OCR text, exactly as the engine returned it
- `<name>.json`: what `parseReceipt` should return for it (`{ items, tax }`)

`test/receipts.test.ts` picks up every pair in this folder automatically.

The four starting fixtures are synthetic. Their `.json` files were generated
from the parser **before** the `src/scan/` refactor, so they pin current
behavior, quirks included:

- `cafe-eu`: `CARTE BANCAIRE 19,40` becomes an item (the SKIP list is English-only)
- `diner`: `2x Milkshake 13.00` stays one item; only a bare leading number like `3 Fries` gets split
- `noisy`: OCR noise like `...` stays in item names

When the parser gets better (Step 2 of `docs/ocr-migration-plan.md`), update the
`.json` files in the same change so the diff shows what improved.

## Adding a real receipt

1. Put the photo in `photos/`. That folder is gitignored because receipts can carry card digits and addresses.
2. Get the raw text. With the app running (`npm run dev`), pick the photo in the devtools console:
   ```js
   const [f] = await window.showOpenFilePicker().then(h => Promise.all(h.map(x => x.getFile())));
   console.log((await Tesseract.recognize(f, 'eng')).data.text);
   ```
   (Or use any `<input type=file>` and pass its file.)
3. Save the text as `<name>.txt`. Redact anything personal.
4. Write `<name>.json` by hand with the **correct** items and tax, not the parser's
   output. A failing test is fine; it marks what the parser still misses. Use
   `it.fails` or leave it out of CI until the parser catches up.
