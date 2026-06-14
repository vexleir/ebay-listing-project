// IMG-001 (last slice) — brightness / contrast / saturation enhancement.
// Each adjustment is normalized to a percent in [-100, 100] where 0 is the
// identity (no change). The math runs once on Save against the raw pixel
// buffer; the modal previews via CSS `filter` so the slider stays
// interactive even on slow phones.
//
// Pure helpers (`clampPercent`, `applyEnhancements`, `cssFilterFor`) are
// unit-tested. The canvas pipeline (`enhanceImageFile`) is exercised at
// runtime through the modal — happy-dom's canvas mock doesn't support
// `getImageData` / `toBlob` reliably enough to unit-test end-to-end.

export interface EnhanceOptions {
  // -100..+100. Identity is 0.
  brightness?: number;
  // -100..+100. Identity is 0.
  contrast?: number;
  // -100..+100. Identity is 0; -100 → grayscale; +100 → ~2× saturation.
  saturation?: number;
}

export const ENHANCE_LIMIT = 100;
export const ENHANCE_IDENTITY: Required<EnhanceOptions> = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
});

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-ENHANCE_LIMIT, Math.min(ENHANCE_LIMIT, value));
}

export function isIdentity(opts: EnhanceOptions): boolean {
  return clampPercent(opts.brightness ?? 0) === 0
    && clampPercent(opts.contrast ?? 0) === 0
    && clampPercent(opts.saturation ?? 0) === 0;
}

// CSS `filter` string that matches the canvas math, for the live preview.
// brightness: -100 → 0, 0 → 1, +100 → 2 (linear).
// contrast:   -100 → 0, 0 → 1, +100 → 2 (linear).
// saturation: -100 → 0, 0 → 1, +100 → 2 (linear).
export function cssFilterFor(opts: EnhanceOptions): string {
  const b = (100 + clampPercent(opts.brightness ?? 0)) / 100;
  const c = (100 + clampPercent(opts.contrast ?? 0)) / 100;
  const s = (100 + clampPercent(opts.saturation ?? 0)) / 100;
  if (b === 1 && c === 1 && s === 1) return 'none';
  return `brightness(${b}) contrast(${c}) saturate(${s})`;
}

// Pure pixel transform — operates on an RGBA Uint8ClampedArray in-place.
// Exposed so tests can verify the math without a canvas. The clamping is
// handled by the array's own type so writes outside 0..255 are safe.
//
// brightness: pixel + delta (delta = brightness/100 * 255)
// contrast:   (pixel - 128) * factor + 128 (factor = (100+contrast)/100, range 0..2)
// saturation: rgb shifted toward / away from per-pixel grayscale (luma)
//             factor 0..2, where 0 = full grayscale and 2 = 2× saturated
export function applyEnhancements(data: Uint8ClampedArray, opts: EnhanceOptions): void {
  const bP = clampPercent(opts.brightness ?? 0);
  const cP = clampPercent(opts.contrast ?? 0);
  const sP = clampPercent(opts.saturation ?? 0);
  if (bP === 0 && cP === 0 && sP === 0) return;

  const brightnessDelta = (bP / 100) * 255;
  const contrastFactor = (100 + cP) / 100;
  const satFactor = (100 + sP) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    // alpha at i+3 unchanged

    // Brightness — additive shift.
    if (brightnessDelta !== 0) {
      r += brightnessDelta;
      g += brightnessDelta;
      b += brightnessDelta;
    }

    // Contrast — scale around 128.
    if (contrastFactor !== 1) {
      r = (r - 128) * contrastFactor + 128;
      g = (g - 128) * contrastFactor + 128;
      b = (b - 128) * contrastFactor + 128;
    }

    // Saturation — interpolate between gray (Rec.601 luma) and the color.
    if (satFactor !== 1) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = luma + (r - luma) * satFactor;
      g = luma + (g - luma) * satFactor;
      b = luma + (b - luma) * satFactor;
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

const ENHANCED_QUALITY = 0.92;

// Applies brightness/contrast/saturation to `file` and resolves to a new
// PNG File. Identity opts short-circuit (returns the original File).
export async function enhanceImageFile(file: File, opts: EnhanceOptions): Promise<File> {
  if (isIdentity(opts)) return file;

  const img = await loadImage(file);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, W, H);
  applyEnhancements(imageData.data, opts);
  ctx.putImageData(imageData, 0, 0);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
      ENHANCED_QUALITY,
    );
  });

  const stem = file.name.replace(/\.[^.]+$/, '') || 'enhanced';
  return new File([blob], `${stem}.png`, { type: 'image/png' });
}
