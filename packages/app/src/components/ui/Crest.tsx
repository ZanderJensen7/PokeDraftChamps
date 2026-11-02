/** Team crest: the 3-letter tag inside a colored shield. Color is stable per tag. */
export function crestColor(abbrev: string): string {
  let h = 0;
  for (let i = 0; i < abbrev.length; i++) h = (h * 31 + abbrev.charCodeAt(i)) >>> 0;
  return `var(--color-crest-${h % 10})`;
}

interface CrestProps {
  abbrev: string;
  size?: number;
  /** Ring color: your side blue, opponent red. */
  side?: 'you' | 'opp';
}

export function Crest({ abbrev, size = 56, side }: CrestProps) {
  const ring = side === 'you' ? 'var(--color-you)' : side === 'opp' ? 'var(--color-opp)' : 'var(--color-edge)';
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 100 115" role="img" aria-label={`${abbrev} crest`} className="shrink-0">
      <path d="M50 4 L94 18 L90 62 C86 88 68 102 50 111 C32 102 14 88 10 62 L6 18 Z" fill={ring} />
      <path d="M50 12 L86 23.5 L83 61 C79.5 83 64 95 50 102.5 C36 95 20.5 83 17 61 L14 23.5 Z" fill={crestColor(abbrev)} />
      <path d="M50 12 L86 23.5 L85 38 L15 38 L14 23.5 Z" fill="var(--color-ink)" opacity="0.14" />
      <text
        x="50" y="68" textAnchor="middle" fontFamily="Fredoka, sans-serif" fontWeight="700"
        fontSize={abbrev.length > 3 ? 22 : 28} fill="var(--color-ink)" stroke="var(--color-edge-dark)" strokeWidth="1.5"
        paintOrder="stroke"
      >
        {abbrev}
      </text>
    </svg>
  );
}
