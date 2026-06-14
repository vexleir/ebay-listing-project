import { describe, it, expect } from 'vitest';
import { rotatedDimensions, rotatedFileName } from './imageRotate';

describe('rotatedDimensions', () => {
  it('swaps width and height at 90°', () => {
    expect(rotatedDimensions(400, 300, 90)).toEqual({ width: 300, height: 400 });
  });

  it('keeps dimensions at 0° and 180°', () => {
    expect(rotatedDimensions(400, 300, 0)).toEqual({ width: 400, height: 300 });
    expect(rotatedDimensions(400, 300, 180)).toEqual({ width: 400, height: 300 });
  });

  it('swaps dimensions at 270°', () => {
    expect(rotatedDimensions(400, 300, 270)).toEqual({ width: 300, height: 400 });
  });

  it('normalizes negative and >360 inputs', () => {
    expect(rotatedDimensions(400, 300, -90)).toEqual({ width: 300, height: 400 }); // -90 → 270
    expect(rotatedDimensions(400, 300, 450)).toEqual({ width: 300, height: 400 }); // 450 → 90
    expect(rotatedDimensions(400, 300, 720)).toEqual({ width: 400, height: 300 }); // 720 → 0
  });
});

describe('rotatedFileName', () => {
  it('replaces the extension with .png', () => {
    expect(rotatedFileName('photo.jpg')).toBe('photo.png');
    expect(rotatedFileName('IMG_1234.heic')).toBe('IMG_1234.png');
  });

  it('keeps the stem when there is no extension', () => {
    expect(rotatedFileName('noext')).toBe('noext.png');
  });

  it('handles multi-dot names by trimming only the last extension', () => {
    expect(rotatedFileName('archive.tar.gz')).toBe('archive.tar.png');
  });

  it('falls back to "rotated.png" for empty / undefined input', () => {
    expect(rotatedFileName('')).toBe('rotated.png');
    expect(rotatedFileName(undefined)).toBe('rotated.png');
  });
});
