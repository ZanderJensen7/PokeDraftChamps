// Tera / Z captain picker: ends the draft (DraftScreen) and reopens from the Hub during the regular season.
import { useState } from 'react';
import type { RunState, SpeciesId } from '@pdc/engine';
import { getDraftMon, humanCoach } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { DialogueBox, GameButton, Panel, PokeSprite, PriceBadge, RoleTag, SpriteCard, TypePills } from './ui';
import { displayName } from '../game/names';
import { useIsMobile } from '../hooks/useIsMobile';

type Role = 'tera' | 'z';

interface Props {
  run: RunState;
  /** 'draft' finishes the draft on confirm; 'hub' just saves (and closes via onDone). */
  mode: 'draft' | 'hub';
  onDone?: () => void;
}

export function CaptainPicker({ run, mode, onDone }: Props) {
  const save = useGame((s) => s.setCaptainsWith);
  const human = humanCoach(run);
  const needTera = run.config.teraCaptains;
  const needZ = run.config.zCaptains ?? 0;
  const roles: Role[] = [...(needTera > 0 ? (['tera'] as const) : []), ...(needZ > 0 ? (['z'] as const) : [])];
  const [role, setRole] = useState<Role>(roles[0] ?? 'tera');
  const [tera, setTera] = useState<SpeciesId[]>(() => human.roster.filter((r) => r.isTeraCaptain).map((r) => r.species));
  const [z, setZ] = useState<SpeciesId[]>(() => human.roster.filter((r) => r.isZCaptain).map((r) => r.species));

  const isMobile = useIsMobile();
  const toggleRole = (r: Role, id: SpeciesId) => {
    const need = r === 'tera' ? needTera : needZ;
    const cur = r === 'tera' ? tera : z;
    const setCur = r === 'tera' ? setTera : setZ;
    const setOther = r === 'tera' ? setZ : setTera;
    if (cur.includes(id)) { setCur(cur.filter((x) => x !== id)); return; }
    setOther((o) => o.filter((x) => x !== id)); // one role per mon
    setCur(cur.length >= need ? [...cur.slice(1), id] : [...cur, id]);
  };
  const toggle = (id: SpeciesId) => toggleRole(role, id);

  const complete = tera.length === needTera && z.length === needZ;
  const confirm = () => {
    if (save({ tera, z })) onDone?.();
  };
  const both = needTera > 0 && needZ > 0;
  const intro = both
    ? `Pick exactly ${needTera} Tera captain${needTera === 1 ? '' : 's'} and ${needZ} Z captain${needZ === 1 ? '' : 's'}. Only Tera captains may Terastallize; each Z captain holds a Z-Crystal. A mon can hold one role.`
    : needZ > 0
      ? `Pick exactly ${needZ} Z captain${needZ === 1 ? '' : 's'}. Each holds a Z-Crystal for one Z-Move a battle.`
      : `Pick exactly ${needTera} Tera captain${needTera === 1 ? '' : 's'}. Only captains may Terastallize in battle.`;

  // Phones: one full-width row per Pokemon with big role toggles and a pinned confirm bar.
  if (isMobile) {
    return (
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="title-band text-xl leading-tight">{mode === 'draft' ? 'Choose your captains' : 'Captains'}</h2>
          <span className="font-display font-bold text-poke-yellow tabular-nums">
            {needTera > 0 && <>Tera {tera.length}/{needTera}</>}{both && ' · '}{needZ > 0 && <>Z {z.length}/{needZ}</>}
          </span>
        </div>
        <DialogueBox className="text-sm">{mode === 'draft' ? 'The draft is done! ' : ''}{intro}</DialogueBox>
        <ul className="space-y-2">
          {human.roster.map((r) => {
            const mon = getDraftMon(r.species);
            const mega = mon?.isMega === true;
            const name = mon?.name ?? r.species;
            return (
              <li key={r.species} className={`game-panel flex items-center gap-2 py-1 pr-2 pl-1 ${mega ? 'opacity-60' : ''}`}>
                <PokeSprite name={name} size={56} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-lg font-bold leading-tight">{displayName(name)}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <TypePills types={mon?.types ?? []} size="xs" />
                    {mega && <RoleTag role="mega" compact />}
                  </div>
                  {mega && <div className="text-xs font-semibold text-muted">Megas can't be captains</div>}
                </div>
                {!mega && roles.map((rl) => {
                  const on = (rl === 'tera' ? tera : z).includes(r.species);
                  return (
                    <button
                      key={rl}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${displayName(name)} ${rl === 'tera' ? 'Tera' : 'Z'} captain`}
                      onClick={() => toggleRole(rl, r.species)}
                      className={`game-btn min-h-12 min-w-16 shrink-0 px-2 text-base ${on ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      {on ? '✓ ' : ''}{rl === 'tera' ? 'TERA' : 'Z'}
                    </button>
                  );
                })}
              </li>
            );
          })}
        </ul>
        <div className="h-20" aria-hidden="true" />
        <div className="pb-safe-3 fixed inset-x-0 bottom-0 z-50 flex items-center gap-2 border-t-4 border-edge-dark bg-panel/95 px-3 pt-3 backdrop-blur">
          {mode === 'hub' && <GameButton variant="ghost" onClick={onDone} className="min-h-12">Cancel</GameButton>}
          <GameButton block size="lg" disabled={!complete} onClick={confirm} className="min-h-12 !text-lg">
            {complete
              ? (mode === 'draft' ? 'FINISH DRAFT' : 'SAVE CAPTAINS')
              : `PICK ${[needTera > tera.length ? `${needTera - tera.length} TERA` : '', needZ > z.length ? `${needZ - z.length} Z` : ''].filter(Boolean).join(' + ') || 'FEWER'}`}
          </GameButton>
        </div>
      </div>
    );
  }

  return (
    <Panel
      title={mode === 'draft' ? 'Choose your captains' : 'Captains'}
      aside={(
        <span className="font-display font-bold text-poke-yellow">
          {needTera > 0 && <>Tera {tera.length}/{needTera}</>}{both && ' · '}{needZ > 0 && <>Z {z.length}/{needZ}</>}
        </span>
      )}
    >
      <DialogueBox className="mb-4">{mode === 'draft' ? 'The draft is done! ' : ''}{intro}</DialogueBox>
      {roles.length > 1 && (
        <div role="tablist" aria-label="Captain role" className="mb-3 flex gap-2">
          {roles.map((r) => {
            const on = r === role;
            const n = r === 'tera' ? tera.length : z.length;
            const total = r === 'tera' ? needTera : needZ;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setRole(r)}
                className={`game-btn flex items-center gap-2 px-3 py-1.5 text-sm ${on ? 'btn-primary' : 'btn-ghost'}`}
              >
                {r === 'tera' ? 'Tera picks' : 'Z picks'}
                <span className="tabular-nums">{n}/{total}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {human.roster.map((r) => {
          const mon = getDraftMon(r.species);
          const mega = mon?.isMega === true;
          const isTera = tera.includes(r.species);
          const isZ = z.includes(r.species);
          const name = mon?.name ?? r.species;
          return (
            <SpriteCard
              key={r.species}
              name={name}
              selected={role === 'tera' ? isTera : isZ}
              disabled={mega}
              tone="you"
              onClick={mega ? undefined : () => toggle(r.species)}
              title={mega ? "Megas can't be captains" : undefined}
              ariaLabel={`${displayName(name)}${isTera ? ', Tera captain' : ''}${isZ ? ', Z captain' : ''}`}
              badge={<PriceBadge points={mon?.points ?? 0} />}
              marker={mega ? <RoleTag role="mega" /> : isTera ? <RoleTag role="tera" /> : isZ ? <RoleTag role="z" /> : undefined}
            >
              <div className="truncate text-center font-display font-bold">{displayName(name)}</div>
              <div className="flex justify-center"><TypePills types={mon?.types ?? []} size="xs" /></div>
              {mega && <div className="mt-1 text-center text-xs font-semibold text-muted">Megas can't be captains</div>}
            </SpriteCard>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {!complete && (
          <span className="text-sm font-semibold text-muted">
            {tera.length !== needTera && `Tera ${tera.length}/${needTera}`}{tera.length !== needTera && z.length !== needZ && ' · '}{z.length !== needZ && `Z ${z.length}/${needZ}`}
          </span>
        )}
        {mode === 'hub' && <GameButton variant="ghost" onClick={onDone}>Cancel</GameButton>}
        <GameButton size="lg" disabled={!complete} onClick={confirm}>{mode === 'draft' ? 'Finish draft' : 'Save captains'}</GameButton>
      </div>
    </Panel>
  );
}
