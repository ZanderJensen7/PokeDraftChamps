import { useRef, useState } from 'react';
import { useGame } from '../store/useGame';
import { APP_VERSION } from '../app/version';
import { BugReport } from '../components/BugReport';
import { DialogueBox, GameButton, ResponsiveDialog, PokeBallLogo, PokeSprite } from '../components/ui';

const PARADE = ['Great Tusk', 'Dragapult', 'Gholdengo', 'Kingambit', 'Iron Valiant', 'Meowscarada'];

function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <ResponsiveDialog title="How to play" onClose={onClose} footer={<GameButton onClick={onClose}>Got it</GameButton>}>
      <ol className="space-y-3 text-base">
        <li><b className="text-poke-yellow">1. Set up a league.</b> Pick 8, 12 or 16 coaches, the season length and how many losses you can take.</li>
        <li><b className="text-poke-yellow">2. Draft.</b> A snake draft with a 120-point budget. Stronger Pokemon cost more. Build 11 mons, then choose your captains: Tera captains may Terastallize, Z captains hold a Z-Crystal. Leagues with Megas let you draft Mega forms.</li>
        <li><b className="text-poke-yellow">3. Play the season.</b> Each week, study your opponent in the Prep doc (their roster is public), bring 6, and battle. Every other match simulates.</li>
        <li><b className="text-poke-yellow">4. Make the playoffs.</b> Top seeds play single elimination. Win the final to become champion.</li>
        <li><b className="text-poke-yellow">Run over</b> if you pass the loss cap, miss the playoffs, or lose a playoff match. Two free-agency moves per season let you patch holes.</li>
        <li><b className="text-poke-yellow">Daily League.</b> One shorter league a day, the same for everyone: same coaches, same AI picks. One attempt per day; post your score to the daily leaderboard. It saves separately, so your own league stays put.</li>
      </ol>
      <DialogueBox className="mt-4">Your run saves automatically in this browser. Export it from Settings to keep a copy.</DialogueBox>
    </ResponsiveDialog>
  );
}

export function TitleScreen() {
  const hasSave = useGame((s) => s.hasSave);
  const run = useGame((s) => s.run);
  const go = useGame((s) => s.go);
  const continueRun = useGame((s) => s.continueRun);
  const importSave = useGame((s) => s.importSave);
  const openOverlay = useGame((s) => s.openOverlay);
  const [howTo, setHowTo] = useState(false);
  const [bug, setBug] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center gap-8 py-8 text-center">
      <div className="flex flex-col items-center gap-4">
        <PokeBallLogo size={112} />
        <h1 className="font-display text-[2.6rem] font-bold leading-none tracking-tight text-poke-yellow drop-shadow-[0_4px_0_var(--color-edge-dark)] min-[400px]:text-5xl sm:text-6xl">
          PokeDraft<span className="text-ink">Champs</span>
        </h1>
        <p className="max-w-md text-lg font-semibold text-muted">Draft a roster. Survive the season. Win the league.</p>
        <span className="rounded-full border-2 border-poke-yellow-dark bg-panel-inset px-3 py-0.5 font-display text-sm font-bold uppercase tracking-wide text-poke-yellow">Early build</span>
      </div>

      <div className="flex flex-wrap items-end justify-center gap-1 opacity-90" aria-hidden="true">
        {PARADE.map((n) => <PokeSprite key={n} name={n} size={72} />)}
      </div>

      <nav className="flex w-full max-w-xs flex-col gap-3">
        {hasSave && (
          <GameButton size="lg" block onClick={() => (run && !run.daily ? go(run.phase === 'draft' ? 'draft' : run.phase === 'season' || run.phase === 'playoffs' ? 'hub' : 'end') : continueRun())}>
            Continue
          </GameButton>
        )}
        <GameButton size="lg" block variant={hasSave ? 'secondary' : 'primary'} onClick={() => go('setup')}>New League</GameButton>
        <GameButton size="lg" block variant="secondary" onClick={() => go('daily')}>Daily League</GameButton>
        <GameButton block variant="ghost" onClick={() => setHowTo(true)}>How to Play</GameButton>
        <GameButton block variant="ghost" onClick={() => setBug(true)}>Report a bug</GameButton>
        <GameButton block variant="ghost" onClick={() => fileRef.current?.click()}>Import Save</GameButton>
        <GameButton block variant="ghost" onClick={() => openOverlay('settings')}>Settings</GameButton>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importSave(f);
            e.target.value = '';
          }}
        />
      </nav>
      <p className="max-w-md text-xs text-faint">
        Free fan project. Pokemon and sprites belong to Nintendo, Game Freak and The Pokemon Company; sprites via Pokemon Showdown.
        <br />
        {APP_VERSION.label} · built {APP_VERSION.builtAt}
      </p>
      {howTo && <HowToPlay onClose={() => setHowTo(false)} />}
      {bug && <BugReport onClose={() => setBug(false)} />}
    </div>
  );
}
