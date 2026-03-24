import { useState } from 'react';

// ─── Slug mapping ─────────────────────────────────────────────────────────────
// Maps institution name fragments (lowercased) → local SVG slug.
// SVGs live at /logos/bank/{slug}.svg (served from client/public/).

const SLUG_MAP: [string, string][] = [
  // US mega banks
  ['chase', 'chase'],
  ['jpmorgan', 'chase'],
  ['bank of america', 'bofa'],
  ['capital one', 'capital-one'],
  ['citibank', 'citibank'],
  ['citi', 'citibank'],
  ['us bank', 'usbank'],
  ['usbank', 'usbank'],
  ['pnc', 'pnc'],
  ['truist', 'truist'],
  ['regions', 'regions'],
  ['fifth third', '53'],
  ['huntington', 'huntington'],
  ['citizens bank', 'citizens_bank'],
  ['citizens', 'citizensbank'],
  ['ally', 'ally'],
  ['discover', 'discover'],
  ['american express', 'amex'],
  ['amex', 'amex'],
  ['hsbc', 'hsbc'],
  ['goldman sachs', 'goldmansachs'],
  ['marcus', 'goldmansachs'],
  ['charles schwab', 'schwab'],
  ['schwab', 'schwab'],
  ['fidelity', 'fidelity'],
  ['etrade', 'etrade'],
  ['e*trade', 'etrade'],
  ['chime', 'chime'],
  ['keybank', 'keybank'],
  ['key bank', 'keybank'],
  ['usaa', 'usaa'],
  ['robinhood', 'robinhood'],
  ['paypal', 'paypal'],
  // Regional / community
  ['bny mellon', 'bny'],
  ['bny', 'bny'],
  ['dime', 'dime'],
  ['emigrant', 'emigrant'],
  ['axos', 'axosbank'],
  ['first horizon', 'firsthorizon'],
  ['first citizens', 'firstcitizensbank'],
  ['first community', 'firstcommunitybank'],
  ['heartland', 'heartland'],
  ['columbia bank', 'columbiabankonline'],
  ['columbia', 'columbia'],
  ['community bank', 'communitybank'],
  ['enterprise bank', 'enterprisebanking'],
  ['atlantic union', 'atlanticunionbank'],
  ['eastern bank', 'easternbank'],
  ['brookline', 'brooklinebank'],
  ['cross river', 'crossriver'],
  ['cross-river', 'crossriver'],
  ['fulton', 'fultonbank'],
  ['cadence', 'cadencebank'],
  ['hancock', 'hancockwhitney'],
  // International
  ['anz', 'anz'],
  ['cathay', 'cathaybank'],
  ['east west', 'eastwestbank'],
  ['east-west', 'eastwestbank'],
  ['icici', 'icicibankusa'],
  ['canara', 'canarabank'],
  ['baroda', 'bankofbaroda-usa'],
  ['bnp paribas', 'bnpparibasfortis'],
  ['credit suisse', 'credit-suisse'],
  ['handelsbanken', 'handelsbanken'],
  ['dnb', 'dnb'],
  ['bundesbank', 'bundesbank'],
  // Government / GSEs
  ['fannie mae', 'fanniemae'],
  ['freddie mac', 'freddiemac'],
  ['federal reserve', 'federalreserve'],
  ['fdic', 'fdic'],
  ['imf', 'imf'],
];

function getSlug(institutionName: string): string | null {
  const lower = institutionName.toLowerCase();
  for (const [key, slug] of SLUG_MAP) {
    if (lower.includes(key)) return slug;
  }
  return null;
}

// ─── Abbreviation fallback ────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

interface InstitutionLogoProps {
  name: string;
  /** Explicit logo slug override — skips auto-detection */
  logoSlug?: string;
  size?: number;
  style?: React.CSSProperties;
}

export function InstitutionLogo({ name, logoSlug, size = 32, style }: InstitutionLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);
  // Reset failed state when slug changes
  const slug = logoSlug ?? getSlug(name);
  const abbrev = getAbbrev(name);
  const bg = hashColor(name);
  const radius = size * 0.25;

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: bg,
    ...style,
  };

  if (slug && !imgFailed) {
    return (
      <div style={{ ...containerStyle, backgroundColor: '#fff', border: '1px solid var(--color-border)' }}>
        <img
          src={`/logos/bank/${slug}.svg`}
          alt={name}
          width={size}
          height={size}
          style={{ objectFit: 'contain', padding: 3 }}
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <span style={{
        color: '#fff',
        fontSize: size * 0.34,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        {abbrev}
      </span>
    </div>
  );
}
