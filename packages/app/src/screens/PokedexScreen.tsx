// The Pokedex (docs/ROGUELIKE.md "Pokedex (the tracker)"): every species with its highest state (Locked, Unlocked,
// Drafted, Won with, Champion), wins and titles, filters by tier / type / state, and completion on "Won with". Locked
// species show as silhouettes; a species with enough wins shows shiny. Any scouting pack waiting opens here too.
import { useId, useMemo, useState } from 'react';
import type { DexEntry, DexState } from '@pdc/engine';
import { ALL_TYPES, DEX_STATES, POOL_PROGRESSION, dexCompletion, pokedex } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useProfile } from '../store/profile';
import { PackReveal } from '../components/ScoutingPack';
import { displayName } from '../game/names';
import { BackButton, GameButton, NewTag, Panel, PokeSprite, PriceBadge, TypePills } from '../components/ui';

const PAGE = 48;

const STATE_LABEL: Record<DexState, string> = {
  locked: 'Locked',
  unlocked: 'Unlocked',
  drafted: 'Drafted',
  wonWith: 'Won with',
  champion: 'Champion',
};

const STATE_CLS: Record<DexState, string> = {
  locked: 'border-edge bg-panel-inset',
  unlocked: 'border-edge bg-panel-inset',
  drafted: 'border-edge bg-panel',
  wonWith: 'border-you bg-panel',
  champion: 'border-poke-yellow-dark bg-panel-hi',
};

function DexCard({ e }: { e: DexEntry }) {
  const name = displayName(e.mon.name);
  const locked = e.state === 'locked';
  const label = `#${e.mon.num} ${name}, ${STATE_LABEL[e.state]}${e.wins ? `, ${e.wins} wins` : ''}${e.titles ? `, ${e.titles} titles` : ''}${e.shiny ? ', shiny' : ''}${e.isNew ? ', new' : ''}`;
  return (
    <li aria-label={label} className={`relative flex flex-col items-center rounded-lg border-2 px-1.5 pb-2 pt-1 text-center ${STATE_CLS[e.state]}`}>
      <span className="absolute left-1.5 top-1 font-display text-xs font-bold text-faint tabular-nums">#{e.mon.num}</span>
      {!locked && <span className="absolute right-1 top-1"><PriceBadge points={e.mon.points} /></span>}
      {e.isNew && <span className="absolute left-1 top-5"><NewTag /></span>}
      <PokeSprite name={e.mon.name} size={72} shiny={e.shiny} className={locked ? 'opacity-40 brightness-0' : ''} />
      <div className="w-full truncate font-display font-bold leading-tight" title={name}>{locked ? '???' : name}</div>
      {!locked && <div className="mt-1"><TypePills types={e.mon.types} size="xs" /></div>}
      <div className={`mt-1 text-xs font-bold uppercase tracking-wide ${e.state === 'champion' ? 'text-poke-yellow' : 'text-muted'}`}>
        {STATE_LABEL[e.state]}
      </div>
      {(e.wins > 0 || e.titles > 0) && (
        <div className="text-xs text-muted tabular-nums">
          {e.wins} win{e.wins === 1 ? '' : 's'}{e.titles > 0 ? ` · ${e.titles} title${e.titles === 1 ? '' : 's'}` : ''}
        </div>
      )}
    </li>
  );
}

