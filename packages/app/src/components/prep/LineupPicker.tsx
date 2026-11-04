// The lineup picker: choose and order the six you bring. Tap to add or drop, drag (or tap two slots) to reorder.
// Shared by the full prep doc and the guided prep's Lineup step.
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { RunState, SpeciesId } from '@pdc/engine';
import { getDraftMon, humanCoach } from '@pdc/engine';
import { useGame } from '../../store/useGame';
import { GameButton, IconBadge, Panel, PokeIcon, PokeSprite, RoleTags } from '../ui';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MonDetailButton } from '../MonDetail';
import { displayName, rolesOf, speciesName, spriteName } from '../../game/names';

/** Pointer travel (px) before a press on a lineup slot becomes a drag instead of a tap. */
const DRAG_SLOP = 6;

function GripIcon() {
  return (
    <svg viewBox="0 0 10 16" width="8" height="13" fill="currentColor" className="shrink-0 opacity-70" aria-hidden="true">
      <circle cx="2.5" cy="3" r="1.6" /><circle cx="7.5" cy="3" r="1.6" />
      <circle cx="2.5" cy="8" r="1.6" /><circle cx="7.5" cy="8" r="1.6" />
      <circle cx="2.5" cy="13" r="1.6" /><circle cx="7.5" cy="13" r="1.6" />
    </svg>
  );
}

/** Lineup count plus an action: by default the way into the set editor (movesets, EVs, items and natures change there). */
function LineupAside({ count, action }: { count: number; action?: ReactNode }) {
  const openOverlay = useGame((s) => s.openOverlay);
  return (
    <span className="flex items-center gap-2">
      {action ?? <GameButton variant="ghost" size="sm" onClick={() => openOverlay('team')} title="Change moves, EVs, items and natures before the match">Edit sets</GameButton>}
      <span className={`font-display font-bold ${count === 6 ? 'text-win' : 'text-poke-yellow'}`}>{count}/6</span>
    </span>
  );
}

