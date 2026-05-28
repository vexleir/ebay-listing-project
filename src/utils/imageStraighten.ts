// IMG-001 — straighten (free-angle rotation). Rotates by a small angle and
// crops to the largest aspect-preserving rectangle that still fits inside
// the rotated image, so the user never sees the transparent corners that
// canvas rotation leaves behind.
//
// Math note: for an image of dimensions W×H rotated by angle θ, the largest
// inscribed AABB preserving the original W:H aspect ratio is governed by the
// two constraints:
//   newW*|cos θ| + newH*|sin θ| ≤ W
//   newW*|sin θ| + newH*|cos θ| ≤ H
// With newH = (H/W)*newW (aspect preservation), the tighter constraint gives
// the maximum newW. We cap at W so θ=0 returns the unchanged dimensions.

export interface StraightenResult {
  width: number;
  height: number;
}

export const STRAIGHTEN_LIMIT_DEG = 15;

// Returns the dimensions of the inscribed AABB after rotating a W×H image by
// `degrees`. Result is rounded to integers and clamped to ≥ 1.
export function inscribedRectAfterRotation(width: number, height: number, degrees: number): StraightenResult {
  if (!Number.isFinite(degrees) || degrees === 0) return { width, height };
  const theta = (degrees * Math.PI) / 180;
  const s = Math.abs(Math.sin(theta));
  const c = Math.abs(Math.cos(theta));

  // Both constraints solved for newW with the aspect ratio plugged in:
  //   bound1 = W² / (W*c + H*s)
  //   bound2 = (W*H) / (W*s + H*c)
  const bound1 = (width * width) / (width * c + height * s);
  const bound2 = (width * height) / (width * s + height * c);
  let newW = Math.min(width, bound1, bound2);
  let newH = (newW * height) / width;
  newW = Math.max(1, Math.round(newW));
  newH = Math.max(1, Math.round(newH));
  return { width: newW, height: newH };
}

// Clamps a user-supplied angle to the supported straighten window.
export function clampStraightenAngle(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  return Math.max(-STRAIGHTEN_LIMIT_DEG, Math.min(STRAIGHTEN_LIMIT_DEG, degrees));
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

const STRAIGHTENED_QUALITY = 0.92;

// Straightens a File by `degrees` (clamped to ±STRAIGHTEN_LIMIT_DEG).
// The output is a PNG sized to the inscribed AABB so the seller never sees
// transparent corners. A 0° angle short-circuits and returns the original
// File unchanged — saves one Canvas round-trip for the no-op case.
export async function straightenImageFile(file: File, degrees: number): Promise<File> {
  const angle = clampStraightenAngle(degrees);
  if (angle === 0) return file;

  const img = await loadImage(file);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const { width: outW, height: outH } = inscribedRectAfterRotation(W, H, angle);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Translate to the center of the output canvas, rotate, then draw the
  // image centered on the origin. Since the output canvas is the inscribed
  // rectangle, the corners of the rotated image are off-canvas (clipped) —
  // which is exactly what we want.
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((angle * Math.PI) / 180);
  ctx.drawImage(img, -W / 2, -H / 2);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
      STRAIGHTENED_QUALITY,
    );
  });

  const stem = file.name.replace(/\.[^.]+$/, '') || 'straightened';
  return new File([blob], `${stem}.png`, { type: 'image/png' });
}
