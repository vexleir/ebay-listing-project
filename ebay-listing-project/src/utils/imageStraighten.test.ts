import { describe, it, expect } from 'vitest';
import {
  inscribedRectAfterRotation,
  clampStraightenAngle,
  STRAIGHTEN_LIMIT_DEG,
} from './imageStraighten';

describe('inscribedRectAfterRotation', () => {
  it('returns the original dimensions for a 0° angle', () => {
    expect(inscribedRectAfterRotation(800, 600, 0)).toEqual({ width: 800, height: 600 });
  });

  it('returns the original dimensions for a non-finite angle', () => {
    expect(inscribedRectAfterRotation(800, 600, NaN)).toEqual({ width: 800, height: 600 });
    expect(inscribedRectAfterRotation(800, 600, Infinity)).toEqual({ width: 800, height: 600 });
  });

  it('shrinks symmetrically for a small positive angle', () => {
    const r5 = inscribedRectAfterRotation(800, 600, 5);
    // Should shrink slightly. Both new dims smaller than originals, ratio preserved.
    expect(r5.width).toBeLessThan(800);
    expect(r5.height).toBeLessThan(600);
    expect(r5.width / r5.height).toBeCloseTo(800 / 600, 1);
  });

  it('treats negative and positive angles symmetrically', () => {
    const pos = inscribedRectAfterRotation(800, 600, 5);
    const neg = inscribedRectAfterRotation(800, 600, -5);
    expect(pos).toEqual(neg);
  });

  it('caps at the original dimensions even with rounding noise', () => {
    const r = inscribedRectAfterRotation(800, 600, 0.001);
    expect(r.width).toBeLessThanOrEqual(800);
    expect(r.height).toBeLessThanOrEqual(600);
  });

  it('handles a square image at 45° (classic √2 case)', () => {
    // For a 1000x1000 image at 45°, the largest inscribed square has side
    // 1000/√2 ≈ 707.
    const r = inscribedRectAfterRotation(1000, 1000, 45);
    expect(r.width).toBe(r.height); // square stays square
    expect(r.width).toBeGreaterThanOrEqual(706);
    expect(r.width).toBeLessThanOrEqual(708);
  });

  it('returns integer-rounded dimensions ≥ 1', () => {
    const r = inscribedRectAfterRotation(50, 30, 12);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
    expect(r.width).toBeGreaterThanOrEqual(1);
    expect(r.height).toBeGreaterThanOrEqual(1);
  });
});

describe('clampStraightenAngle', () => {
  it('passes through angles inside the limit window', () => {
    expect(clampStraightenAngle(0)).toBe(0);
    expect(clampStraightenAngle(5)).toBe(5);
    expect(clampStraightenAngle(-5)).toBe(-5);
    expect(clampStraightenAngle(STRAIGHTEN_LIMIT_DEG)).toBe(STRAIGHTEN_LIMIT_DEG);
    expect(clampStraightenAngle(-STRAIGHTEN_LIMIT_DEG)).toBe(-STRAIGHTEN_LIMIT_DEG);
  });

  it('clamps to the limit when out of range', () => {
    expect(clampStraightenAngle(45)).toBe(STRAIGHTEN_LIMIT_DEG);
    expect(clampStraightenAngle(-90)).toBe(-STRAIGHTEN_LIMIT_DEG);
  });

  it('returns 0 for non-finite input', () => {
    expect(clampStraightenAngle(NaN)).toBe(0);
    expect(clampStraightenAngle(Infinity)).toBe(0);
    expect(clampStraightenAngle(-Infinity)).toBe(0);
  });
});
