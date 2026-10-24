# Receipt fixtures

Each receipt is a pair:

- `<name>.txt`: raw OCR text, exactly as the engine returned it
- `<name>.json`: the full `ParsedReceipt` that `parseReceipt` should return for it (dates checked against a fixed "today", 2026-10-23)

`test/receipts.test.ts` picks up every pair in this folder automatically.

These four are synthetic and their `.json` pins the parser's current output. When the parser changes, update the `.json` files in the same change so the diff shows what moved. `noisy` is deliberately nonsensical (a $1,049 wings order, a total that matches nothing), so it should stay `"confidence": "low"`.

## Real receipts (`real/`)

`test/real-receipts.test.ts` runs these. Each receipt is a pair:

- `<name>.ocr.json`: PaddleOCR's raw text boxes for the photo (text, score, 4-point polygon), so tests can re-run row merging and parsing without the model. Card numbers, auth and transaction codes are masked.
- `<name>.expected.json`: the correct answer, read off the photo by a person:
  `merchant`, `date` (ISO, `null` if not printed), `items` (ignores `$0.00` modifier lines), `subtotal`, `tax`, `tip` (`null` if none printed), and `total` (the final amount paid, including any printed tip). `subtotal + tax + tip` should equal `total`.

Checks the current parser fails are listed in `KNOWN_GAPS` in the test and run as `it.fails`. When a fix makes one pass, that test goes red until its entry is removed. That's the signal to delete it.

| Fixture | What makes it hard |
| --- | --- |
| `aroma-cafe` | Clean print; the total line is labelled `AMT`, the same word as the price column header |
| `hotpot-chowbus` | Long, bilingual (Chinese lines OCR to junk), item names wrap onto a line *below* the price, `$0.00` substitutions, tip already included |
| `mango-dessert` | Crumpled thermal paper at an angle; item names wrap with the price on the *second* line; tip already included |

## Adding a real receipt

1. Put the photo in `photos/`. That folder is gitignored because receipts can carry card digits and addresses.
2. With the app running (`npm run dev`), get the OCR boxes in the devtools console:
   ```js
   const { paddleEngine } = await import('/src/scan/engine-paddle.ts');
   const blob = await (await fetch('/test/fixtures/receipts/photos/<name>.jpg')).blob();
   const { segments } = await paddleEngine.recognizeDetailed(blob);
   copy(JSON.stringify(segments));
   ```
3. Save it as `real/<name>.ocr.json` in the same shape as the others (round the coordinates). **Mask card numbers, auth and transaction codes.**
4. Write `real/<name>.expected.json` by hand with the **correct** values, not the parser's output. Add any checks that fail today to `KNOWN_GAPS` (empty as of Step 2: all three real receipts parse correctly).
