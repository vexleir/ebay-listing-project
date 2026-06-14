// IMG-003 slice 2 — fetches a URL (or `data:` URI) into a File so the
// existing canvas-based rotate / crop / straighten utilities can act on
// images that arrived as URLs from the listing record. Resolves with a
// fresh File ready to be passed to the edit pipeline.
//
// Returns the File with a sensible filename derived from the URL path and
// a Content-Type from the response (falls back to image/png). Throws on
// HTTP failure so the caller can surface a "could not load image" error.

export async function urlToFile(url: string, fallbackName: string = 'image.png'): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load image (${res.status})`);
  const blob = await res.blob();
  const type = blob.type || 'image/png';
  const name = deriveFileName(url) || fallbackName;
  return new File([blob], name, { type });
}

// Pure helper: pull a sensible filename out of a URL or data: URI.
// Returns an empty string when nothing useful can be derived (the caller
// should then use the fallbackName).
export function deriveFileName(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:')) return '';
  // Strip query string + fragment, then take the last path segment.
  const clean = url.split('?')[0].split('#')[0];
  const lastSlash = clean.lastIndexOf('/');
  const candidate = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;
  return candidate || '';
}
