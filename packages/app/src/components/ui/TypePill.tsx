export function typeColor(type: string): string {
  return `var(--color-type-${type.toLowerCase()}, var(--color-faint))`;
}

interface TypePillProps {
  type: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const SIZE = { xs: 'px-1.5 py-0.5 text-[10px] min-w-[3.4rem]', sm: 'px-2 py-1 text-xs min-w-[4.2rem]', md: 'px-3 py-1 text-sm min-w-[5rem]' };

/** Standard type badge: pill, uppercase, bold white with a dark shadow on the type color. */
export function TypePill({ type, size = 'sm', className = '' }: TypePillProps) {
  return (
    <span className={`type-pill inline-flex justify-center ${SIZE[size]} ${className}`} style={{ background: typeColor(type) }}>
      {type}
    </span>
  );
}

export function TypePills({ types, size = 'sm' }: { types: readonly string[]; size?: 'xs' | 'sm' | 'md' }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {types.map((t) => <TypePill key={t} type={t} size={size} />)}
    </span>
  );
}
