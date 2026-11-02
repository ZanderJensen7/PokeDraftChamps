interface HpBarProps {
  value: number;
  max: number;
  label?: string;
  /** Show "value/max" under the bar. */
  showNumbers?: boolean;
  className?: string;
}

export function hpColor(frac: number): string {
  if (frac > 0.5) return 'var(--color-hp-green)';
  if (frac >= 0.2) return 'var(--color-hp-yellow)';
  return 'var(--color-hp-red)';
}

/** Game-style HP bar: "HP" tag on the left, green > 50%, yellow 20-50%, red < 20%. Drains over 400 ms. */
export function HpBar({ value, max, label = 'HP', showNumbers, className = '' }: HpBarProps) {
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={className}>
      <div className="flex items-center gap-1 rounded-full bg-hp-track p-[3px] pr-1">
        <span className="pixel rounded-full bg-cream-ink px-1.5 py-[3px] text-[9px] leading-none text-poke-yellow">{label}</span>
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-edge-dark">
          <div
            className="h-full rounded-full transition-[width] duration-[400ms] ease-out"
            style={{ width: `${frac * 100}%`, background: hpColor(frac) }}
          />
        </div>
      </div>
      {showNumbers && <div className="mt-0.5 text-right text-xs font-bold text-muted">{value}/{max}</div>}
    </div>
  );
}
