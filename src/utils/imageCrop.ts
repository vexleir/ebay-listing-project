// IMG-001 — in-browser crop. The math (rect clamping, default-rect
// computation, image↔display coordinate conversion) is pure so the modal
// can use it without re-implementing geometry in render code, and tests
// can lock in the boundary cases without a canvas mock.

export interface CropRect {
  x: number;       // top-left x in image-pixel coordinates
  y: number;       // top-left y in image-pixel coordinates
  width: number;
  height: number;
}

export const MIN_CROP_SIZE = 16; // px in image coords

// Returns a centered, 80%-of-image crop rectangle. Useful as the initial
// state when the modal first opens.
export function defaultCropRect(imageWidth: number, imageHeight: number): CropRect {
  const w = Math.max(MIN_CROP_SIZE, Math.round(imageWidth * 0.8));
  const h = Math.max(MIN_CROP_SIZE, Math.round(imageHeight * 0.8));
  return {
    x: Math.round((imageWidth - w) / 2),
    y: Math.round((imageHeight - h) / 2),
    width: w,
    height: h,
  };
}

// Returns a centered crop rectangle that conforms to `ratio` (width / height)
// and is sized to fit inside the image at the given coverage fraction.
// Useful for the 1:1 / 4:3 / 16:9 preset buttons.
export function aspectRatioCropRect(
  imageWidth: number,
  imageHeight: number,
  ratio: number,
  coverage: number = 0.9,
): CropRect {
  if (!Number.isFinite(ratio) || ratio <= 0) return defaultCropRect(imageWidth, imageHeight);
  // Try the height-driven sizing first; if it'd overflow the width budget,
  // fall back to width-driven.
  const targetW = imageWidth * coverage;
  const targetH = imageHeight * coverage;
  let width: number;
  let height: number;
  if (targetW / ratio <= targetH) {
    width = targetW;
    height = targetW / ratio;
  } else {
    height = targetH;
    width = targetH * ratio;
  }
  width = Math.max(MIN_CROP_SIZE, Math.round(width));
  height = Math.max(MIN_CROP_SIZE, Math.round(height));
  return {
    x: Math.round((imageWidth - width) / 2),
    y: Math.round((imageHeight - height) / 2),
    width,
    height,
  };
}

// Clamps a rect to fit inside the image and enforces the minimum size.
// `x` and `y` may shrink if the proposed rect runs off the edge — the
// caller can use this to safely apply mouse-drag deltas without first
// guarding every operation.
export function clampCropRect(rect: CropRect, imageWidth: number, imageHeight: number): CropRect {
  const width = Math.max(MIN_CROP_SIZE, Math.min(rect.width, imageWidth));
  const height = Math.max(MIN_CROP_SIZE, Math.min(rect.height, imageHeight));
  const x = Math.max(0, Math.min(rect.x, imageWidth - width));
  const y = Math.max(0, Math.min(rect.y, imageHeight - height));
  return { x, y, width, height };
}

// Translates a rect by (dx, dy), keeping it inside the image. Useful when
// the user drags the rectangle around the canvas.
export function moveCropRect(rect: CropRect, dx: number, dy: number, imageWidth: number, imageHeight: number): CropRect {
  return clampCropRect({ x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height }, imageWidth, imageHeight);
}

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

// Resizes by dragging one of the four corners. The opposite corner stays
// anchored. Clamping happens at the corner level so the moved edge bumps
// against the image bounds without shifting the anchored edge.
export function resizeCropRect(
  rect: CropRect,
  corner: ResizeCorner,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): CropRect {
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;

  // Apply the corner drag.
  if (corner === 'nw') { left += dx; top += dy; }
  else if (corner === 'ne') { right += dx; top += dy; }
  else if (corner === 'sw') { left += dx; bottom += dy; }
  else { right += dx; bottom += dy; }

  // Clamp each edge to the image bounds.
  left = Math.max(0, Math.min(left, imageWidth));
  top = Math.max(0, Math.min(top, imageHeight));
  right = Math.max(0, Math.min(right, imageWidth));
  bottom = Math.max(0, Math.min(bottom, imageHeight));

  // Enforce MIN_CROP_SIZE on whichever edge was moved.
  const movedLeft = corner === 'nw' || corner === 'sw';
  const movedTop = corner === 'nw' || corner === 'ne';
  if (right - left < MIN_CROP_SIZE) {
    if (movedLeft) left = right - MIN_CROP_SIZE;
    else right = left + MIN_CROP_SIZE;
  }
  if (bottom - top < MIN_CROP_SIZE) {
    if (movedTop) top = bottom - MIN_CROP_SIZE;
    else bottom = top + MIN_CROP_SIZE;
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Loads a File into an HTMLImageElement via an object URL (revoked on decode).
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

const CROPPED_QUALITY = 0.92;

// Crops `file` to `rect` (image-pixel coords) and resolves to a new PNG File.
// Throws if the canvas 2D context is unavailable.
export async function cropImageFile(file: File, rect: CropRect): Promise<File> {
  const img = await loadImage(file);
  const clamped = clampCropRect(rect, img.naturalWidth, img.naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = clamped.width;
  canvas.height = clamped.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(
    img,
    clamped.x, clamped.y, clamped.width, clamped.height,  // source rect
    0, 0, clamped.width, clamped.height,                  // dest rect (full canvas)
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
      CROPPED_QUALITY,
    );
  });

  const stem = file.name.replace(/\.[^.]+$/, '') || 'cropped';
  return new File([blob], `${stem}.png`, { type: 'image/png' });
}
