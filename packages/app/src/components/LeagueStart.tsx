// The parts every new league asks for, on the Badge Run and Custom League screens alike: your team's name and tag,
// and the league code (the seed).
import { Crest, GameButton, Panel } from './ui';
import { leagueCode, randomSeed } from '../game/names';

export function TeamPanel({ name, abbrev, onName, onAbbrev }: {
  name: string; abbrev: string; onName: (v: string) => void; onAbbrev: (v: string) => void;
}) {
  return (
    <Panel title="Your team">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Crest abbrev={abbrev.trim().toUpperCase() || '???'} size={72} side="you" />
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_8rem]">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">Team name</span>
            <input className="field" value={name} maxLength={32} onChange={(e) => onName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">Tag</span>
            <input
              className="field font-display text-lg font-bold uppercase tracking-widest"
              value={abbrev}
              maxLength={3}
              onChange={(e) => onAbbrev(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
          </label>
        </div>
      </div>
    </Panel>
  );
}

export function LeagueCodeField({ code, onChange }: { code: string; onChange: (v: string) => void }) {
  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="field flex-1 font-display text-lg font-bold uppercase tracking-widest"
          value={code}
          maxLength={7}
          aria-label="League code"
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        <GameButton variant="ghost" onClick={() => onChange(leagueCode(randomSeed()))}>Reroll</GameButton>
      </div>
      <p className="mt-2 text-sm text-muted">Same code, same coaches, draft order and schedule. Share it to race a friend.</p>
    </>
  );
}

/** "Valid team name and tag": two characters of name, a three-character tag. */
export const teamValid = (name: string, abbrev: string): boolean =>
  name.trim().length >= 2 && /^[A-Z0-9]{3}$/.test(abbrev.trim().toUpperCase());
