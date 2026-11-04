import { useMemo, useState } from 'react';
import type { LeagueConfig } from '@pdc/engine';
import { applyStake, careerStats, DEFAULT_LEAGUE_CONFIG, MAX_STAKE, minBudget, rulesAt, STAKES, validateLeagueConfig } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useProfile } from '../store/profile';
import { BadgeEmblem, Crest, DialogueBox, GameButton, Panel, Segmented } from '../components/ui';
import type { BadgeState } from '../components/ui';
import { badgeLabel, badgeName, badgeOf } from '../game/badges';
import { leagueCode, randomSeed, seedFromCode } from '../game/names';

type Teams = LeagueConfig['teams'];

const PLAYOFF_OPTIONS: Record<Teams, number[]> = { 8: [4], 12: [4, 8], 16: [8] };
/** Everyone plays everyone at most once (user ruling 2026-11-03), capped at 9 weeks for the bigger leagues. */
const defaultWeeks = (t: Teams) => Math.min(t - 1, 9);

const BUDGET_STEP = 5;
const BUDGET_MAX = 200;
const MAX_FREE_AGENCY = 6;

function Slider({ label, value, min, max, step = 1, onChange, hint }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; hint: string;
}) {
  const id = `slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-display font-bold uppercase tracking-wide">{label}</label>
        <span className="font-display text-2xl font-bold text-poke-yellow tabular-nums">{value}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      <div className="text-sm text-muted">{hint}</div>
    </div>
  );
}

function Fixed({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="game-inset flex flex-col items-center px-2 py-2">
      <span className="font-display text-2xl font-bold text-ink">{value}</span>
      <span className="text-xs font-bold uppercase tracking-wide text-muted">{label}</span>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-2" role="group" aria-label={label}>
          <GameButton variant="ghost" size="sm" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`} className="max-md:min-h-11 max-md:min-w-11">−</GameButton>
          <span className="w-8 text-center font-display text-2xl font-bold text-poke-yellow tabular-nums" aria-live="polite">{value}</span>
          <GameButton variant="ghost" size="sm" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More ${label}`} className="max-md:min-h-11 max-md:min-w-11">+</GameButton>
        </div>
      </div>
      <div className="text-sm text-muted">{hint}</div>
    </div>
  );
}

function Toggle({ label, on, onChange, hint }: { label: string; on: boolean; onChange: (v: boolean) => void; hint: string }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display font-bold uppercase tracking-wide">{label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => onChange(!on)}
          className={`focus-ring relative h-8 w-16 rounded-full border-2 transition-colors duration-150 ${on ? 'border-poke-yellow bg-crest-3' : 'border-edge bg-panel-inset'}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full border-2 border-cream-ink bg-cream transition-[left] duration-150 ${on ? 'left-8' : 'left-0.5'}`} />
          <span className="sr-only">{on ? 'On' : 'Off'}</span>
        </button>
      </div>
      <div className="text-sm text-muted">{hint}</div>
    </div>
  );
}

/**
 * The badge case: every badge (stake) in a row, earned / open / locked. Hover, focus or click any of them to see what
 * it brings, locked ones too; only an unlocked badge can be picked for the run.
 */
function BadgeCase({ value, unlocked, titlesPerStake, config, onChange }: {
  value: number; unlocked: number; titlesPerStake: number[]; config: LeagueConfig; onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const shown = hover ?? pinned ?? value;
  const stateOf = (stake: number): BadgeState =>
    stake > unlocked ? 'locked' : (titlesPerStake[stake - 1] ?? 0) > 0 ? 'earned' : 'open';
  const state = stateOf(shown);
  const effective = applyStake({ ...config, stake: shown });
  const rules = rulesAt(shown);
  const { rule } = STAKES[shown - 1]!;
  const earnedCount = titlesPerStake.filter((n) => n > 0).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 text-sm">
        <span className="text-muted">Win the title to earn a badge and unlock the next.</span>
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
              {shown === value && <span className="rounded-full bg-poke-yellow px-2 py-px font-display text-xs font-bold uppercase text-cream-ink">Your league</span>}
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
          <Fixed label="Loss cap" value={effective.lossCap} />
          <Fixed label="Playoffs" value={`Top ${effective.playoffTeams}`} />
          <Fixed label="AI budget" value={effective.budget + rules.aiBudgetBonus} />
          <Fixed label="Your budget" value={effective.budget} />
        </div>

        <p className="mt-3 text-sm text-muted">
          {state === 'locked'
            ? <>Preview only. Win the title at {badgeLabel(shown - 1)} to unlock it.{' '}</>
            : shown === value && state === 'open'
              ? `Win the title here to earn the ${badgeName(shown)}${shown < MAX_STAKE ? ` and unlock ${badgeLabel(shown + 1)}` : ''}.`
              : shown !== value ? 'Click to play at this badge.' : `You have earned the ${badgeName(shown)}. Play it again or climb higher.`}
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

interface Preset { id: string; label: string; sub: string; megas: boolean; tera: number; z: number }
const PRESETS: Preset[] = [
  { id: 'gen9', label: 'Gen 9 Draft', sub: 'No Megas · 2 Tera', megas: false, tera: 2, z: 0 },
  { id: 'champs', label: 'Champs NatDex style', sub: 'Megas · 2 Tera · 2 Z', megas: true, tera: 2, z: 2 },
];

export function SetupScreen() {
  const newLeague = useGame((s) => s.newLeague);
  const go = useGame((s) => s.go);
  const hasSave = useGame((s) => s.hasSave);
  const stakeUnlocked = useProfile((s) => s.stakeUnlocked);
  const runs = useProfile((s) => s.runs);
  const trophies = useProfile((s) => s.trophies);
  const { titlesPerStake } = useMemo(() => careerStats({ version: 2, stakeUnlocked, runs, trophies }), [stakeUnlocked, runs, trophies]);
  const [stake, setStake] = useState(stakeUnlocked);
  const [name, setName] = useState('Pallet Town Pidgeots');
  const [abbrev, setAbbrev] = useState('PAL');
  const [teams, setTeams] = useState<Teams>(DEFAULT_LEAGUE_CONFIG.teams);
  const [playoffTeams, setPlayoffTeams] = useState(DEFAULT_LEAGUE_CONFIG.playoffTeams);
  const [weeks, setWeeks] = useState(() => defaultWeeks(DEFAULT_LEAGUE_CONFIG.teams));
  const [weeksTouched, setWeeksTouched] = useState(false);
  const [lossCap, setLossCap] = useState(DEFAULT_LEAGUE_CONFIG.lossCap);
  const [megas, setMegas] = useState(DEFAULT_LEAGUE_CONFIG.megas);
  const [teraCaptains, setTeraCaptains] = useState(DEFAULT_LEAGUE_CONFIG.teraCaptains);
  const [zCaptains, setZCaptains] = useState(DEFAULT_LEAGUE_CONFIG.zCaptains);
  const [rosterMin, setRosterMin] = useState(DEFAULT_LEAGUE_CONFIG.rosterMin);
  const [rosterMax, setRosterMax] = useState(DEFAULT_LEAGUE_CONFIG.rosterMax);
  const [captainMaxPoints, setCaptainMaxPoints] = useState(DEFAULT_LEAGUE_CONFIG.captainMaxPoints);
  const [budgetPicked, setBudget] = useState(DEFAULT_LEAGUE_CONFIG.budget);
  const [freeAgencyMoves, setFreeAgencyMoves] = useState(DEFAULT_LEAGUE_CONFIG.freeAgencyMoves);
  const [code, setCode] = useState(() => leagueCode(randomSeed()));

  const seed = seedFromCode(code);
  const tag = abbrev.trim().toUpperCase();
  // The slider starts at the first step of 5 that fills a roster of rosterMin; a bigger roster or Megas moving that
  // floor up pulls the budget with it, so the screen never sits on a budget the validator would refuse.
  const floor = useMemo(() => minBudget(rosterMin, megas), [rosterMin, megas]);
  const budgetMin = Math.ceil(floor.need / BUDGET_STEP) * BUDGET_STEP;
  const budget = Math.min(BUDGET_MAX, Math.max(budgetPicked, budgetMin));
  const config: LeagueConfig = {
    ...DEFAULT_LEAGUE_CONFIG, teams, weeks, playoffTeams, lossCap, megas, teraCaptains, zCaptains, rosterMin, rosterMax, captainMaxPoints, stake,
    budget, freeAgencyMoves,
  };
  // What the run will actually play: the stake tightens the loss cap and the bracket where it is stricter.
  const effective = applyStake(config);
  const stakeRules = rulesAt(stake);
  const errors = validateLeagueConfig(config);
  const valid = name.trim().length >= 2 && /^[A-Z0-9]{3}$/.test(tag) && seed !== null && errors.length === 0;
  const activePreset = PRESETS.find((p) => p.megas === megas && p.tera === teraCaptains && p.z === zCaptains)?.id;
  const applyPreset = (p: Preset) => { setMegas(p.megas); setTeraCaptains(p.tera); setZCaptains(p.z); };

  const pickTeams = (t: Teams) => {
    setTeams(t);
    setWeeks(weeksTouched ? Math.min(weeks, t - 1) : defaultWeeks(t));
    const opts = PLAYOFF_OPTIONS[t];
    if (!opts.includes(playoffTeams)) setPlayoffTeams(opts[opts.length - 1]!);
  };

  const start = () => {
    if (!valid || seed === null) return;
    newLeague({
      name: name.trim(),
      abbrev: tag,
      seed,
      config,
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="title-band text-3xl">League setup</h1>
      {hasSave && (
        <DialogueBox>Starting a new league replaces your current saved run. Export it from Settings first if you want to keep it.</DialogueBox>
      )}

      <Panel title="Your team">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Crest abbrev={tag || '???'} size={72} side="you" />
          <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_8rem]">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Team name</span>
              <input className="field" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">Tag</span>
              <input
                className="field font-display text-lg font-bold uppercase tracking-widest"
                value={abbrev}
                maxLength={3}
                onChange={(e) => setAbbrev(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </label>
          </div>
        </div>
      </Panel>

      <Panel title="Badges">
        <BadgeCase value={stake} unlocked={stakeUnlocked} titlesPerStake={titlesPerStake} config={config} onChange={setStake} />
      </Panel>

      <Panel title="League size">
        <Segmented
          label="League size"
          value={teams}
          onChange={pickTeams}
          options={[
            { value: 8 as Teams, label: '8', sub: 'coaches' },
            { value: 12 as Teams, label: '12', sub: 'coaches' },
            { value: 16 as Teams, label: '16', sub: 'coaches' },
          ]}
        />
        <div className="mt-3">
          <div className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">Playoff bracket</div>
          <Segmented
            label="Playoff teams"
            value={playoffTeams}
            onChange={setPlayoffTeams}
            options={PLAYOFF_OPTIONS[teams].map((n) => ({ value: n, label: `Top ${n}`, sub: n === 4 ? '2 rounds' : '3 rounds' }))}
          />
          {effective.playoffTeams < playoffTeams && (
            <p className="mt-1 text-sm font-semibold text-poke-yellow">{badgeLabel(stake)}: only the top {effective.playoffTeams} make the playoffs.</p>
          )}
        </div>
      </Panel>

      <Panel title="Season rules">
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider
            label="Weeks" value={weeks} min={4} max={teams - 1}
            onChange={(w) => { setWeeks(w); setWeeksTouched(true); }}
            hint="Regular-season matches before the playoffs. At most one match against each coach."
          />
          <Slider label="Loss cap" value={lossCap} min={2} max={6} onChange={setLossCap} hint={effective.lossCap < lossCap
            ? `${badgeLabel(stake)} caps it at ${effective.lossCap}: loss number ${effective.lossCap + 1} ends the run.`
            : `Loss number ${lossCap + 1} ends the run.`} />
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Stepper label="Roster min" value={rosterMin} min={6} max={14} onChange={setRosterMin} hint="Every coach drafts at least this many." />
          <Stepper
            label="Roster max"
            value={rosterMax}
            min={6}
            max={14}
            onChange={setRosterMax}
            hint={rosterMax === rosterMin ? 'Same as the min: every roster is this size.' : 'Past the min, a coach may stop drafting any time.'}
          />
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Slider
            label="Budget" value={budget} min={budgetMin} max={BUDGET_MAX} step={BUDGET_STEP} onChange={setBudget}
            hint={`${rosterMin} mons at the cheapest price (${floor.cheapest}) need ${floor.need}. Tier prices stay as they are.${stakeRules.aiBudgetBonus > 0
              ? ` ${badgeLabel(stake)}: AI coaches draft with ${budget + stakeRules.aiBudgetBonus}.` : ''}`}
          />
          <Stepper
            label="Free agency" value={freeAgencyMoves} min={0} max={MAX_FREE_AGENCY} onChange={setFreeAgencyMoves}
            hint={freeAgencyMoves === 0 ? 'No signings once the season starts.' : `${freeAgencyMoves} signing${freeAgencyMoves === 1 ? '' : 's'} per season.`}
          />
        </div>
      </Panel>

      <Panel title="Battle rules">
        <div className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">Presets</div>
        <Segmented
          label="Rule presets"
          value={activePreset ?? 'custom'}
          onChange={(id) => { const p = PRESETS.find((x) => x.id === id); if (p) applyPreset(p); }}
          options={PRESETS.map((p) => ({ value: p.id, label: p.label, sub: p.sub }))}
        />
        <div className="mt-4 grid gap-5 sm:grid-cols-3">
          <Toggle label="Mega Evolution" on={megas} onChange={setMegas} hint="Megas are drafted as their own picks; the base and its Mega can't be on one roster." />
          <Stepper label="Tera captains" value={teraCaptains} min={0} max={3} onChange={setTeraCaptains} hint="Only captains may Terastallize." />
          <Stepper label="Z captains" value={zCaptains} min={0} max={3} onChange={setZCaptains} hint="Z captains hold a Z-Crystal." />
        </div>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Stepper
            label="Captain cap"
            value={captainMaxPoints}
            min={1}
            max={20}
            onChange={setCaptainMaxPoints}
            hint={captainMaxPoints >= 20 ? 'No cap: any mon may be a captain.' : `Captains cost ${captainMaxPoints} points or less.`}
          />
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="mt-4 space-y-1 rounded-xl border-2 border-opp bg-opp-soft px-3 py-2 text-sm font-semibold text-ink">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </Panel>

      <Panel title="League code">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="field flex-1 font-display text-lg font-bold uppercase tracking-widest"
            value={code}
            maxLength={7}
            aria-label="League code"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <GameButton variant="ghost" onClick={() => setCode(leagueCode(randomSeed()))}>Reroll</GameButton>
        </div>
        <p className="mt-2 text-sm text-muted">Same code, same coaches, draft order and schedule. Share it to race a friend.</p>
      </Panel>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <GameButton variant="ghost" onClick={() => go('title')}>Back</GameButton>
        <GameButton size="lg" disabled={!valid} onClick={start}>Start Draft</GameButton>
      </div>
    </div>
  );
}