export function PokedexScreen() {
  const go = useGame((s) => s.go);
  const pool = useProfile((s) => s.pool);
  const trophies = useProfile((s) => s.trophies);
  const dex = useMemo(() => pokedex(pool, trophies), [pool, trophies]);
  // Tiers from the most to the least expensive (each tier's top price), so the filter reads like the price list.
  const tiers = useMemo(() => {
    const top = new Map<string, number>();
    for (const e of dex) top.set(e.mon.tier, Math.max(top.get(e.mon.tier) ?? 0, e.mon.points));
    return [...top.keys()].sort((a, b) => (top.get(b) ?? 0) - (top.get(a) ?? 0) || a.localeCompare(b));
  }, [dex]);
  const counts = useMemo(() => {
    const out = Object.fromEntries(DEX_STATES.map((s) => [s, 0])) as Record<DexState, number>;
    for (const e of dex) out[e.state]++;
    return out;
  }, [dex]);

  const [query, setQuery] = useState('');
  const [tier, setTier] = useState('');
  const [type, setType] = useState('');
  const [state, setState] = useState<DexState | ''>('');
  const [limit, setLimit] = useState(PAGE);
  const searchId = useId();

  const q = query.trim().toLowerCase();
  const shown = dex.filter((e) =>
    (!q || (e.state !== 'locked' && displayName(e.mon.name).toLowerCase().includes(q)) || String(e.mon.num) === q)
    && (!tier || e.mon.tier === tier)
    && (!type || e.mon.types.includes(type))
    && (!state || e.state === state));
  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setLimit(PAGE); };
  const completion = Math.round(dexCompletion(dex) * 1000) / 10;
  const unlocked = dex.length - counts.locked;

  return (
    <div className="mx-auto max-w-5xl space-y-4 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <BackButton onClick={() => go('title')} to="title screen" />
        <h1 className="font-display text-3xl font-bold uppercase text-poke-yellow drop-shadow-[0_3px_0_var(--color-edge-dark)] sm:text-4xl">Pokedex</h1>
      </div>

      <Panel title="Completion" aside={<span>{unlocked} / {dex.length} in your pool</span>}>
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Won with</span>
              <span className="font-display text-2xl font-bold leading-none text-poke-yellow tabular-nums">{completion}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full border-2 border-edge-dark bg-panel-inset" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} aria-label="Pokedex completion: species won with">
              <div className="h-full bg-poke-yellow" style={{ width: `${completion}%` }} />
            </div>
          </div>
          <dl className="grid grid-cols-5 gap-2">
            {DEX_STATES.map((s) => (
              <div key={s} className="game-inset flex flex-col-reverse items-center px-1 py-2 text-center">
                <dt className="text-xs font-bold uppercase tracking-wide text-muted">{STATE_LABEL[s]}</dt>
                <dd className="font-display text-xl font-bold leading-none tabular-nums">{counts[s]}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted">
            Win a match with a mon for the first time to earn a point; every {POOL_PROGRESSION.pointsPerPack} points open a scouting pack,
            and every finished run opens one. {POOL_PROGRESSION.shinyWins} match wins with a species make it shiny.
          </p>
        </div>
      </Panel>

      <PackReveal framed />

      <Panel title="Species" aside={<span>{shown.length} shown</span>}>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label htmlFor={searchId} className="sr-only">Search species</label>
          <input id={searchId} className="field col-span-2 sm:col-span-1" type="search" placeholder="Name or number" value={query} onChange={(e) => reset(setQuery)(e.target.value)} />
          <select className="field" value={state} onChange={(e) => reset(setState)(e.target.value as DexState | '')} aria-label="State">
            <option value="">Any state</option>
            {DEX_STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select>
          <select className="field" value={tier} onChange={(e) => reset(setTier)(e.target.value)} aria-label="Tier">
            <option value="">Any tier</option>
            {tiers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="field col-span-2 sm:col-span-1" value={type} onChange={(e) => reset(setType)(e.target.value)} aria-label="Type">
            <option value="">Any type</option>
            {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {shown.length === 0
          ? <p className="text-muted">No species match these filters.</p>
          : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {shown.slice(0, limit).map((e) => <DexCard key={e.mon.id} e={e} />)}
            </ul>
          )}
        {shown.length > limit && (
          <div className="mt-3 flex justify-center">
            <GameButton variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>Show more ({shown.length - limit} left)</GameButton>
          </div>
        )}
      </Panel>
    </div>
  );
}
