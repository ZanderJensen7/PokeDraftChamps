// Scouting packs (docs/ROGUELIKE.md "Pool progression"): the run's first wins, the points toward the next pack, and
// the pack reveal (three locked species, keep one). The end screen and the Pokedex both show it.
import { useMemo, useState, type ReactNode } from 'react';
import type { CareerRun } from '@pdc/engine';
import { POOL_PROGRESSION, dexSpecies, packOffer } from '@pdc/engine';
import { useProfile } from '../store/profile';
import { displayName, speciesName, spriteName } from '../game/names';
import { DialogueBox, GameButton, Panel, PokeIcon, PriceBadge, SpriteCard, TypePills } from './ui';

/** Species this run won with for the first time: its wins are all of the species' career wins. */
function firstWinsIn(r: CareerRun, wins: (id: string) => number): string[] {
  return Object.entries(r.winsBy ?? {}).filter(([id, n]) => n > 0 && wins(id) === n).map(([id]) => id);
}

/** The pack reveal: pick one of the offer, then keep it (in a Panel of its own with `framed`). Renders nothing with no pack waiting. */
export function PackReveal({ framed = false }: { framed?: boolean }) {
  const pool = useProfile((s) => s.pool);
  const openPack = useProfile((s) => s.openPack);
  const offer = useMemo(() => (pool.packs > 0 ? packOffer(pool) : []), [pool]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  if (pool.packs === 0 && !kept) return null;

  const keep = () => {
    openPack(chosen);
    setKept(chosen);
    setChosen(null);
  };
  const frame = (body: ReactNode) => (framed ? <Panel>{body}</Panel> : body);
  if (pool.packs > 0 && offer.length === 0) {
    return frame(
      <div className="flex flex-col items-center gap-2">
        <DialogueBox>Your Pokedex is complete: every species is in your pool. Nothing left to scout.</DialogueBox>
        <GameButton variant="secondary" onClick={() => openPack(null)}>Close the pack</GameButton>
      </div>,
    );
  }
  return frame(
    <div className="flex flex-col gap-3">
      {kept && (
        <DialogueBox>
          {speciesName(kept)} joins your pool. It shows NEW in the draft until you take it, and every coach in your leagues can draft it too.
        </DialogueBox>
      )}
      {pool.packs > 0 && (
        <>
          <div className="text-center font-display text-lg font-bold uppercase tracking-wide">
            Scouting pack{pool.packs > 1 ? ` · ${pool.packs} waiting` : ''}: keep one
          </div>
          <div className="grid grid-cols-3 gap-2">
            {offer.map((m) => (
              <SpriteCard
                key={m.id}
                name={m.name}
                badge={<PriceBadge points={m.points} />}
                selected={chosen === m.id}
                onClick={() => setChosen(m.id)}
                ariaLabel={`${displayName(m.name)}, ${m.points} points, ${m.types.join('/')}${chosen === m.id ? ', chosen' : ''}`}
              >
                <div className="truncate text-center font-display font-bold leading-tight">{displayName(m.name)}</div>
                <div className="mt-1 flex justify-center"><TypePills types={m.types} size="xs" /></div>
                <div className="mt-1 text-center text-xs font-semibold text-muted">{m.tier} · BST {m.bst}</div>
              </SpriteCard>
            ))}
          </div>
          <div className="flex justify-center">
            <GameButton disabled={!chosen} onClick={keep}>
              {chosen ? `Keep ${speciesName(chosen)}` : 'Pick one to keep'}
            </GameButton>
          </div>
        </>
      )}
    </div>,
  );
}

/** The end screen's pool panel: first wins this run, the pack track, and any pack to open. */
export function ScoutingPanel({ runId }: { runId: string }) {
  const runs = useProfile((s) => s.runs);
  const trophies = useProfile((s) => s.trophies);
  const pool = useProfile((s) => s.pool);
  const career = runs.find((r) => r.runId === runId);
  const firsts = career ? firstWinsIn(career, (id) => trophies[id]?.wins ?? 0) : [];
  const total = dexSpecies().length;
  return (
    <Panel title="Scouting" aside={<span>{pool.unlocked.length} / {total} in your pool</span>}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-bold uppercase tracking-wide text-muted">First wins</span>
          {firsts.length === 0
            ? <span className="text-muted">None this run. Win a match with a mon you have never won with to earn a point.</span>
            : (
              <span className="flex flex-wrap items-center gap-1">
                {firsts.map((id) => <PokeIcon key={id} name={spriteName(id)} title={`First win: ${speciesName(id)}`} />)}
                <span className="font-bold tabular-nums">+{firsts.length}</span>
              </span>
            )}
        </div>
        <div className="flex items-center gap-2" aria-label={`${pool.points} of ${POOL_PROGRESSION.pointsPerPack} points toward the next pack`}>
          <span className="text-sm font-bold uppercase tracking-wide text-muted">Next pack</span>
          {Array.from({ length: POOL_PROGRESSION.pointsPerPack }, (_, i) => (
            <span key={i} className={`h-3 w-6 rounded-full border-2 border-edge-dark ${i < pool.points ? 'bg-poke-yellow' : 'bg-panel-inset'}`} />
          ))}
        </div>
        <PackReveal />
      </div>
    </Panel>
  );
}
