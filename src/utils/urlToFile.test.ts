import { describe, it, expect } from 'vitest';
import { deriveFileName } from './urlToFile';

describe('deriveFileName', () => {
  it('extracts the last path segment from a normal URL', () => {
    expect(deriveFileName('https://i.ebayimg.com/images/g/X/s-l1600.jpg')).toBe('s-l1600.jpg');
  });

  it('strips query strings before extracting the name', () => {
    expect(deriveFileName('https://res.cloudinary.com/x/photo.jpg?v=1234')).toBe('photo.jpg');
  });

  it('strips fragment identifiers', () => {
    expect(deriveFileName('https://example.com/x/y/z.png#main')).toBe('z.png');
  });

  it('returns empty string for data: URIs', () => {
    expect(deriveFileName('data:image/png;base64,iVBORw0KGgo=')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(deriveFileName('')).toBe('');
  });

  it('handles URLs that end with a slash', () => {
    expect(deriveFileName('https://example.com/path/')).toBe('');
  });
});
