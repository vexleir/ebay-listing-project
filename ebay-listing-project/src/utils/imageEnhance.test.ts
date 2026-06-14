import { describe, it, expect } from 'vitest';
import {
  clampPercent,
  isIdentity,
  cssFilterFor,
  applyEnhancements,
  ENHANCE_LIMIT,
  ENHANCE_IDENTITY,
} from './imageEnhance';

describe('clampPercent', () => {
  it('passes values inside the window unchanged', () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(-50)).toBe(-50);
    expect(clampPercent(ENHANCE_LIMIT)).toBe(ENHANCE_LIMIT);
    expect(clampPercent(-ENHANCE_LIMIT)).toBe(-ENHANCE_LIMIT);
  });

  it('clamps out-of-range values', () => {
    expect(clampPercent(150)).toBe(ENHANCE_LIMIT);
    expect(clampPercent(-200)).toBe(-ENHANCE_LIMIT);
  });

  it('returns 0 for non-finite input', () => {
    expect(clampPercent(NaN)).toBe(0);
    expect(clampPercent(Infinity)).toBe(0);
    expect(clampPercent(-Infinity)).toBe(0);
  });
});

describe('isIdentity', () => {
  it('is true for the documented identity object', () => {
    expect(isIdentity(ENHANCE_IDENTITY)).toBe(true);
  });

  it('is true for an empty object (defaults to 0 for each field)', () => {
    expect(isIdentity({})).toBe(true);
  });

  it('is false when any axis is non-zero', () => {
    expect(isIdentity({ brightness: 1 })).toBe(false);
    expect(isIdentity({ contrast: 1 })).toBe(false);
    expect(isIdentity({ saturation: 1 })).toBe(false);
  });
});

describe('cssFilterFor', () => {
  it('returns "none" at identity', () => {
    expect(cssFilterFor({})).toBe('none');
    expect(cssFilterFor({ brightness: 0, contrast: 0, saturation: 0 })).toBe('none');
  });

  it('maps -100/0/+100 to 0/1/2 linearly', () => {
    expect(cssFilterFor({ brightness: 100 })).toBe('brightness(2) contrast(1) saturate(1)');
    expect(cssFilterFor({ brightness: -100 })).toBe('brightness(0) contrast(1) saturate(1)');
    expect(cssFilterFor({ contrast: 50 })).toBe('brightness(1) contrast(1.5) saturate(1)');
    expect(cssFilterFor({ saturation: -50 })).toBe('brightness(1) contrast(1) saturate(0.5)');
  });

  it('combines all three axes when non-zero', () => {
    expect(cssFilterFor({ brightness: 20, contrast: -20, saturation: 50 }))
      .toBe('brightness(1.2) contrast(0.8) saturate(1.5)');
  });
});

describe('applyEnhancements', () => {
  function makePixel(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
    return new Uint8ClampedArray([r, g, b, a]);
  }

  it('is a no-op at identity', () => {
    const px = makePixel(100, 150, 200);
    applyEnhancements(px, {});
    expect(Array.from(px)).toEqual([100, 150, 200, 255]);
  });

  it('shifts each RGB channel additively at full brightness', () => {
    // brightness +100 → delta = 255 → everything saturates at 255.
    const px = makePixel(10, 20, 30);
    applyEnhancements(px, { brightness: 100 });
    expect(Array.from(px)).toEqual([255, 255, 255, 255]);
  });

  it('shifts negative brightness toward 0', () => {
    const px = makePixel(100, 200, 50);
    applyEnhancements(px, { brightness: -100 });
    expect(Array.from(px)).toEqual([0, 0, 0, 255]);
  });

  it('expands around 128 at positive contrast', () => {
    // contrast +50 → factor 1.5. (200-128)*1.5 + 128 = 236.
    const px = makePixel(200, 200, 200);
    applyEnhancements(px, { contrast: 50 });
    expect(Array.from(px)).toEqual([236, 236, 236, 255]);
  });

  it('compresses around 128 at negative contrast', () => {
    // contrast -100 → factor 0. Every pixel collapses to 128.
    const px = makePixel(0, 128, 255);
    applyEnhancements(px, { contrast: -100 });
    expect(Array.from(px)).toEqual([128, 128, 128, 255]);
  });

  it('converts to grayscale at saturation -100', () => {
    // luma = 0.299*200 + 0.587*100 + 0.114*50 = 59.8 + 58.7 + 5.7 = 124.2
    const px = makePixel(200, 100, 50);
    applyEnhancements(px, { saturation: -100 });
    const expected = Math.round(0.299 * 200 + 0.587 * 100 + 0.114 * 50);
    expect(px[0]).toBe(expected);
    expect(px[1]).toBe(expected);
    expect(px[2]).toBe(expected);
  });

  it('preserves the alpha channel', () => {
    const px = makePixel(100, 100, 100, 200);
    applyEnhancements(px, { brightness: 50, contrast: 50, saturation: 50 });
    expect(px[3]).toBe(200);
  });

  it('does not throw on an empty array', () => {
    const empty = new Uint8ClampedArray(0);
    expect(() => applyEnhancements(empty, { brightness: 50 })).not.toThrow();
  });

  it('processes multiple pixels in a buffer', () => {
    // Two pixels: black and white, both at full brightness +100 → both should saturate.
    const buf = new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    applyEnhancements(buf, { brightness: 100 });
    expect(Array.from(buf)).toEqual([255, 255, 255, 255, 255, 255, 255, 255]);
  });
});
