import type { StatName, StatsTable } from '@pdc/engine';

const LABEL: Record<StatName, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const ORDER: StatName[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function statColor(v: number): string {
  if (v < 60) return 'var(--color-hp-red)';
  if (v < 90) return 'var(--color-hp-yellow)';
  if (v < 120) return 'var(--color-hp-green)';
  return 'var(--color-type-water)';
}

interface StatBarProps {
  label: string;
  value: number;
  max?: number;
  compact?: boolean;
}

/** One base-stat row: label, number, bar scaled to `max`. */
export function StatBar({ label, value, max = 200, compact }: StatBarProps) {
  const w = Math.min(100, (value / max) * 100);
  return (
    <div className={`grid grid-cols-[2.2rem_2rem_1fr] items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="font-bold text-muted">{label}</span>
      <span className="text-right font-bold tabular-nums">{value}</span>
      <div className={`${compact ? 'h-1.5' : 'h-2'} overflow-hidden rounded-full bg-edge-dark`}>
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: statColor(value) }} />
      </div>
    </div>
  );
}

export function StatBlock({ stats, compact }: { stats: StatsTable; compact?: boolean }) {
  const total = ORDER.reduce((s, k) => s + stats[k], 0);
  return (
    <div className="space-y-0.5">
      {ORDER.map((k) => <StatBar key={k} label={LABEL[k]} value={stats[k]} compact={compact} />)}
      <div className={`flex justify-between pt-0.5 font-bold text-muted ${compact ? 'text-xs' : 'text-sm'}`}>
        <span>BST</span>
        <span className="tabular-nums text-ink">{total}</span>
      </div>
    </div>
  );
}
