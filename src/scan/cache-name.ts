// Shared by the service worker (which fills it) and the app (which checks it to
// skip the first-download progress). Bump the version to drop old OCR assets.
export const OCR_CACHE = 'ocr-v1';
