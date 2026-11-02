import type { RunState, StandingRow } from '@pdc/engine';
import { Crest } from './ui';
import { useIsMobile } from '../hooks/useIsMobile';

interface StandingsTableProps {
  run: RunState;
  rows: StandingRow[];
  /** Draw the playoff cut line under this seed. */
  cutAfter?: number;
  /** Rank before this week, for the delta column. */
  previous?: StandingRow[];
  compact?: boolean;
}

/**
 * League table: rank, crest + team, W-L, diff. Your row highlighted, playoff line drawn.
 * Phones: team tags instead of names, taller rows, and your row stays pinned in view while the table scrolls.
 */
export function StandingsTable({ run, rows, cutAfter, previous, compact: compactProp }: StandingsTableProps) {
  const isMobile = useIsMobile();
  const compact = compactProp || isMobile;
  const prevRank = new Map(previous?.map((r) => [r.coach, r.rank]));
  return (
    <div className="overflow-clip rounded-lg border-2 border-edge-dark">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-panel-inset font-display text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="w-9 px-2 py-1.5 text-left">#</th>
            <th className="px-2 py-1.5 text-left">Team</th>
            <th className="w-14 px-2 py-1.5 text-center">W-L</th>
            <th className="w-12 px-2 py-1.5 text-right">Diff</th>
            {previous && <th className="w-10 px-2 py-1.5 text-right">+/-</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const c = run.coaches.find((x) => x.id === r.coach);
            const you = r.coach === run.humanId;
            const cut = cutAfter !== undefined && i === cutAfter - 1 && i < rows.length - 1;
            const before = prevRank.get(r.coach);
            const delta = before !== undefined ? before - r.rank : 0;
            return (
              <tr
                key={r.coach}
                className={`${you ? 'bg-you-soft font-bold max-md:sticky max-md:top-[var(--topbar-h,3.75rem)] max-md:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-md:z-10 max-md:shadow-[0_0_0_2px_var(--color-you)]' : i % 2 ? 'bg-panel' : 'bg-panel-hi/40'} ${cut ? 'border-b-[3px] border-dashed border-poke-yellow' : 'border-b border-edge-dark'} max-md:h-11`}
              >
                <td className="px-2 py-1 font-display font-bold text-muted">{r.rank}</td>
                <td className="px-2 py-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Crest abbrev={c?.abbrev ?? '?'} size={compact ? 20 : 24} side={you ? 'you' : undefined} />
                    <span className="truncate">{compact ? c?.abbrev : c?.name}</span>
                    {you && <span className="shrink-0 rounded bg-you px-1 text-[10px] font-extrabold uppercase">You</span>}
                  </div>
                </td>
                <td className="px-2 py-1 text-center tabular-nums">{r.wins}-{r.losses}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${r.differential > 0 ? 'text-win' : r.differential < 0 ? 'text-loss' : 'text-muted'}`}>
                  {r.differential > 0 ? `+${r.differential}` : r.differential}
                </td>
                {previous && (
                  <td className={`px-2 py-1 text-right tabular-nums ${delta > 0 ? 'text-win' : delta < 0 ? 'text-loss' : 'text-faint'}`}>
                    {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '–'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {cutAfter !== undefined && (
        <div className="bg-panel-inset px-2 py-1 text-xs font-semibold text-muted">
          <span className="text-poke-yellow">- - -</span> Top {cutAfter} make the playoffs
        </div>
      )}
    </div>
  );
}
