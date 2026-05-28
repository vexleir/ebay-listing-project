// IMG-002 (lite) — perceptual hash (aHash) for duplicate-photo detection.
//
// Algorithm:
//   1. Draw the image into an 8×8 canvas (downscaled).
//   2. Read RGBA, convert each pixel to luma (grayscale).
//   3. Compute the average luma across all 64 pixels.
//   4. Build a 64-bit hash where bit_i = (pixel_i > avg ? 1 : 0).
//   5. Encode as a 16-char hex string.
//
// Two images are "likely duplicates" when the Hamming distance between
// their hashes is below a small threshold (defaults to 5 bits, which
// allows minor resaves / crops / brightness shifts but flags true
// duplicates with high confidence).
//
// Pure helpers (`hammingDistance`, `isLikelyDuplicate`, `findDuplicateGroups`)
// are unit-tested without a canvas dependency. The canvas path is exercised
// at runtime via the BulkUploader.

const HASH_SIZE = 8; // 8x8 = 64 bits.
const DEFAULT_THRESHOLD = 5;

// Hamming distance between two equal-length lowercase hex strings.
// Returns the number of differing bits.
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) {
    throw new Error(`Hash length mismatch: ${a.length} vs ${b.length}`);
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = parseInt(a[i], 16);
    const xb = parseInt(b[i], 16);
    if (Number.isNaN(xa) || Number.isNaN(xb)) {
      throw new Error('Hash contains non-hex characters');
    }
    let xor = xa ^ xb;
    // Count set bits in the (≤4-bit) XOR.
    while (xor) { dist += xor & 1; xor >>= 1; }
  }
  return dist;
}

export function isLikelyDuplicate(a: string, b: string, threshold: number = DEFAULT_THRESHOLD): boolean {
  return hammingDistance(a, b) <= threshold;
}

// Groups IDs whose hashes are pairwise near-duplicates. Implementation
// is a simple union-find — each entry joins the cluster of the first
// already-seen entry it's near-duplicate of. Returns only clusters of
// size ≥ 2 (single-image "clusters" aren't duplicates).
export function findDuplicateGroups<T extends { id: string; hash: string }>(
  entries: T[],
  threshold: number = DEFAULT_THRESHOLD,
): string[][] {
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    if (parent[x] === x) return x;
    parent[x] = find(parent[x]);
    return parent[x];
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (const e of entries) parent[e.id] = e.id;

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (isLikelyDuplicate(entries[i].hash, entries[j].hash, threshold)) {
        union(entries[i].id, entries[j].id);
      }
    }
  }

  const groups: Record<string, string[]> = {};
  for (const e of entries) {
    const root = find(e.id);
    if (!groups[root]) groups[root] = [];
    groups[root].push(e.id);
  }
  return Object.values(groups).filter((g) => g.length >= 2);
}

// Loads a File into an HTMLImageElement (revokes the blob URL after decode).
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Computes the 64-bit average hash of a File as a 16-char lowercase hex string.
// Throws if the browser can't get a 2D context.
export async function computeAverageHash(file: File): Promise<string> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = HASH_SIZE;
  canvas.height = HASH_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, HASH_SIZE, HASH_SIZE);
  const { data } = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE);

  // Compute luma per pixel using Rec. 601 weights.
  const lumas = new Array<number>(HASH_SIZE * HASH_SIZE);
  let sum = 0;
  for (let i = 0; i < HASH_SIZE * HASH_SIZE; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    lumas[i] = luma;
    sum += luma;
  }
  const avg = sum / lumas.length;

  // Build the bit string (msb-first), then convert to hex 4 bits at a time.
  let hex = '';
  for (let nibble = 0; nibble < 16; nibble++) {
    let v = 0;
    for (let bit = 0; bit < 4; bit++) {
      const idx = nibble * 4 + bit;
      v = (v << 1) | (lumas[idx] > avg ? 1 : 0);
    }
    hex += v.toString(16);
  }
  return hex;
}

// Re-exported as a default so consumers can sample tunable knobs.
export const HASH_HEX_LENGTH = 16;
export const DEFAULT_DUPLICATE_THRESHOLD = DEFAULT_THRESHOLD;
