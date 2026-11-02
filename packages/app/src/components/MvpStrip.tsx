import { useMemo } from 'react';
import type { RunState } from '@pdc/engine';
import { runSpeciesStats, topPerformers } from '@pdc/engine';
import { PokeIcon, Panel } from './ui';
import { displayName } from '../game/names';

/** The human team's three best performers of the season, as small cards. */
export function MvpStrip({ run, onOpenAnalytics }: { run: RunState; onOpenAnalytics: () => void }) {
  const top = useMemo(() => topPerformers(runSpeciesStats(run), 3, run.humanId), [run]);
  if (top.length === 0) return null;
  return (
    <Panel
      title="Season MVPs"
      aside={<button type="button" className="focus-ring rounded font-display font-bold text-poke-yellow underline" onClick={onOpenAnalytics}>Full analytics</button>}
    >
      <ul className="grid gap-2 sm:grid-cols-3">
        {top.map((a, i) => (
          <li key={a.species} className="flex items-center gap-3 rounded-lg border-2 border-you bg-you-soft px-3 py-2">
            <span className="font-display text-2xl font-bold text-poke-yellow">{i + 1}</span>
            <PokeIcon name={a.name} />
            <div className="min-w-0">
              <div className="truncate font-display font-bold">{displayName(a.name)}</div>
              <div className="text-sm text-muted">
                <b className="text-ink tabular-nums">{Math.round(a.winRate * 100)}%</b> wins · <b className="text-ink tabular-nums">{a.kos}</b> KOs
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
