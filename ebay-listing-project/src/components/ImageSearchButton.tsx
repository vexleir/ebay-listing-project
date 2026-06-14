import { useState } from 'react';
import { Search } from 'lucide-react';

interface ImageSearchButtonProps {
  src: string;
  size?: 'sm' | 'md';
}

/**
 * Overlay button that opens a Google Lens reverse image search for the given image URL.
 * Only shown for publicly accessible HTTPS URLs (Cloudinary etc.); hidden for base64 data.
 */
export default function ImageSearchButton({ src, size = 'md' }: ImageSearchButtonProps) {
  const [hovered, setHovered] = useState(false);

  // Only works for public URLs — base64 can't be used with Lens
  if (!src.startsWith('http')) return null;

  const lensUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(src)}`;
  const dim = size === 'sm' ? 20 : 26;
  const iconSize = size === 'sm' ? 11 : 14;
  const padding = size === 'sm' ? '3px' : '5px';

  return (
    <a
      href={lensUrl}
      target="_blank"
      rel="noreferrer"
      title="Google Image Search"
      onClick={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        bottom: '6px',
        right: '6px',
        width: `${dim}px`,
        height: `${dim}px`,
        padding,
        borderRadius: '50%',
        background: hovered ? 'rgba(255,255,255,0.95)' : 'rgba(0,0,0,0.55)',
        color: hovered ? '#4285F4' : 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s, color 0.15s, opacity 0.15s',
        opacity: hovered ? 1 : 0.75,
        textDecoration: 'none',
        zIndex: 2,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
    >
      <Search size={iconSize} strokeWidth={2.5} />
    </a>
  );
}
