// Shared by the service worker (which fills it) and the app (which checks it to
// skip the first-download progress). Bump the version to drop old OCR assets.
export const OCR_CACHE = 'ocr-v1';

// A receipt photo shared to the app from another app, waiting to be scanned
export const SHARE_CACHE = 'share-target';
export const SHARED_RECEIPT_URL = '/shared-receipt';
