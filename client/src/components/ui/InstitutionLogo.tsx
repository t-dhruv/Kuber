import { useState } from 'react';

function getAbbrev(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const meaningful = words.filter(w => !['of', 'and', 'the', 'bank', '&'].includes(w.toLowerCase()));
    if (meaningful.length >= 2) return (meaningful[0][0] + meaningful[1][0]).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return words[0].slice(0, 2).toUpperCase();
}

function hashColor(name: string): string {
  const palette = [
    '#1971c2', '#2f9e44', '#e67700', '#9c36b5',
    '#c2255c', '#0c8599', '#5c7cfa', '#e03131',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}

interface InstitutionLogoProps {
  name: string;
  /** Direct logo URL — skips API fetch (use when already stored on account) */
  logoUrl?: string | null;
  type?: 'bank' | 'merchant';
  size?: number;
  style?: React.CSSProperties;
  /** Shown instead of abbreviation when no logo loads (e.g. category emoji) */
  fallback?: string;
}

export function InstitutionLogo({ name, logoUrl: logoUrlProp, type = 'bank', size = 32, style, fallback }: InstitutionLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const abbrev = getAbbrev(name);
  const bg = hashColor(name);
  const radius = size * 0.25;

  // Build direct image URL — route serves binary, usable as <img src>
  const fetchedUrl = !logoUrlProp && name
    ? `/api/v1/logos/${type}?name=${encodeURIComponent(name)}`
    : null;

  const resolvedUrl = logoUrlProp ?? fetchedUrl;

  const isEmojiIcon = !!fallback && /\p{Emoji_Presentation}/u.test(fallback);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isEmojiIcon ? 'transparent' : bg,
    ...style,
  };

  if (resolvedUrl && !imgFailed) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#fff', border: '1px solid var(--color-border)' }}>
        <img
          src={resolvedUrl}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          style={{ objectFit: 'contain', padding: 3 }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  if (isEmojiIcon) {
    return (
      <div style={containerStyle}>
        <span style={{ fontSize: size * 0.65, lineHeight: 1 }}>{fallback}</span>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <span style={{
        color: '#fff',
        fontSize: fallback ? size * 0.5 : size * 0.34,
        fontWeight: fallback ? 400 : 700,
        letterSpacing: fallback ? 0 : '-0.02em',
        lineHeight: 1,
      }}>
        {fallback ?? abbrev}
      </span>
    </div>
  );
}
