import { describe, it, expect } from 'vitest';
import {
  defaultCropRect,
  clampCropRect,
  moveCropRect,
  resizeCropRect,
  aspectRatioCropRect,
  MIN_CROP_SIZE,
} from './imageCrop';

describe('defaultCropRect', () => {
  it('returns a centered 80% rect for a regular image', () => {
    expect(defaultCropRect(1000, 800)).toEqual({ x: 100, y: 80, width: 800, height: 640 });
  });

  it('enforces the minimum size on very small images', () => {
    const r = defaultCropRect(10, 10);
    expect(r.width).toBe(MIN_CROP_SIZE);
    expect(r.height).toBe(MIN_CROP_SIZE);
  });
});

describe('clampCropRect', () => {
  it('returns the rect unchanged when it already fits', () => {
    const r = { x: 100, y: 100, width: 200, height: 200 };
    expect(clampCropRect(r, 1000, 1000)).toEqual(r);
  });

  it('shrinks width/height to fit', () => {
    expect(clampCropRect({ x: 0, y: 0, width: 5000, height: 5000 }, 1000, 800))
      .toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it('shifts x/y to keep the rect inside the image', () => {
    expect(clampCropRect({ x: 900, y: 900, width: 200, height: 200 }, 1000, 1000))
      .toEqual({ x: 800, y: 800, width: 200, height: 200 });
  });

  it('keeps x/y from going negative', () => {
    expect(clampCropRect({ x: -50, y: -50, width: 200, height: 200 }, 1000, 1000))
      .toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });

  it('enforces MIN_CROP_SIZE on width/height', () => {
    const r = clampCropRect({ x: 0, y: 0, width: 1, height: 1 }, 1000, 1000);
    expect(r.width).toBe(MIN_CROP_SIZE);
    expect(r.height).toBe(MIN_CROP_SIZE);
  });
});

describe('moveCropRect', () => {
  it('translates by (dx, dy) when there is room', () => {
    expect(moveCropRect({ x: 100, y: 100, width: 200, height: 200 }, 50, -20, 1000, 1000))
      .toEqual({ x: 150, y: 80, width: 200, height: 200 });
  });

  it('clamps to the bottom-right when the move would overflow', () => {
    expect(moveCropRect({ x: 700, y: 700, width: 200, height: 200 }, 200, 200, 1000, 1000))
      .toEqual({ x: 800, y: 800, width: 200, height: 200 });
  });

  it('clamps to the top-left when the move would underflow', () => {
    expect(moveCropRect({ x: 50, y: 50, width: 200, height: 200 }, -200, -200, 1000, 1000))
      .toEqual({ x: 0, y: 0, width: 200, height: 200 });
  });
});

describe('resizeCropRect', () => {
  it('expands SE corner outward (size grows, position fixed)', () => {
    expect(resizeCropRect({ x: 100, y: 100, width: 200, height: 200 }, 'se', 50, 30, 1000, 1000))
      .toEqual({ x: 100, y: 100, width: 250, height: 230 });
  });

  it('drags NW corner inward (position moves, size shrinks)', () => {
    expect(resizeCropRect({ x: 100, y: 100, width: 200, height: 200 }, 'nw', 30, 20, 1000, 1000))
      .toEqual({ x: 130, y: 120, width: 170, height: 180 });
  });

  it('drags NE: width grows, position.y moves down, height shrinks', () => {
    expect(resizeCropRect({ x: 100, y: 100, width: 200, height: 200 }, 'ne', 40, 30, 1000, 1000))
      .toEqual({ x: 100, y: 130, width: 240, height: 170 });
  });

  it('drags SW: position.x moves right, width shrinks, height grows', () => {
    expect(resizeCropRect({ x: 100, y: 100, width: 200, height: 200 }, 'sw', 25, 35, 1000, 1000))
      .toEqual({ x: 125, y: 100, width: 175, height: 235 });
  });

  it('clamps so the resize cannot shrink the rect below MIN_CROP_SIZE', () => {
    const r = resizeCropRect({ x: 0, y: 0, width: 100, height: 100 }, 'nw', 200, 200, 1000, 1000);
    expect(r.width).toBe(MIN_CROP_SIZE);
    expect(r.height).toBe(MIN_CROP_SIZE);
  });

  it('clamps so the resize stays inside the image', () => {
    // Try to expand the SE corner past the right edge.
    expect(resizeCropRect({ x: 800, y: 800, width: 200, height: 200 }, 'se', 500, 500, 1000, 1000))
      .toEqual({ x: 800, y: 800, width: 200, height: 200 });
  });
});

describe('aspectRatioCropRect', () => {
  it('1:1 in a square image fills 90% centered', () => {
    expect(aspectRatioCropRect(1000, 1000, 1)).toEqual({ x: 50, y: 50, width: 900, height: 900 });
  });

  it('1:1 in a wide image is constrained by height', () => {
    // 1600x900: height drives → 810x810 centered.
    const r = aspectRatioCropRect(1600, 900, 1);
    expect(r.width).toBe(810);
    expect(r.height).toBe(810);
    expect(r.x).toBe(Math.round((1600 - 810) / 2)); // 395
    expect(r.y).toBe(Math.round((900 - 810) / 2));  // 45
  });

  it('16:9 in a square image is constrained by width', () => {
    // 1000x1000, ratio 16/9 ≈ 1.778: width drives → 900 wide, 900/1.778 ≈ 506
    const r = aspectRatioCropRect(1000, 1000, 16 / 9);
    expect(r.width).toBe(900);
    expect(r.height).toBe(Math.round(900 / (16 / 9))); // 506
    expect(r.x).toBe(50);
  });

  it('4:3 in a 4:3 image fills 90% exactly', () => {
    expect(aspectRatioCropRect(800, 600, 4 / 3)).toEqual({ x: 40, y: 30, width: 720, height: 540 });
  });

  it('accepts a custom coverage', () => {
    expect(aspectRatioCropRect(1000, 1000, 1, 0.5)).toEqual({ x: 250, y: 250, width: 500, height: 500 });
  });

  it('enforces the minimum size on tiny images', () => {
    // 10x10 at 90% coverage = 9, which is below MIN_CROP_SIZE (16).
    const r = aspectRatioCropRect(10, 10, 1);
    expect(r.width).toBe(MIN_CROP_SIZE);
    expect(r.height).toBe(MIN_CROP_SIZE);
  });

  it('falls back to defaultCropRect on a bad ratio', () => {
    expect(aspectRatioCropRect(1000, 800, 0)).toEqual(defaultCropRect(1000, 800));
    expect(aspectRatioCropRect(1000, 800, -1)).toEqual(defaultCropRect(1000, 800));
    expect(aspectRatioCropRect(1000, 800, NaN)).toEqual(defaultCropRect(1000, 800));
  });
});
