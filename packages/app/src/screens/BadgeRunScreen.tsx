// Badge Run: the main way to play. Pick a badge, name your team, draft. The badge sets the whole league (its format
// and rules, engine badgeRunConfig); the knobs live on the Custom League screen.
import { useMemo, useState } from 'react';
import { badgeRunConfig, careerStats } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useProfile } from '../store/profile';
import { BackButton, DialogueBox, GameButton, Panel } from '../components/ui';
import { BadgeCase } from '../components/BadgeCase';
import { LeagueCodeField, TeamPanel, teamValid } from '../components/LeagueStart';
import { badgeLabel } from '../game/badges';
import { leagueCode, randomSeed, seedFromCode } from '../game/names';

export function BadgeRunScreen() {
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
  const [code, setCode] = useState(() => leagueCode(randomSeed()));

  const seed = seedFromCode(code);
  const valid = teamValid(name, abbrev) && seed !== null;

  const start = () => {
    if (!valid || seed === null) return;
    newLeague({ name: name.trim(), abbrev: abbrev.trim().toUpperCase(), seed, config: badgeRunConfig(stake) });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <BackButton onClick={() => go('title')} to="title screen" />
        <h1 className="title-band text-3xl">Badge Run</h1>
      </div>
      {hasSave && (
        <DialogueBox>Starting a new league replaces your current saved run. Export it from Settings first if you want to keep it.</DialogueBox>
      )}

      <Panel title="Badges">
        <BadgeCase mode="run" value={stake} unlocked={stakeUnlocked} titlesPerStake={titlesPerStake} onChange={setStake} />
      </Panel>

      <TeamPanel name={name} abbrev={abbrev} onName={setName} onAbbrev={setAbbrev} />

      <details className="game-panel group px-4 py-3">
        <summary className="focus-ring cursor-pointer rounded font-display font-bold uppercase tracking-wide text-muted">
          League code <span className="ml-1 font-normal normal-case tracking-normal">{code}</span>
        </summary>
        <div className="mt-3"><LeagueCodeField code={code} onChange={setCode} /></div>
      </details>

      <div className="flex flex-col sm:flex-row sm:justify-end">
        <GameButton size="lg" disabled={!valid} onClick={start}>Start {badgeLabel(stake)}</GameButton>
      </div>
    </div>
  );
}
