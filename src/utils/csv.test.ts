import { describe, it, expect, vi } from 'vitest';
import { escapeCsvCell, buildCsv } from './csv';

describe('escapeCsvCell', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('passes plain values through unchanged', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(false)).toBe('false');
  });

  it('quotes values containing commas, quotes, CR, or LF', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('hello\nworld')).toBe('"hello\nworld"');
    expect(escapeCsvCell('with\rCR')).toBe('"with\rCR"');
  });

  it('doubles up embedded double-quotes', () => {
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('quotes values with leading or trailing whitespace', () => {
    expect(escapeCsvCell(' leading')).toBe('" leading"');
    expect(escapeCsvCell('trailing ')).toBe('"trailing "');
  });
});

describe('buildCsv', () => {
  it('joins headers and rows with CRLF line endings', () => {
    const csv = buildCsv(['a', 'b'], [[1, 2], [3, 4]]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('escapes header and cell values', () => {
    const csv = buildCsv(['name', 'note,with,commas'], [
      ['Alice', 'has "quotes"'],
      ['Bob', 'plain'],
    ]);
    expect(csv).toContain('name,"note,with,commas"');
    expect(csv).toContain('Alice,"has ""quotes"""');
    expect(csv).toContain('Bob,plain');
  });

  it('produces just a header row when rows is empty', () => {
    expect(buildCsv(['a', 'b'], [])).toBe('a,b');
  });
});

describe('downloadCsv', () => {
  it('prepends a BOM and triggers an anchor click', async () => {
    // happy-dom provides URL.createObjectURL but not always with a stable
    // mock — stub it so we can assert without depending on the impl.
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

    const { downloadCsv } = await import('./csv');
    const clicks: HTMLAnchorElement[] = [];
    const originalAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node: Node) => {
      if (node instanceof HTMLAnchorElement) {
        clicks.push(node);
        // Stub click so happy-dom doesn't try to navigate.
        node.click = vi.fn();
      }
      return originalAppend(node);
    });

    downloadCsv('test.csv', 'a,b\r\n1,2');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURL.mock.calls[0][0];
    // The BOM-prefixed payload should serialize to a Blob whose first
    // three bytes are EF BB BF (UTF-8 BOM).
    const buf = new Uint8Array(await blobArg.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    expect(clicks.length).toBe(1);
    expect(clicks[0].download).toBe('test.csv');
  });
});
