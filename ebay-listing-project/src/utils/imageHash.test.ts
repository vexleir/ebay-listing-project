import { describe, it, expect } from 'vitest';
import {
  hammingDistance,
  isLikelyDuplicate,
  findDuplicateGroups,
  HASH_HEX_LENGTH,
  DEFAULT_DUPLICATE_THRESHOLD,
} from './imageHash';

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
  });

  it('counts every differing bit', () => {
    // 0x0 vs 0xf flips 4 bits.
    expect(hammingDistance('0000000000000000', '000000000000000f')).toBe(4);
    // All zeros vs all ones — 64 bits flipped.
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });

  it('handles partial-nibble differences correctly', () => {
    // 0x1 vs 0x2 = 0001 vs 0010 → 2 bits differ.
    expect(hammingDistance('0000000000000001', '0000000000000002')).toBe(2);
    // 0xa vs 0x5 = 1010 vs 0101 → 4 bits differ.
    expect(hammingDistance('a000000000000000', '5000000000000000')).toBe(4);
  });

  it('throws on length mismatch', () => {
    expect(() => hammingDistance('abc', 'abcd')).toThrow(/length mismatch/);
  });

  it('throws on non-hex characters', () => {
    expect(() => hammingDistance('zzzzzzzzzzzzzzzz', '0000000000000000')).toThrow(/non-hex/);
  });
});

describe('isLikelyDuplicate', () => {
  it('respects the default threshold (5 bits)', () => {
    // 5 bits differ — within threshold.
    expect(isLikelyDuplicate('0000000000000000', '000000000000001f')).toBe(true);
    // 6 bits differ — outside threshold.
    expect(isLikelyDuplicate('0000000000000000', '000000000000003f')).toBe(false);
  });

  it('accepts an explicit threshold override', () => {
    expect(isLikelyDuplicate('0000000000000000', 'ffffffffffffffff', 64)).toBe(true);
    expect(isLikelyDuplicate('0000000000000000', 'ffffffffffffffff', 60)).toBe(false);
  });
});

describe('findDuplicateGroups', () => {
  it('returns empty for a single entry', () => {
    expect(findDuplicateGroups([{ id: 'a', hash: 'ffffffffffffffff' }])).toEqual([]);
  });

  it('finds an obvious pair', () => {
    const groups = findDuplicateGroups([
      { id: 'a', hash: 'ffffffffffffffff' },
      { id: 'b', hash: 'ffffffffffffffff' }, // identical
      { id: 'c', hash: '0000000000000000' }, // unrelated
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual(['a', 'b']);
  });

  it('clusters transitively (A~B and B~C → {A,B,C})', () => {
    // hashes: a=0..0, b differs from a by 3 bits, c differs from b by 3 bits,
    // c differs from a by 6 bits (above default threshold) — but transitivity
    // via b should still group all three.
    const groups = findDuplicateGroups([
      { id: 'a', hash: '0000000000000000' },
      { id: 'b', hash: '0000000000000007' },  // 3 bits from a
      { id: 'c', hash: '0000000000000038' },  // 3 bits from b, 6 bits from a
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps separate clusters distinct', () => {
    const groups = findDuplicateGroups([
      { id: 'a', hash: 'ffffffffffffffff' },
      { id: 'b', hash: 'ffffffffffffffff' },
      { id: 'c', hash: '0000000000000000' },
      { id: 'd', hash: '0000000000000000' },
    ]);
    expect(groups).toHaveLength(2);
    const sorted = groups.map((g) => g.sort().join(','));
    expect(sorted.sort()).toEqual(['a,b', 'c,d']);
  });

  it('skips single-image clusters (only returns ≥2 groups)', () => {
    const groups = findDuplicateGroups([
      { id: 'a', hash: 'aaaaaaaaaaaaaaaa' },
      { id: 'b', hash: '5555555555555555' },
      { id: 'c', hash: '5555555555555555' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sort()).toEqual(['b', 'c']);
  });
});

describe('constants', () => {
  it('exposes the hash length and default threshold', () => {
    expect(HASH_HEX_LENGTH).toBe(16);
    expect(DEFAULT_DUPLICATE_THRESHOLD).toBe(5);
  });
});
