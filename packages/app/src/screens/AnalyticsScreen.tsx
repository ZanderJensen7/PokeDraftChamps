import { useMemo, useState } from 'react';
import type { PriceSuggestion, RunState, SpeciesAggregate } from '@pdc/engine';
import { getDraftMon, humanCoach } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { DialogueBox, GameButton, Panel, PokeIcon, PriceBadge, Tabs, TypePills } from '../components/ui';
import { MonDetailButton } from '../components/MonDetail';
import { useMonDetail } from '../store/monDetail';
import { displayName } from '../game/names';
import { useAnalytics } from '../analytics/useAnalytics';
import { useIsMobile } from '../hooks/useIsMobile';

type Scope = 'mine' | 'league';
type SortKey = 'name' | 'games' | 'winRate' | 'koPerGame' | 'damagePerGame' | 'survivalRate' | 'special' | 'score';

const SMALL_SAMPLE = 3;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const scoreColor = (s: number) => (s >= 60 ? 'bg-hp-green' : s <= 40 ? 'bg-hp-red' : 'bg-hp-yellow');

const COLUMNS: { key: SortKey; label: string; title: string; align: 'left' | 'right' | 'center' }[] = [
  { key: 'name', label: 'Pokemon', title: 'Pokemon', align: 'left' },
  { key: 'games', label: 'Games', title: 'Matches it was brought to', align: 'right' },
  { key: 'winRate', label: 'Win %', title: 'Win rate when brought', align: 'right' },
  { key: 'koPerGame', label: 'KOs/g', title: 'Knockouts per game', align: 'right' },
  { key: 'damagePerGame', label: 'Dmg/g', title: 'Damage dealt per game, as a share of one full HP bar', align: 'right' },
  { key: 'survivalRate', label: 'Surv %', title: 'Survival rate (games it did not faint)', align: 'right' },
  { key: 'special', label: 'Gimmick', title: 'How often it Terastallized, Mega Evolved or used a Z-Move', align: 'center' },
  { key: 'score', label: 'Score', title: 'Overall performance score, 0 to 100', align: 'left' },
];

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

function sortValue(a: SpeciesAggregate, key: SortKey): number | string {
  if (key === 'name') return displayName(a.name);
  if (key === 'special') return Math.max(a.teraRate, a.megaRate, a.zRate);
  return a[key];
}

function GimmickBadges({ a }: { a: SpeciesAggregate }) {
  const items = [
    { r: a.teraRate, label: 'TERA', cls: 'bg-poke-yellow text-cream-ink', title: 'Terastallized' },
    { r: a.megaRate, label: 'MEGA', cls: 'bg-crest-3 text-ink', title: 'Mega Evolved' },
    { r: a.zRate, label: 'Z', cls: 'bg-type-stellar text-cream-ink', title: 'Used a Z-Move' },
  ].filter((x) => x.r > 0);
  if (items.length === 0) return <span className="text-faint">–</span>;
  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      {items.map((x) => (
        <span
          key={x.label}
          title={`${x.title} in ${pct(x.r)} of games`}
          className={`inline-flex h-5 items-center whitespace-nowrap rounded-full border border-cream-ink px-1.5 font-display text-[11px] font-extrabold leading-none ${x.cls}`}
        >
          {x.label} {pct(x.r)}
        </span>
      ))}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const s = Math.max(0, Math.min(100, score));
  return (
    <div className="flex items-center gap-2" title={`Score ${Math.round(s)} / 100`}>
      <div className="h-2.5 w-20 overflow-hidden rounded-full bg-hp-track">
        <div className={`h-full rounded-full ${scoreColor(s)}`} style={{ width: `${s}%` }} />
      </div>
      <span className="w-7 text-right font-display text-sm font-bold tabular-nums">{Math.round(s)}</span>
    </div>
  );
}

