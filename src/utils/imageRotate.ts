// IMG-001 (lite) — in-browser image rotation. Reads a File, paints it
// into a canvas rotated by 90° clockwise (or `degrees` if supplied), and
// returns a new File the caller can swap into its images array.
//
// Output format: PNG. We could detect the source mime and reuse it but
// PNG is the safest universal choice and keeps quality lossless across
// repeated rotations.

const PNG_QUALITY = 0.92;

// Pure helper: the (W, H) of an image after rotating by `degrees` (any
// multiple of 90). Exported for tests so the canvas math is verifiable
// without booting happy-dom's canvas mock.
export function rotatedDimensions(width: number, height: number, degrees: number): { width: number; height: number } {
  const mod = ((degrees % 360) + 360) % 360;
  if (mod === 90 || mod === 270) return { width: height, height: width };
  return { width, height };
}

// Replaces the original extension with `.png` so the rotated file has a
// sensible name. Defaults to "rotated.png" when the source has no name.
export function rotatedFileName(originalName: string | undefined): string {
  if (!originalName) return 'rotated.png';
  const idx = originalName.lastIndexOf('.');
  const stem = idx > 0 ? originalName.slice(0, idx) : originalName;
  return `${stem}.png`;
}

// Loads a File into an HTMLImageElement via an object URL. The URL is
// revoked once the image has decoded so we don't leak blob: handles.
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Rotates `file` by `degrees` (default 90° CW) and resolves to a new File.
// Throws if the browser can't get a 2D context (which would mean the page
// has no Canvas API at all — only happens in some test environments).
export async function rotateImageFile(file: File, degrees: number = 90): Promise<File> {
  const img = await loadImage(file);
  const { width: outW, height: outH } = rotatedDimensions(img.naturalWidth, img.naturalHeight, degrees);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Translate to the center of the output canvas, rotate, then draw the
  // image centered on the origin. This works for any multiple of 90°.
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob returned null'))),
      'image/png',
      PNG_QUALITY,
    );
  });

  return new File([blob], rotatedFileName(file.name), { type: 'image/png' });
}
