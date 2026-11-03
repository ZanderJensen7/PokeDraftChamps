import { Sprites } from '@pkmn/img';
import type { ReactNode } from 'react';
import { useSettings, type SpriteSet } from '../../store/settings';

interface PokeSpriteProps {
  name: string;
  side?: 'p1' | 'p2';
  size?: number;
  className?: string;
}

/**
 * The sprite for a species in the chosen set. Showdown has no 3D model for a few Gen 9 mons (the Future
 * Paradox line, Ogerpon, Origin formes…), and the package then falls back to a still image; prefer the animated
 * pixel sprite when one exists so the mon still moves (front side only: no animated backs exist for them).
 */
export function spriteFor(name: string, spriteSet: SpriteSet, side: 'p1' | 'p2') {
  const s = Sprites.getPokemon(name, { gen: spriteSet, side });
  if (spriteSet === 'ani' && !s.url.includes('/ani')) {
    const pixel = Sprites.getPokemon(name, { gen: 'gen5ani', side });
    if (pixel.url.includes('/gen5ani')) return pixel;
  }
  return s;
}

/** A battle sprite (front by default) from the user's chosen sprite set, pixel-crisp. */
export function PokeSprite({ name, side = 'p2', size = 96, className = '' }: PokeSpriteProps) {
  const spriteSet = useSettings((s) => s.spriteSet);
  const s = spriteFor(name, spriteSet, side);
  return (
    <img
      src={s.url}
      alt={name}
      loading="lazy"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      style={{ imageRendering: s.pixelated ? 'pixelated' : 'auto', width: size, height: size }}
    />
  );
}

interface SpriteCardProps {
  name: string;
  /** Top-right badge content (price). */
  badge?: ReactNode;
  /** Top-left marker (e.g. TERA). */
  marker?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  tone?: 'you' | 'opp' | 'neutral';
  onClick?: () => void;
  children?: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

/** Sprite on a little platform with name + content below. Clickable when onClick is given. */
export function SpriteCard({
  name, badge, marker, selected, disabled, tone = 'neutral', onClick, children, className = '', title, ariaLabel,
}: SpriteCardProps) {
  const toneBorder = selected
    ? 'border-poke-yellow'
    : tone === 'you' ? 'border-you' : tone === 'opp' ? 'border-opp' : 'border-edge';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      title={title}
      aria-label={ariaLabel}
      className={`focus-ring relative flex min-w-0 flex-col items-center rounded-xl border-2 border-b-4 bg-panel p-2 text-left transition-transform duration-150
        ${toneBorder} ${selected ? 'bg-panel-hi' : ''}
        ${onClick && !disabled ? 'cursor-pointer hover:-translate-y-0.5 hover:bg-panel-hi' : ''}
        ${disabled ? 'opacity-45' : ''} ${className}`}
    >
      {badge !== undefined && <span className="absolute right-1.5 top-1.5">{badge}</span>}
      {marker && <span className="absolute left-1.5 top-1.5">{marker}</span>}
      <div className="relative flex h-20 w-full items-end justify-center">
        <span className="absolute bottom-1 h-3 w-16 rounded-[50%] bg-edge-dark/80" />
        <PokeSprite name={name} size={80} className="relative" />
      </div>
      <div className="mt-1 w-full">{children}</div>
    </Tag>
  );
}

export function PriceBadge({ points }: { points: number }) {
  return (
    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-poke-yellow-dark bg-poke-yellow px-1.5 font-display text-sm font-bold text-cream-ink">
      {points}
    </span>
  );
}
