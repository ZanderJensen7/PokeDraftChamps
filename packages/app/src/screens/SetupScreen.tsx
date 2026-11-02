import { useState } from 'react';
import type { LeagueConfig } from '@pdc/engine';
import { DEFAULT_LEAGUE_CONFIG, validateLeagueConfig } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { Crest, DialogueBox, GameButton, Panel, Segmented } from '../components/ui';
import { leagueCode, randomSeed, seedFromCode } from '../game/names';

type Teams = LeagueConfig['teams'];

const PLAYOFF_OPTIONS: Record<Teams, number[]> = { 8: [4], 12: [4, 8], 16: [8] };

function Slider({ label, value, min, max, onChange, hint }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; hint: string;
}) {
  const id = `slider-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="font-display font-bold uppercase tracking-wide">{label}</label>
        <span className="font-display text-2xl font-bold text-poke-yellow tabular-nums">{value}</span>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
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

interface Preset { id: string; label: string; sub: string; megas: boolean; tera: number; z: number }
const PRESETS: Preset[] = [
  { id: 'gen9', label: 'Gen 9 Draft', sub: 'No Megas · 2 Tera', megas: false, tera: 2, z: 0 },
  { id: 'champs', label: 'Champs NatDex style', sub: 'Megas · 2 Tera · 2 Z', megas: true, tera: 2, z: 2 },
];

export function SetupScreen() {
  const newLeague = useGame((s) => s.newLeague);
  const go = useGame((s) => s.go);
  const hasSave = useGame((s) => s.hasSave);
  const [name, setName] = useState('Pallet Town Pidgeots');
  const [abbrev, setAbbrev] = useState('PAL');
  const [teams, setTeams] = useState<Teams>(DEFAULT_LEAGUE_CONFIG.teams);
  const [playoffTeams, setPlayoffTeams] = useState(DEFAULT_LEAGUE_CONFIG.playoffTeams);
  const [weeks, setWeeks] = useState(DEFAULT_LEAGUE_CONFIG.weeks);
  const [lossCap, setLossCap] = useState(DEFAULT_LEAGUE_CONFIG.lossCap);
  const [megas, setMegas] = useState(DEFAULT_LEAGUE_CONFIG.megas);
  const [teraCaptains, setTeraCaptains] = useState(DEFAULT_LEAGUE_CONFIG.teraCaptains);
  const [zCaptains, setZCaptains] = useState(DEFAULT_LEAGUE_CONFIG.zCaptains);
  const [rosterMin, setRosterMin] = useState(DEFAULT_LEAGUE_CONFIG.rosterMin);
  const [rosterMax, setRosterMax] = useState(DEFAULT_LEAGUE_CONFIG.rosterMax);
  const [captainMaxPoints, setCaptainMaxPoints] = useState(DEFAULT_LEAGUE_CONFIG.captainMaxPoints);
  const [code, setCode] = useState(() => leagueCode(randomSeed()));

  const seed = seedFromCode(code);
  const tag = abbrev.trim().toUpperCase();
  const config: LeagueConfig = {
    ...DEFAULT_LEAGUE_CONFIG, teams, weeks, playoffTeams, lossCap, megas, teraCaptains, zCaptains, rosterMin, rosterMax, captainMaxPoints,
  };
  const errors = validateLeagueConfig(config);
  const valid = name.trim().length >= 2 && /^[A-Z0-9]{3}$/.test(tag) && seed !== null && errors.length === 0;
  const activePreset = PRESETS.find((p) => p.megas === megas && p.tera === teraCaptains && p.z === zCaptains)?.id;
  const applyPreset = (p: Preset) => { setMegas(p.megas); setTeraCaptains(p.tera); setZCaptains(p.z); };

  const pickTeams = (t: Teams) => {
    setTeams(t);
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
        </div>
      </Panel>

      <Panel title="Season rules">
        <div className="grid gap-5 sm:grid-cols-2">
          <Slider label="Weeks" value={weeks} min={4} max={12} onChange={setWeeks} hint="Regular-season matches before the playoffs." />
          <Slider label="Loss cap" value={lossCap} min={2} max={6} onChange={setLossCap} hint={`Loss number ${lossCap + 1} ends the run.`} />
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
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Fixed label="Budget" value={DEFAULT_LEAGUE_CONFIG.budget} />
          <Fixed label="Free agency" value={DEFAULT_LEAGUE_CONFIG.freeAgencyMoves} />
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
