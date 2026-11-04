import { Icons } from '@pkmn/img';
import type { CSSProperties } from 'react';

/** Small box icon (sprite-sheet background) for lists, rosters, the draft board. */
export function PokeIcon({ name, title, faded, className = '' }: { name: string; title?: string; faded?: boolean; className?: string }) {
  const icon = Icons.getPokemon(name);
  return (
    <span
      role="img"
      aria-label={title ?? name}
      title={title ?? name}
      className={`shrink-0 ${faded ? 'opacity-35 grayscale' : ''} ${className}`}
      style={icon.css as CSSProperties}
    />
  );
}

export function ItemIcon({ name }: { name: string }) {
  if (!name) return null;
  const icon = Icons.getItem(name);
  return <span role="img" aria-label={name} title={name} className="shrink-0" style={icon.css as CSSProperties} />;
}

/** Roster roles worth a marker: Tera captain, Z captain, Mega pick. */
export type MonRole = 'tera' | 'z' | 'mega';

const ROLE_STYLE: Record<MonRole, { short: string; long: string; cls: string; title: string }> = {
  tera: { short: 'T', long: 'TERA', cls: 'bg-poke-yellow text-cream-ink', title: 'Tera captain' },
  z: { short: 'Z', long: 'Z', cls: 'bg-type-stellar text-cream-ink', title: 'Z captain' },
  mega: { short: 'M', long: 'MEGA', cls: 'bg-crest-3 text-ink', title: 'Mega Evolution' },
};

/** A small role pill (TERA / Z / MEGA) for cards, lists and headers. */
export function RoleTag({ role, compact }: { role: MonRole; compact?: boolean }) {
  const r = ROLE_STYLE[role];
  return (
    <span
      title={r.title}
      className={`inline-flex h-5 items-center justify-center rounded-full border border-cream-ink px-1.5 font-display text-[11px] font-extrabold leading-none tracking-wide ${r.cls}`}
    >
      {compact ? r.short : r.long}
    </span>
  );
}

/** The NEW pill: a species a scouting pack unlocked that you have not drafted yet. */
export function NewTag() {
  return (
    <span
      title="New: unlocked by a scouting pack, not drafted yet"
      className="inline-flex h-5 items-center justify-center rounded-full border border-cream-ink bg-poke-red px-1.5 font-display text-[11px] font-extrabold leading-none tracking-wide text-ink"
    >
      NEW
    </span>
  );
}

/** Every role pill for a mon, in a fixed order. */
export function RoleTags({ roles, compact }: { roles: readonly MonRole[]; compact?: boolean }) {
  if (roles.length === 0) return null;
  return (
    <span className="inline-flex gap-1">
      {(['mega', 'tera', 'z'] as const).filter((r) => roles.includes(r)).map((r) => <RoleTag key={r} role={r} compact={compact} />)}
    </span>
  );
}

interface IconBadgeProps {
  name: string;
  /** Small corner marker, e.g. "T" for a Tera captain. */
  badge?: string;
  /** Role markers (Tera / Z / Mega), drawn as stacked corner dots. */
  roles?: readonly MonRole[];
  faded?: boolean;
  tone?: 'you' | 'opp' | 'neutral';
}

/** A Pokemon box icon in a little rounded tile, with optional corner badges. */
export function IconBadge({ name, badge, roles = [], faded, tone = 'neutral' }: IconBadgeProps) {
  const toneCls = tone === 'you' ? 'border-you bg-you-soft' : tone === 'opp' ? 'border-opp bg-opp-soft' : 'border-edge bg-panel-inset';
  const marks = (['mega', 'tera', 'z'] as const).filter((r) => roles.includes(r));
  return (
    <span className={`relative inline-flex h-9 w-11 items-center justify-center rounded-lg border-2 ${toneCls}`}>
      <PokeIcon name={name} faded={faded} />
      {badge && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-cream-ink bg-poke-yellow px-0.5 text-[10px] font-extrabold leading-none text-cream-ink">
          {badge}
        </span>
      )}
      {!badge && marks.length > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex gap-px">
          {marks.map((r) => (
            <span
              key={r}
              title={ROLE_STYLE[r].title}
              className={`flex h-4 min-w-4 items-center justify-center rounded-full border border-cream-ink px-0.5 text-[10px] font-extrabold leading-none ${ROLE_STYLE[r].cls}`}
            >
              {ROLE_STYLE[r].short}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
