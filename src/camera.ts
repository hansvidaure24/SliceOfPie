import { $, tap } from './helpers';
import { goTo, onLeaveScreen } from './router';
import { scanPhoto, takePhotoNative } from './items';
import { QUALITY_SIDE, toGray } from './scan/quality';
import { frameStats, frameHint, hintText, type HintKind } from './scan/live-hints';

// Torch and focus aren't in TypeScript's DOM types yet
interface CameraCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
  focusMode?: string[];
}
declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  takePhoto(settings?: { fillLightMode?: 'off' | 'flash' | 'auto' }): Promise<Blob>;
}

let stream: MediaStream | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let prevGray: Uint8Array | null = null;
let torchAvailable = false;
let torchOn = false;
let shownHint: HintKind | null = null;
let pendingHint: HintKind | null = null;
let shooting = false;

const video = () => $('cameraVideo') as HTMLVideoElement;
const onCameraScreen = () => $('screenCamera').classList.contains('active');

// The in-app camera is for phones and tablets. On a laptop the file picker
// (or a photo from the phone) is the better route than the webcam.
export function liveCameraAvailable(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && matchMedia('(pointer: coarse)').matches;
}

export function takePhoto(): void {
  if (liveCameraAvailable()) void openCamera();
  else takePhotoNative();
}

function setState(state: 'starting' | 'live' | 'blocked', message = ''): void {
  $('screenCamera').dataset.state = state;
  $('cameraBlocked').hidden = state !== 'blocked';
  $('cameraBlockedMsg').textContent = message;
  ($('cameraShutter') as HTMLButtonElement).disabled = state !== 'live';
  if (state === 'starting') $('cameraHint').textContent = 'Starting camera…';
}

export async function openCamera(): Promise<void> {
  if (!onCameraScreen()) goTo('screenCamera');
  setState('starting');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // 4:3 at up to 12 MP; browsers pick the closest mode the camera supports
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 } },
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    setState('blocked', name === 'NotAllowedError' || name === 'SecurityError'
      ? 'Camera access is blocked. Allow it in your browser settings, or use your camera app instead.'
      : 'No camera could be started. Use your camera app or upload a photo instead.');
    return;
  }
  // The user may have backed out while the permission prompt was up
  if (!onCameraScreen()) { stopCamera(); return; }

  const v = video();
  v.srcObject = stream;
  await v.play().catch(() => {});

  const track = stream.getVideoTracks()[0];
  const caps = (track.getCapabilities?.() ?? {}) as CameraCapabilities;
  if (caps.focusMode?.includes('continuous')) {
    track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => {});
  }
  torchAvailable = caps.torch === true;
  $('cameraTorch').hidden = !torchAvailable;
  setTorchButton(false);

  setState('live');
  timer = setInterval(analyzeFrame, 250);
}

export function stopCamera(): void {
  if (timer) clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  const v = video();
  v.srcObject = null;
  prevGray = null;
  shownHint = pendingHint = null;
  torchOn = false;
  $('cameraGuide').className = 'camera-guide';
}

export function closeCamera(): void {
  goTo('screenCapture');
}

function setTorchButton(on: boolean): void {
  torchOn = on;
  const btn = $('cameraTorch');
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? 'Turn off light' : 'Turn on light');
  btn.classList.toggle('on', on);
}

export async function toggleTorch(): Promise<void> {
  const track = stream?.getVideoTracks()[0];
  if (!track || !torchAvailable) return;
  tap();
  const next = !torchOn;
  try {
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
    setTorchButton(next);
  } catch {
    $('cameraTorch').hidden = true;
  }
}

// A small grayscale copy of the current frame, a few times a second, for the hint
const analysisCanvas = document.createElement('canvas');

function analyzeFrame(): void {
  const v = video();
  if (v.readyState < 2 || !v.videoWidth) return;
  const s = Math.min(1, QUALITY_SIDE / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.round(v.videoWidth * s);
  const h = Math.round(v.videoHeight * s);
  if (analysisCanvas.width !== w) analysisCanvas.width = w;
  if (analysisCanvas.height !== h) analysisCanvas.height = h;
  const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(v, 0, 0, w, h);
  const gray = toGray(ctx.getImageData(0, 0, w, h).data);
  const hint = frameHint(frameStats(gray, w, h, prevGray));
  prevGray = gray;

  // Only switch after seeing the same hint twice, so it doesn't flicker
  if (hint === shownHint) { pendingHint = null; return; }
  if (hint !== pendingHint && shownHint !== null) { pendingHint = hint; return; }
  shownHint = hint;
  pendingHint = null;
  $('cameraHint').textContent = hintText(hint, torchAvailable && !torchOn);
  $('cameraGuide').className = 'camera-guide ' + hint;
}

async function grabFrame(): Promise<Blob> {
  const v = video();
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext('2d')!.drawImage(v, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not capture frame'))), 'image/jpeg', 0.92));
}

export async function shootPhoto(): Promise<void> {
  const track = stream?.getVideoTracks()[0];
  if (!track || shooting) return;
  shooting = true;
  tap();
  $('screenCamera').classList.add('flash');
  let photo: Blob | null = null;
  // ImageCapture (Chrome on Android) returns a full-resolution still;
  // elsewhere (iOS) take the current video frame
  if (typeof ImageCapture === 'function') {
    try {
      photo = await new ImageCapture(track).takePhoto(torchAvailable ? { fillLightMode: torchOn ? 'flash' : 'off' } : undefined);
    } catch { /* fall back to the frame */ }
  }
  try {
    photo ??= await grabFrame();
  } catch {
    shooting = false;
    $('screenCamera').classList.remove('flash');
    return;
  }
  $('screenCamera').classList.remove('flash');
  shooting = false;
  goTo('screenCapture');
  void scanPhoto(photo);
}

onLeaveScreen('screenCamera', stopCamera);

// Release the camera when the app is backgrounded; pick it up again on return
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if (onCameraScreen() && !stream) void openCamera();
});
window.addEventListener('pagehide', stopCamera);
