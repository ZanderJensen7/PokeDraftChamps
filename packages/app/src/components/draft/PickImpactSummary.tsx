import type { DraftMon, SpeciesId } from '@pdc/engine';
import { ROLE_SHORT, usePickImpact } from '../../hooks/useDraftHelper';
import { displayText } from '../../game/names';

const CHIP = 'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-bold leading-none';
const TONE = {
  good: 'border-win/70 bg-win/15 text-win',
  bad: 'border-loss/70 bg-loss/15 text-loss',
  role: 'border-you bg-you-soft text-ink',
  plain: 'border-edge-dark bg-panel-inset text-muted',
} as const;

/**
 * What drafting this mon would change: the engine's one-line note plus chips for the weak types it
 * fixes (green) or worsens (red), the move roles it adds (blue) and its speed slot. Type and speed
 * chips show at once; the role chips and final note arrive when the learnsets are read.
 */
export function PickImpactSummary({ rosterIds, candidate, pool, className = '' }: {
  rosterIds: readonly SpeciesId[]; candidate: SpeciesId; pool: readonly DraftMon[]; className?: string;
}) {
  const { sync, full } = usePickImpact(rosterIds, candidate, pool);
  if (!sync) return null;
  const imp = full ?? sync;
  const outspeeds = rosterIds.length > 0 ? `, outspeeds ${imp.outspeeds} of ${rosterIds.length}` : '';
  return (
    <div className={`text-left ${className}`} aria-live="polite">
      {imp.note && <p className="mb-1 text-xs font-semibold leading-snug">{displayText(imp.note)}</p>}
      <div className="flex flex-wrap gap-1">
        {imp.weakFixed.map((w) => <span key={`f-${w.type}`} className={`${CHIP} ${TONE.good}`} title={`Weak score vs ${w.type}: ${w.before} to ${w.after}`}>+{w.type}</span>)}
        {imp.weakWorsened.map((w) => <span key={`w-${w.type}`} className={`${CHIP} ${TONE.bad}`} title={`Weak score vs ${w.type}: ${w.before} to ${w.after}`}>−{w.type}</span>)}
        {full
          ? full.newRoles.map((r) => <span key={`r-${r}`} className={`${CHIP} ${TONE.role}`} title={`Adds ${r}`}>+{ROLE_SHORT[r]}</span>)
          : <span className={`${CHIP} ${TONE.plain}`}>moves…</span>}
        <span className={`${CHIP} ${TONE.plain}`}>{imp.speedSlot}{outspeeds}</span>
      </div>
    </div>
  );
}