/** `action` replaces the Edit sets button next to the count. */
export function LineupPicker({ run, action }: { run: RunState; action?: ReactNode }) {
  const lineup = useGame((s) => s.lineup);
  const setLineup = useGame((s) => s.setLineup);
  const human = humanCoach(run);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const toggle = (id: SpeciesId) => {
    if (lineup.includes(id)) setLineup(lineup.filter((x) => x !== id));
    else if (lineup.length < 6) setLineup([...lineup, id]);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= lineup.length) return;
    const next = [...lineup];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    setLineup(next);
  };
  const roles = (id: SpeciesId) => rolesOf(human.roster.find((r) => r.species === id) ?? { species: id, isTeraCaptain: false });
  const isMobile = useIsMobile();
  const [swapIdx, setSwapIdx] = useState<number | null>(null);
  const swap = (a: number, b: number) => {
    if (a === b) return;
    const next = [...lineup];
    [next[a], next[b]] = [next[b]!, next[a]!];
    setLineup(next);
  };
  // Phones: touch drag between slots (pointer events on the name strip, which blocks page scrolling only there).
  // Press, move past DRAG_SLOP, drop on another slot: the same swap as tapping both. A still tap keeps the tap-to-swap flow.
  const slotRefs = useRef<(HTMLElement | null)[]>([]);
  const press = useRef<{ from: number; pointerId: number; x: number; y: number; active: boolean } | null>(null);
  const skipTap = useRef(false);
  const [drag, setDrag] = useState<{ from: number; over: number | null; x: number; y: number } | null>(null);
  const slotAt = (x: number, y: number): number | null => {
    for (let i = 0; i < lineup.length; i++) {
      const r = slotRefs.current[i]?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return null;
  };
  const onGripDown = (e: ReactPointerEvent<HTMLElement>, i: number) => {
    if (e.button !== 0 || i >= lineup.length) return;
    // Capture keeps the moves coming when the finger leaves the strip; a pointer that is already gone just drops the drag.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { return; }
    press.current = { from: i, pointerId: e.pointerId, x: e.clientX, y: e.clientY, active: false };
  };
  const onGripMove = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (!p.active) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_SLOP) return;
      p.active = true;
      setSwapIdx(null);
    }
    const over = slotAt(e.clientX, e.clientY);
    setDrag({ from: p.from, over: over !== null && over !== p.from ? over : null, x: e.clientX, y: e.clientY });
  };
  const onGripUp = (e: ReactPointerEvent<HTMLElement>) => {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    press.current = null;
    if (p.active) {
      // The click that follows this pointerup is the end of a drag, not a tap.
      skipTap.current = true;
      setTimeout(() => { skipTap.current = false; }, 0);
      const over = slotAt(e.clientX, e.clientY);
      if (over !== null && over !== p.from) swap(p.from, over);
    }
    setDrag(null);
  };
  const onGripCancel = () => {
    press.current = null;
    setDrag(null);
  };
  // Phones: six big slots. Drag a name strip onto another slot, or tap one then another, to swap order; ✕ benches.
  if (isMobile) {
    const tapSlot = (i: number) => {
      if (skipTap.current) { skipTap.current = false; return; }
      if (i >= lineup.length) return;
      if (swapIdx === null) { setSwapIdx(i); return; }
      if (swapIdx !== i) swap(swapIdx, i);
      setSwapIdx(null);
    };
    const dragName = drag ? speciesName(lineup[drag.from]!) : '';
    return (
      <Panel title="Your lineup" aside={<LineupAside count={lineup.length} action={action} />}>
        {/* Two lines tall whatever it says, so the grid never jumps under a finger mid-tap. */}
        <p className="mb-2 min-h-10 text-sm text-muted" aria-live="polite">
          {drag
            ? (drag.over !== null ? `Drop to swap ${dragName} with ${speciesName(lineup[drag.over]!)}.` : `Drop ${dragName} on another slot to swap.`)
            : swapIdx !== null ? `Tap another slot to swap with ${speciesName(lineup[swapIdx]!)}.` : 'Slot 1 leads. Drag a name onto another slot, or tap two slots, to swap them.'}
        </p>
        <ol className="mb-3 grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => {
            const id = lineup[i];
            if (!id) {
              return (
                <li key={`empty-${i}`} className="relative flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-edge-dark text-faint">
                  <span className="absolute top-1 left-1.5 font-display text-sm font-bold">{i + 1}</span>
                  <span className="text-2xl" aria-hidden="true">+</span>
                </li>
              );
            }
            const picked = swapIdx === i;
            const lifted = drag?.from === i;
            const target = drag?.over === i;
            return (
              <li key={id} className="relative" ref={(el) => { slotRefs.current[i] = el; }}>
                <button
                  type="button"
                  onClick={() => tapSlot(i)}
                  aria-pressed={picked}
                  aria-label={`Slot ${i + 1}: ${speciesName(id)}`}
                  className={`focus-ring flex aspect-square w-full flex-col items-center justify-end overflow-hidden rounded-xl border-2 transition-[opacity,box-shadow] duration-150 ${
                    target ? 'border-poke-yellow bg-panel-hi shadow-[0_0_0_4px_var(--color-poke-yellow)]' : picked ? 'border-poke-yellow bg-panel-hi' : 'border-edge-dark bg-you-soft'
                  } ${lifted ? 'opacity-40' : ''}`}
                >
                  <PokeSprite name={spriteName(id)} size={76} className="-mb-1" />
                  <span
                    className="flex min-h-7 w-full touch-none items-center justify-center gap-1 bg-edge-dark/40 px-1 text-xs font-bold leading-tight"
                    onPointerDown={(e) => onGripDown(e, i)}
                    onPointerMove={onGripMove}
                    onPointerUp={onGripUp}
                    onPointerCancel={onGripCancel}
                  >
                    <GripIcon />
                    <span className="min-w-0 truncate">{speciesName(id)}</span>
                  </span>
                </button>
                {target && (
                  <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-poke-yellow px-1 py-0.5 text-center font-display text-sm font-bold text-cream-ink">
                    SWAP
                  </span>
                )}
                <span className={`pointer-events-none absolute top-1 left-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-display text-sm font-bold ${i === 0 ? 'bg-poke-yellow text-cream-ink' : 'bg-edge-dark text-ink'}`}>
                  {i === 0 ? 'LEAD' : i + 1}
                </span>
                <span className="pointer-events-none absolute right-1 bottom-8"><RoleTags roles={roles(id)} compact /></span>
                <button
                  type="button"
                  onClick={() => { setSwapIdx(null); toggle(id); }}
                  aria-label={`Bench ${speciesName(id)}`}
                  className="focus-ring absolute -top-1.5 -right-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-edge-dark bg-panel font-bold text-muted active:text-ink"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
        {drag && (
          <div
            className="pointer-events-none fixed z-50 flex flex-col items-center drop-shadow-[0_6px_8px_rgb(0_0_0/0.6)]"
            style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -60%) scale(1.1)' }}
            aria-hidden="true"
          >
            <PokeSprite name={spriteName(lineup[drag.from]!)} size={76} />
            <span className="-mt-1 rounded-md bg-panel px-1.5 text-xs font-bold">{dragName}</span>
          </div>
        )}
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Bench</div>
        <div className="flex flex-wrap gap-1.5">
          {human.roster.filter((r) => !lineup.includes(r.species)).map((r) => (
            <button
              key={r.species}
              type="button"
              disabled={lineup.length >= 6}
              onClick={() => { setSwapIdx(null); toggle(r.species); }}
              className="focus-ring flex min-h-11 items-center gap-1 rounded-lg border-2 border-edge-dark bg-panel-inset px-2 text-sm font-semibold disabled:opacity-40"
            >
              <PokeIcon name={spriteName(r.species)} />
              {speciesName(r.species)}
              <RoleTags roles={rolesOf(r)} compact />
            </button>
          ))}
          {human.roster.every((r) => lineup.includes(r.species)) && <span className="text-sm text-muted">Everyone is in.</span>}
        </div>
      </Panel>
    );
  }
  return (
    <Panel title="Your lineup" aside={<LineupAside count={lineup.length} action={action} />}>
      <p className="mb-2 text-sm text-muted">Tap to bring or bench. The first Pokemon leads. Drag or use the arrows to reorder.</p>
      <ol className="mb-3 space-y-1">
        {lineup.map((id, i) => (
          <li
            key={id}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null) move(dragIdx, i); setDragIdx(null); }}
            className="flex items-center gap-2 rounded-lg bg-you-soft px-2 py-0.5"
          >
            <span className="w-5 font-display font-bold text-muted">{i + 1}</span>
            <MonDetailButton species={id} coachId={human.id}><IconBadge name={spriteName(id)} tone="you" roles={roles(id)} /></MonDetailButton>
            <span className="flex-1 truncate font-semibold">{speciesName(id)}{i === 0 && <span className="ml-2 text-xs font-bold text-poke-yellow">LEAD</span>}</span>
            <GameButton variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${speciesName(id)} up`}>▲</GameButton>
            <GameButton variant="ghost" size="sm" disabled={i === lineup.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${speciesName(id)} down`}>▼</GameButton>
            <GameButton variant="ghost" size="sm" onClick={() => toggle(id)} aria-label={`Bench ${speciesName(id)}`}>✕</GameButton>
          </li>
        ))}
        {lineup.length === 0 && <li className="text-sm text-muted">Nobody selected yet.</li>}
      </ol>
      <div className="flex flex-wrap gap-1">
        {human.roster.filter((r) => !lineup.includes(r.species)).map((r) => (
          <button
            key={r.species}
            type="button"
            disabled={lineup.length >= 6}
            onClick={() => toggle(r.species)}
            className="focus-ring flex items-center gap-1 rounded-lg border-2 border-edge-dark bg-panel-inset px-1.5 py-0.5 text-sm font-semibold enabled:hover:border-edge disabled:opacity-40"
          >
            <PokeIcon name={spriteName(r.species)} />
            {speciesName(r.species)}
            <RoleTags roles={rolesOf(r)} compact />
          </button>
        ))}
      </div>
    </Panel>
  );
}
