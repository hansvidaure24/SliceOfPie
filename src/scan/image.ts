import { QUALITY_SIDE, toGray } from './quality';

// Photos are capped to this long side before OCR. Text on a receipt that fills
// a 2560 px frame is still ~40 px tall, comfortably above what recognition
// needs, while a 12 MP phone photo (4032 px) would cost 2.5× the memory.
export const OCR_MAX_SIDE = 2560;

export interface PreparedImage {
  // Upright JPEG for OCR
  blob: Blob;
  width: number;
  height: number;
  // Small grayscale copy for the quality check
  gray: Uint8Array;
  grayWidth: number;
  grayHeight: number;
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari rejects the options bag; <img> applies EXIF orientation itself
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function draw(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

// Decodes a photo upright (EXIF orientation applied), caps its size and
// re-encodes it, so the OCR worker always gets a predictable image.
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const src = await decode(file);
  const sw = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const sh = src instanceof HTMLImageElement ? src.naturalHeight : src.height;

  const scale = Math.min(1, OCR_MAX_SIDE / Math.max(sw, sh));
  const full = draw(src, Math.round(sw * scale), Math.round(sh * scale));
  if ('close' in src) src.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    full.toBlob(b => (b ? resolve(b) : reject(new Error('Could not encode photo'))), 'image/jpeg', 0.92));

  const qs = Math.min(1, QUALITY_SIDE / Math.max(full.width, full.height));
  const small = draw(full, Math.round(full.width * qs), Math.round(full.height * qs));
  const pixels = small.getContext('2d')!.getImageData(0, 0, small.width, small.height).data;

  return {
    blob,
    width: full.width,
    height: full.height,
    gray: toGray(pixels),
    grayWidth: small.width,
    grayHeight: small.height,
  };
}
