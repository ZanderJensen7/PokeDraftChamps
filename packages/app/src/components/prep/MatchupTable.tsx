import type { CoachId, PrepTeamMatchup } from '@pdc/engine';
import { ALL_TYPES } from '@pdc/engine';
import { PokeIcon } from '../ui';
import { speciesName, spriteName } from '../../game/names';
import { MonDetailButton } from '../MonDetail';

const TYPE_ABBR = (t: string) => t.slice(0, 3).toUpperCase();

export function multClass(m: number): string {
  if (m === 0) return 'bg-mult-0 text-faint';
  if (m <= 0.25) return 'bg-mult-q';
  if (m <= 0.5) return 'bg-mult-h';
  if (m >= 4) return 'bg-mult-4 font-bold';
  if (m >= 2) return 'bg-mult-2';
  return 'bg-mult-1 text-faint';
}

export function multText(m: number): string {
  if (m === 0) return '0';
  if (m === 0.25) return '¼';
  if (m === 0.5) return '½';
  if (m === 1) return '';
  return String(m);
}

const weakText = (w: number) => (w <= -2 ? 'text-loss' : w >= 2 ? 'text-win' : 'text-muted');

/** Weak-score cell colors for the compact table: holes in the matchup reds, walls in the resist greens. */
function weakCell(w: number): string {
  if (w <= -3) return 'bg-mult-4 font-bold';
  if (w <= -1) return 'bg-mult-2';
  if (w >= 3) return 'bg-mult-q';
  if (w >= 1) return 'bg-mult-h';
  return 'bg-mult-1 text-faint';
}

interface MatchupTableProps {
  title?: string;
  side?: 'you' | 'opp';
  table: PrepTeamMatchup;
  /** Narrow-rail version (draft screen): icon-only rows, vertical type headers, tight cells. */
  compact?: boolean;
  /** The team's coach: the detail sheet opened from a row shows their scouting. */
  coachId?: CoachId;
}

function ImmunityNotes({ table }: { table: PrepTeamMatchup }) {
  if (table.immunityNotes.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-muted">
      {table.immunityNotes.map((n) => `${speciesName(n.species)}: ${n.ability} blocks ${n.type}`).join(' · ')}
    </p>
  );
}

/** Damage-taken type chart for one team: rows = mons, 18 type columns, STAB and Weak rows at the bottom. */
export function MatchupTable({ title, side = 'you', table, compact, coachId }: MatchupTableProps) {
  if (compact) return <CompactMatchupTable table={table} coachId={coachId} />;
  return (
    <div>
      {title && <div className={`mb-1 font-display font-bold uppercase tracking-wide ${side === 'you' ? 'text-you' : 'text-opp'}`}>{title}: damage taken</div>}
      <div className="overflow-x-auto overscroll-x-contain rounded-lg border-2 border-edge-dark">
        <table className="w-full min-w-[46rem] border-collapse text-center text-xs">
          <thead>
            <tr className="bg-panel-inset">
              <th className="sticky left-0 z-10 bg-panel-inset px-2 py-1 text-left">Pokemon</th>
              {ALL_TYPES.map((t) => (
                <th key={t} className="px-0.5 py-1" title={t}>
                  <span className="inline-block w-8 rounded py-0.5 text-[10px] font-bold text-ink" style={{ background: `var(--color-type-${t.toLowerCase()})` }}>{TYPE_ABBR(t)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.species} className="border-t border-edge-dark">
                <th className="sticky left-0 z-10 bg-panel px-2 py-0.5 text-left font-semibold whitespace-nowrap">
                  <MonDetailButton species={r.species} coachId={coachId} className="flex items-center gap-1"><PokeIcon name={spriteName(r.species)} />{speciesName(r.species)}</MonDetailButton>
                </th>
                {ALL_TYPES.map((t) => {
                  const m = r.byType[t] ?? 1;
                  return <td key={t} className={`px-0.5 py-1 tabular-nums ${multClass(m)}`}>{multText(m)}</td>;
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-edge bg-panel-inset font-bold">
              <th className="sticky left-0 z-10 bg-panel-inset px-2 py-1 text-left">STAB users</th>
              {ALL_TYPES.map((t) => <td key={t} className="tabular-nums">{table.stab[t] || ''}</td>)}
            </tr>
            <tr className="bg-panel-inset font-bold">
              <th className="sticky left-0 z-10 bg-panel-inset px-2 py-1 text-left">Weak score</th>
              {ALL_TYPES.map((t) => {
                const w = table.weak[t] ?? 0;
                return <td key={t} className={`tabular-nums ${weakText(w)}`}>{w || ''}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <ImmunityNotes table={table} />
    </div>
  );
}

function CompactMatchupTable({ table, coachId }: { table: PrepTeamMatchup; coachId?: CoachId }) {
  return (
    <div>
      <div className="overflow-x-auto overscroll-x-contain rounded-lg border-2 border-edge-dark">
        <table className="w-full border-collapse text-center text-[11px] leading-none">
          <thead>
            <tr className="bg-panel-inset">
              <th className="sticky left-0 z-10 bg-panel-inset"><span className="sr-only">Pokemon</span></th>
              {ALL_TYPES.map((t) => (
                <th key={t} className="p-px" title={t} scope="col">
                  <span
                    className="mx-auto flex h-8 w-4 items-center justify-center rounded-sm text-[9px] font-extrabold text-ink [text-shadow:0_1px_0_rgb(0_0_0/0.6)] [writing-mode:vertical-rl]"
                    style={{ background: `var(--color-type-${t.toLowerCase()})` }}
                  >
                    {TYPE_ABBR(t)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.species} className="border-t border-edge-dark">
                <th scope="row" className="sticky left-0 z-10 w-10 bg-panel p-0 text-left">
                  <MonDetailButton species={r.species} coachId={coachId} className="block">
                    <PokeIcon name={spriteName(r.species)} title={speciesName(r.species)} className="block" />
                  </MonDetailButton>
                </th>
                {ALL_TYPES.map((t) => {
                  const m = r.byType[t] ?? 1;
                  return <td key={t} className={`min-w-[18px] tabular-nums ${multClass(m)}`} title={`${speciesName(r.species)} takes ×${m} from ${t}`}>{multText(m)}</td>;
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-edge bg-panel-inset font-bold">
              <th scope="row" className="sticky left-0 z-10 bg-panel-inset px-1 py-1.5 text-left text-[10px] uppercase text-muted">STAB</th>
              {ALL_TYPES.map((t) => <td key={t} className="tabular-nums" title={`${t} STAB users: ${table.stab[t] ?? 0}`}>{table.stab[t] || ''}</td>)}
            </tr>
            <tr className="bg-panel-inset font-bold">
              <th scope="row" className="sticky left-0 z-10 bg-panel-inset px-1 py-1.5 text-left text-[10px] uppercase text-muted">Weak</th>
              {ALL_TYPES.map((t) => {
                const w = table.weak[t] ?? 0;
                return <td key={t} className={`py-1.5 tabular-nums ${weakCell(w)}`} title={`${t} weak score: ${w}`}>{w || ''}</td>;
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <ImmunityNotes table={table} />
    </div>
  );
}