function SpeciesTable({ rows }: { rows: SpeciesAggregate[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 });
  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      const c = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
      return c * sort.dir || b.score - a.score;
    });
    return out;
  }, [rows, sort]);
  const clickHeader = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }));
  const isMobile = useIsMobile();
  const [open, setOpen] = useState<string | null>(null);

  // Phones: one card per Pokemon (name, price, score); tap to expand the full line. Sorting moves to a select.
  if (isMobile) {
    const stats = (a: SpeciesAggregate) => [
      ['Games', String(a.games)],
      ['Win %', a.games ? pct(a.winRate) : '–'],
      ['KOs/g', a.koPerGame.toFixed(2)],
      ['Dmg/g', `${Math.round(a.damagePerGame)}%`],
      ['Surv %', a.games ? pct(a.survivalRate) : '–'],
    ] as const;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="species-sort" className="text-sm font-bold text-muted">Sort</label>
          <select
            id="species-sort"
            value={sort.key}
            onChange={(e) => { const key = e.target.value as SortKey; setSort({ key, dir: key === 'name' ? 1 : -1 }); }}
            className="field min-h-11 min-w-0 flex-1"
          >
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setSort((s) => ({ ...s, dir: (s.dir * -1) as 1 | -1 }))}
            aria-label={sort.dir === 1 ? 'Ascending, tap for descending' : 'Descending, tap for ascending'}
            className="game-btn btn-secondary min-h-11 min-w-11 px-2"
          >
            {sort.dir === 1 ? '▲' : '▼'}
          </button>
        </div>
        <ul className="space-y-1.5">
          {sorted.map((a) => {
            const mon = getDraftMon(a.species);
            const small = a.games < SMALL_SAMPLE;
            const expanded = open === a.species;
            return (
              <li key={a.species} className={`rounded-lg border-2 border-edge-dark bg-panel-inset ${small ? 'opacity-60' : ''}`}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : a.species)}
                  className="focus-ring flex min-h-14 w-full items-center gap-2 px-2 py-1.5 text-left"
                >
                  <PokeIcon name={a.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{displayName(a.name)}</span>
                      <PriceBadge points={a.price} />
                    </div>
                    <div className="mt-0.5 w-28"><ScoreBar score={a.score} /></div>
                  </div>
                  <span className="text-xs font-bold text-muted tabular-nums">{a.games}g</span>
                  <span className={`text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
                </button>
                {expanded && (
                  <div className="space-y-2 border-t border-edge-dark px-2 py-2">
                    <div className="flex items-center gap-2">
                      {mon && <TypePills types={mon.types} size="xs" />}
                      {small && <span className="text-xs text-muted">small sample</span>}
                      <span className="ml-auto"><GimmickBadges a={a} /></span>
                      <GameButton variant="ghost" size="sm" onClick={() => useMonDetail.getState().open(a.species)} className="min-h-11">Details</GameButton>
                    </div>
                    <dl className="grid grid-cols-5 gap-1 text-center">
                      {stats(a).map(([k, v]) => (
                        <div key={k} className="rounded bg-panel px-1 py-1">
                          <dt className="text-[11px] font-bold uppercase text-muted">{k}</dt>
                          <dd className="font-display font-bold tabular-nums">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border-2 border-edge-dark">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-panel-inset font-display text-xs uppercase tracking-wider text-muted">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  className={`px-2 py-1.5 ${ALIGN[c.align]}`}
                >
                  <button
                    type="button"
                    title={c.title}
                    onClick={() => clickHeader(c.key)}
                    className={`focus-ring rounded px-1 font-display uppercase tracking-wider ${active ? 'text-poke-yellow' : 'hover:text-ink'}`}
                  >
                    {c.label}{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((a, i) => {
            const mon = getDraftMon(a.species);
            const small = a.games < SMALL_SAMPLE;
            return (
              <tr key={a.species} className={`${i % 2 ? 'bg-panel' : 'bg-panel-hi/40'} border-b border-edge-dark ${small ? 'opacity-60' : ''}`}>
                <td className="px-2 py-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <MonDetailButton species={a.species}><PokeIcon name={a.name} /></MonDetailButton>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold">{displayName(a.name)}</span>
                        <PriceBadge points={a.price} />
                      </div>
                      <div className="flex items-center gap-2">
                        {mon && <TypePills types={mon.types} size="xs" />}
                        {small && <span className="text-xs text-muted">small sample</span>}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{a.games}</td>
                <td className="px-2 py-1 text-right tabular-nums">{a.games ? pct(a.winRate) : '–'}</td>
                <td className="px-2 py-1 text-right tabular-nums">{a.koPerGame.toFixed(2)}</td>
                <td className="px-2 py-1 text-right tabular-nums">{Math.round(a.damagePerGame)}%</td>
                <td className="px-2 py-1 text-right tabular-nums">{a.games ? pct(a.survivalRate) : '–'}</td>
                <td className="px-2 py-1 text-center"><GimmickBadges a={a} /></td>
                <td className="px-2 py-1"><ScoreBar score={a.score} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PriceWatch({ suggestions, gamesPlayed }: { suggestions: PriceSuggestion[]; gamesPlayed: number }) {
  const shown = suggestions.filter((s) => s.delta !== 0);
  return (
    <Panel title="Price watch" aside={<span>{shown.length} flagged</span>}>
      <p className="mb-3 text-sm text-muted">Based on this league only; the balance lab uses thousands of games.</p>
      {shown.length === 0 ? (
        <DialogueBox>
          {gamesPlayed === 0
            ? 'No matches have been played yet, so there is nothing to judge.'
            : 'No suggestions yet. A Pokemon needs at least 5 games in this league before its price is questioned, and nobody has drifted far enough from their price to flag.'}
        </DialogueBox>
      ) : (
        <ul className="space-y-1.5">
          {[...shown].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).map((s) => {
            const under = s.delta > 0;
            return (
              <li
                key={s.species}
                className={`flex flex-col gap-1 rounded-lg border-2 bg-panel-inset px-3 py-2 sm:flex-row sm:items-center sm:gap-3 ${under ? 'border-opp' : 'border-win'}`}
              >
                <div className="flex shrink-0 items-center gap-2 sm:w-72">
                  <MonDetailButton species={s.species}><PokeIcon name={s.name} /></MonDetailButton>
                  <span className="min-w-0 flex-1 truncate font-semibold">{displayName(s.name)}</span>
                  <span className="flex shrink-0 items-center gap-1 font-display font-bold">
                    <PriceBadge points={s.price} />
                    <span aria-hidden="true">→</span>
                    <span className="sr-only">to</span>
                    <PriceBadge points={s.suggested} />
                  </span>
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <span className={`mr-2 font-display text-xs font-extrabold uppercase ${under ? 'text-opp' : 'text-win'}`}>
                    {under ? 'Underpriced' : 'Overpriced'}
                  </span>
                  <span className="text-muted">{s.reason}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function scopeRows(aggs: SpeciesAggregate[], run: RunState, scope: Scope): SpeciesAggregate[] {
  if (scope === 'league') return aggs;
  const mine = new Set(humanCoach(run).roster.map((r) => r.species));
  return aggs.filter((a) => mine.has(a.species) || a.coaches.includes(run.humanId));
}

export function AnalyticsScreen() {
  const run = useGame((s) => s.run);
  const go = useGame((s) => s.go);
  const data = useAnalytics(run);
  const [scope, setScope] = useState<Scope>('mine');
  const rows = useMemo(() => (run && data ? scopeRows(data.aggregates, run, scope) : []), [run, data, scope]);
  if (!run || !data) return null;
  const played = run.matches.filter((m) => m.result).length;
  const back = run.phase === 'season' || run.phase === 'playoffs' ? 'hub' : 'end';
  return (
    <div className="space-y-4">
      <div className="title-band flex items-center justify-between gap-2">
        <h1 className="font-display text-3xl font-bold uppercase leading-none">Analytics</h1>
        <GameButton variant="ghost" size="sm" onClick={() => go(back)}>Back</GameButton>
      </div>
      <Panel title="Performance" aside={<span>{played} matches played</span>}>
        <div className="mb-3">
          <Tabs
            tabs={[{ id: 'mine', label: 'My team' }, { id: 'league', label: 'Whole league' }] as const}
            value={scope}
            onChange={setScope}
          />
        </div>
        {rows.length === 0 ? (
          <DialogueBox>
            {played === 0
              ? 'Play a match first: these numbers come from the battles in your league.'
              : 'None of your Pokemon have been brought to a match yet.'}
          </DialogueBox>
        ) : (
          <SpeciesTable rows={rows} />
        )}
        <p className="mt-2 text-xs text-muted"><span className="max-md:hidden">Click a column to sort. </span><span className="md:hidden">Tap a row for its numbers. </span>Dimmed rows have fewer than {SMALL_SAMPLE} games.</p>
      </Panel>
      {/* Internal balance tooling: dev builds only, never shown to players. */}
      {import.meta.env.DEV && <PriceWatch suggestions={data.suggestions} gamesPlayed={played} />}
    </div>
  );
}
