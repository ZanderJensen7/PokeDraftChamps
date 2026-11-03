// The editor's stats panel: base stats, EV sliders and the calculated Level 100 stat per row, the nature's +/- marked,
// the EV total and what is left, and where the Speed stat lands against the league's other teams.
import { useMemo, type ReactNode } from 'react';
import type { SpeciesId, StatName, StatsTable } from '@pdc/engine';
import { calcStats, natureMultipliers, speedStanding } from '@pdc/engine';
import { EV_STAT_CAP, EV_TOTAL_CAP, STAT_LABEL, STAT_NAMES } from '../game/sets';

interface TeamStatsProps {
  base: StatsTable;
  evs: StatsTable;
  ivs: StatsTable;
  nature: string;
  /** Opposing species to rank the Speed stat against. */
  opponents: SpeciesId[];
  presets?: ReactNode;
  onEv: (stat: StatName, value: number) => void;
}

export function TeamStats({ base, evs, ivs, nature, opponents, presets, onEv }: TeamStatsProps) {
  const total = STAT_NAMES.reduce((s, k) => s + (evs[k] ?? 0), 0);
  const stats = useMemo(() => calcStats(base, { evs, ivs, nature }), [base, evs, ivs, nature]);
  const mult = natureMultipliers(nature);
  const standing = useMemo(() => speedStanding(stats.spe, opponents), [stats.spe, opponents]);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-bold uppercase tracking-wide text-muted">Stats (Lv100)</span>
        <span className={`font-display font-bold tabular-nums ${total > EV_TOTAL_CAP ? 'text-loss' : 'text-poke-yellow'}`}>
          {total} / {EV_TOTAL_CAP} <span className="text-sm font-semibold text-muted">({EV_TOTAL_CAP - total} left)</span>
        </span>
      </div>
      {presets && <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="EV presets">{presets}</div>}
      <div className="grid grid-cols-[2.6rem_2rem_minmax(0,1fr)_2.2rem_3rem] items-center gap-x-2 gap-y-1">
        <span />
        <span className="text-right text-[10px] font-bold uppercase text-faint">Base</span>
        <span className="text-[10px] font-bold uppercase text-faint">EVs</span>
        <span />
        <span className="text-right text-[10px] font-bold uppercase text-faint">Stat</span>
        {STAT_NAMES.map((k) => {
          const up = mult[k] > 1;
          const down = mult[k] < 1;
          const tone = up ? 'text-win' : down ? 'text-loss' : '';
          return (
            <div key={k} className="contents">
              <span className={`text-sm font-bold ${tone}`}>{STAT_LABEL[k]}{up && <span aria-label="raised by nature"> ▲</span>}{down && <span aria-label="lowered by nature"> ▼</span>}</span>
              <span className="text-right text-sm tabular-nums text-muted">{base[k]}</span>
              <input
                type="range"
                min={0}
                max={EV_STAT_CAP}
                step={4}
                value={evs[k] ?? 0}
                onChange={(e) => onEv(k, Number(e.target.value))}
                className="min-w-0"
                aria-label={`${STAT_LABEL[k]} EVs`}
              />
              <span className="text-right text-sm font-semibold tabular-nums">{evs[k] ?? 0}</span>
              <span className={`text-right font-display text-lg font-bold tabular-nums ${tone}`} aria-label={`${STAT_LABEL[k]} stat ${stats[k]}`}>
                {stats[k]}
                {(ivs[k] ?? 31) !== 31 && <sub className="ml-0.5 text-[10px] font-semibold text-muted" title="Individual value">{ivs[k]}iv</sub>}
              </span>
            </div>
          );
        })}
      </div>
      {standing.total > 0 && (
        <p className="mt-2 text-xs text-muted">
          Speed {stats.spe} outspeeds <span className="font-bold text-ink">{standing.beatsMax}</span> of {standing.total} opposing Pokemon even at their
          fastest, <span className="font-bold text-ink">{standing.beats252}</span> at 252 EVs with a neutral nature and{' '}
          <span className="font-bold text-ink">{standing.beats0}</span> with no Speed EVs (no Scarf or boosts counted).
        </p>
      )}
    </div>
  );
}
