import { useId } from 'react';
import { badgeOf } from '../../game/badges';

export type BadgeState = 'earned' | 'open' | 'locked';

interface BadgeEmblemProps {
  stake: number;
  size?: number;
  /** earned: won a title here (gold rim, shine). open: unlocked, not won yet. locked: a faint, dashed ghost of it. */
  state: BadgeState;
  className?: string;
}

/** A stake's badge emblem: its shape in its color, an inner facet and a highlight; locked ones are a padlocked ghost of it. */
export function BadgeEmblem({ stake, size = 48, state, className = '' }: BadgeEmblemProps) {
  const { shape, color } = badgeOf(stake);
  const clip = useId();
  const locked = state === 'locked';
  return (
    <svg width={size} height={size} viewBox="-4 -4 108 108" aria-hidden="true" className={`shrink-0 overflow-visible ${className}`}>
      <defs>
        <clipPath id={clip}><path d={shape} /></clipPath>
      </defs>
      <path
        d={shape}
        fill={color}
        fillOpacity={locked ? 0.16 : 1}
        stroke={state === 'earned' ? 'var(--color-poke-yellow)' : locked ? 'var(--color-edge)' : 'var(--color-edge-dark)'}
        strokeWidth={state === 'earned' ? 7 : 5}
        strokeLinejoin="round"
        strokeDasharray={locked ? '7 6' : undefined}
      />
      {!locked && (
        <g clipPath={`url(#${clip})`}>
          {/* Lower half in shadow, an inner facet, then a diagonal shine. */}
          <rect x="0" y="52" width="100" height="50" fill="black" opacity="0.18" />
          <path d={shape} transform="translate(50 50) scale(0.55) translate(-50 -50)" fill="white" opacity="0.22" />
          <path d="M-10 30L30 -10H48L-10 48Z" fill="white" opacity={state === 'earned' ? 0.5 : 0.28} />
        </g>
      )}
      {locked && (
        <g fill="none" stroke="var(--color-faint)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="35" y="47" width="30" height="24" rx="4" fill="var(--color-faint)" stroke="none" />
          <path d="M40 47V40a10 10 0 0 1 20 0v7" />
        </g>
      )}
    </svg>
  );
}
