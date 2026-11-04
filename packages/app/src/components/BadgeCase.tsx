// The badge case: every badge (stake) on a track, earned / open / locked, and a card for the badge in view. Hover,
// focus or click any badge to see what it brings, locked ones too; only an unlocked badge can be picked.
// A Badge Run shows the league each badge plays (badgeRunConfig); a custom league shows the badge's rules on top of
// the player's own settings, and earns nothing.
import { useState } from 'react';
import type { LeagueConfig } from '@pdc/engine';
import { applyStake, badgeRunConfig, MAX_STAKE, rulesAt, STAKES } from '@pdc/engine';
import { BadgeEmblem, type BadgeState } from './ui';
import { badgeLabel, badgeName, badgeOf } from '../game/badges';

function Fixed({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="game-inset flex flex-col items-center px-2 py-2">
      <span className="font-display text-2xl font-bold text-ink">{value}</span>
      <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

type Props = {
  value: number;
  unlocked: number;
  titlesPerStake: number[];
  onChange: (v: number) => void;
} & ({ mode: 'run' } | { mode: 'custom'; config: LeagueConfig });

export function BadgeCase(props: Props) {
  const { value, unlocked, titlesPerStake, onChange, mode } = props;
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = hover ?? pinned ?? value;
  const stateOf = (stake: number): BadgeState =>
    stake > unlocked ? 'locked' : (titlesPerStake[stake - 1] ?? 0) > 0 ? 'earned' : 'open';
  const state = stateOf(shown);
  const league = props.mode === 'run' ? badgeRunConfig(shown) : applyStake({ ...props.config, stake: shown });
  const aiBonus = rulesAt(shown).aiBudgetBonus;
  const { rule } = STAKES[shown - 1]!;
  const earnedCount = titlesPerStake.filter((n) => n > 0).length;

  let footer: string;
  if (state === 'locked') footer = `Preview only. Win the title at ${badgeLabel(shown - 1)} to unlock it. `;
  else if (shown !== value) footer = mode === 'run' ? 'Click to play for this badge.' : 'Click to play with these rules.';
  else if (mode === 'custom') footer = 'Custom leagues play the rules but never earn or unlock a badge.';
  else if (state === 'open') footer = `Win the title to earn the ${badgeName(shown)}${shown < MAX_STAKE ? ` and unlock ${badgeLabel(shown + 1)}` : ''}.`;
  else footer = `You have earned the ${badgeName(shown)}. Play it again or climb higher.`;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">{mode === 'run' ? 'Win the title to earn a badge and unlock the next.' : 'Play any unlocked badge’s rules.'}</span>
        <span className="shrink-0 font-display font-bold uppercase tracking-wide text-poke-yellow">{earnedCount}/{MAX_STAKE} earned</span>
      </div>
      <div role="radiogroup" aria-label="Badge" className="grid grid-cols-5 gap-x-1 gap-y-3 sm:grid-cols-10" onMouseLeave={() => setHover(null)}>
        {STAKES.map(({ stake }) => {
          const s = stateOf(stake);
          const on = stake === value;
          const looking = stake === shown;
          return (
            <button
              key={stake}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={s === 'locked'}
              aria-label={`${badgeLabel(stake)}, ${badgeName(stake)}${s === 'locked' ? `, locked: win ${badgeLabel(stake - 1)} to unlock` : s === 'earned' ? ', earned' : ''}`}
              onMouseEnter={() => setHover(stake)}
              onFocus={() => setHover(stake)}
              onBlur={() => setHover(null)}
              onClick={() => {
                if (s === 'locked') { setPinned(stake); return; }
                setPinned(null);
                onChange(stake);
              }}
              className={`focus-ring group relative flex flex-col items-center gap-1 rounded-xl py-1.5 transition-[background-color,transform] duration-150
                ${s === 'locked' ? 'cursor-help' : 'cursor-pointer'} ${looking ? 'bg-panel-hi' : 'hover:bg-panel'}`}
            >
              {/* The track to the previous badge (one row from sm up): lit up to the highest unlocked badge. */}
              {stake > 1 && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[calc(50%-0.6rem)] right-1/2 z-0 hidden h-1 w-full rounded-full sm:block ${stake <= unlocked ? 'bg-poke-yellow-dark' : 'bg-edge-dark'}`}
                />
              )}
              <span className={`relative z-10 transition-transform duration-150 ${on ? '-translate-y-1 scale-110' : 'group-hover:-translate-y-0.5'}`}>
                <BadgeEmblem stake={stake} state={s} size={44} />
              </span>
              <span className={`relative font-display text-sm font-bold leading-none tabular-nums ${on ? 'text-poke-yellow' : s === 'locked' ? 'text-faint' : 'text-ink'}`}>
                {stake}
              </span>
              {on && <span aria-hidden="true" className="absolute -bottom-1 h-1 w-6 rounded-full bg-poke-yellow" />}
            </button>
          );
        })}
      </div>

      {/* What the badge in view brings. Keyed so each new badge pops in. */}
      <div key={shown} className={`anim-pick-in mt-4 rounded-xl border-2 p-3 sm:p-4 ${state === 'locked' ? 'border-dashed border-edge bg-panel-inset' : 'border-edge-dark bg-panel-inset'}`}>
        <div className="flex gap-3 sm:gap-4">
          <BadgeEmblem stake={shown} state={state} size={76} className={state === 'locked' ? '' : 'drop-shadow-[0_4px_0_var(--color-edge-dark)]'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-bold uppercase tracking-wide text-muted">{badgeLabel(shown)}</span>
              {shown === value && <span className="rounded-full bg-poke-yellow px-2 py-px font-display text-xs font-bold uppercase text-cream-ink">Selected</span>}
              {state === 'earned' && <span className="rounded-full border border-poke-yellow-dark px-2 py-px font-display text-xs font-bold uppercase text-poke-yellow">Earned</span>}
              {state === 'locked' && <span className="rounded-full bg-edge-dark px-2 py-px font-display text-xs font-bold uppercase text-muted">Locked</span>}
            </div>
            <h3 className="font-display text-2xl font-bold leading-tight">{badgeName(shown)}</h3>
            <p className="mt-1 border-l-4 pl-2 text-sm" style={{ borderColor: badgeOf(shown).color }}>
              <span className="font-bold">{shown === 1 ? 'The base game. ' : 'New: '}</span>{rule}
            </p>
          </div>
        </div>

        {shown > 1 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Also in force</div>
            <ul className="flex flex-wrap gap-1.5">
              {STAKES.slice(1, shown - 1).map((s) => (
                <li key={s.stake} title={s.rule} className="flex items-center gap-1 rounded-full bg-panel px-2 py-0.5 text-xs font-semibold">
                  <BadgeEmblem stake={s.stake} state={stateOf(s.stake)} size={14} />
                  {s.label}
                </li>
              ))}
              {shown === 2 && <li className="text-xs text-muted">Nothing else: this is the first step up.</li>}
            </ul>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mode === 'run' ? (
            <>
              <Fixed label="Coaches" value={league.teams} />
              <Fixed label="Weeks" value={league.weeks} />
              <Fixed label="Playoffs" value={`Top ${league.playoffTeams}`} />
              <Fixed label="Losses allowed" value={league.lossCap} />
            </>
          ) : (
            <>
              <Fixed label="Losses allowed" value={league.lossCap} />
              <Fixed label="Playoffs" value={`Top ${league.playoffTeams}`} />
              <Fixed label="AI budget" value={league.budget + aiBonus} />
              <Fixed label="Your budget" value={league.budget} />
            </>
          )}
        </div>
        {mode === 'run' && (
          <p className="mt-2 text-sm text-muted">
            {league.budget} draft points{aiBonus > 0 ? ` (AI coaches get ${league.budget + aiBonus})` : ''} · {league.rosterMin}–{league.rosterMax} mons
            · Gen 9 rules, {league.teraCaptains} Tera captains · {league.freeAgencyMoves} free-agency moves
          </p>
        )}

        <p className="mt-3 text-sm text-muted">
          {footer}
          {state === 'locked' && pinned !== null && (
            <button type="button" onClick={() => setPinned(null)} className="focus-ring rounded font-bold text-poke-yellow underline">
              Back to {badgeLabel(value)}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}
