import { useMemo, useRef, useState, type ReactNode } from 'react';
import { careerStats, computeStandings, dailyDate, MAX_STAKE, type RunState } from '@pdc/engine';
import { loadDailySave, loadLeagueSave, useGame, weekLabel } from '../store/useGame';
import { useProfile } from '../store/profile';
import { badgeLabel, badgeName } from '../game/badges';
import { APP_VERSION } from '../app/version';
import { BugReport } from '../components/BugReport';
import { isRunOver } from '../components/DailyBits';
import { BadgeEmblem, Crest, DialogueBox, GameButton, ResponsiveDialog, PokeBallLogo, PokeSprite } from '../components/ui';

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

/** Where a saved league stands, in one short line: "Week 3 of 9 · 2-1", "Drafting", "Champion". */
function runStatus(run: RunState): string {
  if (run.phase === 'draft') return 'Drafting';
  if (run.phase === 'champion') return 'Champion · season over';
  if (run.phase === 'eliminated') return 'Season over';
  const me = computeStandings(run.coaches, run.matches).find((r) => r.coach === run.humanId);
  return me ? `${weekLabel(run)} · ${me.wins}-${me.losses}` : weekLabel(run);
}

/** Small line icons for the utility row (24px grid, stroke follows currentColor). */
const ICONS: Record<'help' | 'settings' | 'import' | 'bug' | 'trophy' | 'calendar' | 'ball', ReactNode> = {
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.2 6.5l2.6 1.5M17.2 16l2.6 1.5M4.2 17.5l2.6-1.5M17.2 8l2.6-1.5" /></>,
  import: <><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" /></>,
  bug: <><rect x="7.5" y="8" width="9" height="12" rx="4.5" /><path d="M12 8v12M9.5 8a2.5 2.5 0 0 1 5 0M3.5 13h4M16.5 13h4M5 7.5l2.8 2M19 7.5l-2.8 2M5 19l2.8-2M19 19l-2.8-2" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8.5 20h7M9.5 17h5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /></>,
  ball: <><circle cx="12" cy="12" r="9" /><path d="M3 12h6M15 12h6" /><circle cx="12" cy="12" r="3" /></>,
};

function Icon({ name, size = 22, className = '' }: { name: keyof typeof ICONS; size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}
    >
      {ICONS[name]}
    </svg>
  );
}

function UtilityButton({ icon, label, onClick }: { icon: keyof typeof ICONS; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-muted transition-colors hover:bg-panel hover:text-ink"
    >
      <Icon name={icon} />
      <span className="font-display text-xs font-semibold uppercase tracking-wide">{label}</span>
    </button>
  );
}

export function TitleScreen() {
  const hasSave = useGame((s) => s.hasSave);
  const run = useGame((s) => s.run);
  const dailySaveDate = useGame((s) => s.dailySaveDate);
  const go = useGame((s) => s.go);
  const continueRun = useGame((s) => s.continueRun);
  const importSave = useGame((s) => s.importSave);
  const openOverlay = useGame((s) => s.openOverlay);
  const clearSave = useGame((s) => s.clearSave);
  const [howTo, setHowTo] = useState(false);
  const [ending, setEnding] = useState(false);
  const [bug, setBug] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The league the Continue card describes: the loaded one, else a peek at the save without loading it.
  const league = useMemo(() => (run && !run.daily ? run : hasSave ? loadLeagueSave() : null), [run, hasSave]);
  const today = dailyDate();
  const dailyNote = useMemo(() => {
    if (dailySaveDate !== today) return 'New today';
    const d = run?.daily?.date === today ? run : loadDailySave();
    return d && isRunOver(d) ? 'Played' : 'In progress';
  }, [dailySaveDate, today, run]);

  const onContinue = () => (run && !run.daily
    ? go(run.phase === 'draft' ? 'draft' : run.phase === 'season' || run.phase === 'playoffs' ? 'hub' : 'end')
    : continueRun());
  const human = league?.coaches.find((c) => c.id === league.humanId);
  // A finished league is history (the Hall of Fame has it): no Continue tile, just a small "Last run" row.
  const leagueOver = !!league && isRunOver(league);
  const stakeUnlocked = useProfile((s) => s.stakeUnlocked);
  const careerRuns = useProfile((s) => s.runs);
  const trophies = useProfile((s) => s.trophies);
  const earned = useMemo(
    () => careerStats({ version: 2, stakeUnlocked, runs: careerRuns, trophies }).titlesPerStake.filter((n) => n > 0).length,
    [stakeUnlocked, careerRuns, trophies],
  );
  // Custom leagues open once you have a badge (or any finished run, so older saves keep them): new players meet the
  // Badge Run first.
  const customOpen = stakeUnlocked > 1 || careerRuns.length > 0;

  return (
    <div className="flex min-h-[85vh] flex-col items-center justify-center gap-7 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <PokeBallLogo size={96} />
        <h1 className="font-display text-[2.6rem] font-bold leading-none tracking-tight text-poke-yellow drop-shadow-[0_4px_0_var(--color-edge-dark)] min-[400px]:text-5xl sm:text-6xl">
          PokeDraft<span className="text-ink">Champs</span>
        </h1>
        <p className="max-w-md text-lg font-semibold text-muted">Draft a roster. Survive the season. Win the league.</p>
      </div>

      {/* The parade stands on a lit stage instead of floating in the void. */}
      <div className="relative w-full max-w-md" aria-hidden="true">
        <div className="absolute inset-x-4 -bottom-2 h-7 rounded-[50%] bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--color-poke-yellow)_22%,transparent)_0%,transparent_70%)]" />
        <div className="relative flex items-end justify-center gap-0 min-[420px]:gap-1">
          {PARADE.map((n) => <PokeSprite key={n} name={n} size={68} />)}
        </div>
      </div>

      <nav className="flex w-full max-w-md flex-col gap-3" aria-label="Main menu">
        {hasSave && !leagueOver && (
          <button type="button" onClick={onContinue} className="menu-tile tile-continue items-center gap-3 px-4 py-3.5">
            {human ? <Crest abbrev={human.abbrev} size={44} side="you" /> : <Icon name="ball" size={36} />}
            <span className="min-w-0 flex-1">
              <span className="block font-display text-2xl font-bold uppercase leading-tight tracking-wide">Continue</span>
              {league && (
                <span className="block truncate text-sm font-bold opacity-75">
                  {human ? `${human.name} · ` : ''}{runStatus(league)}
                </span>
              )}
            </span>
            <span className="font-display text-3xl font-bold leading-none opacity-70" aria-hidden="true">›</span>
          </button>
        )}
        {hasSave && !leagueOver && (
          <button
            type="button"
            onClick={() => setEnding(true)}
            className="focus-ring -mt-1.5 self-end rounded px-1 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            End this run
          </button>
        )}

        <button type="button" onClick={() => go('badgerun')} className="menu-tile tile-league items-center gap-3.5 px-4 py-4">
          <BadgeEmblem stake={stakeUnlocked} state="open" size={52} className="drop-shadow-[0_3px_0_rgba(0,0,0,0.3)]" />
          <span className="min-w-0 flex-1">
            <span className="block font-display text-2xl font-bold uppercase leading-tight tracking-wide">Badge Run</span>
            <span className="block truncate text-sm font-bold text-ink/80">
              {earned === 0 ? `Earn your first badge · ${badgeName(1)}` : `Next: ${badgeLabel(stakeUnlocked)} · ${earned}/${MAX_STAKE} earned`}
            </span>
          </span>
          <span className="font-display text-3xl font-bold leading-none opacity-70" aria-hidden="true">›</span>
          <BadgeEmblem stake={stakeUnlocked} state="open" size={120} className="tile-mark" />
        </button>
        {hasSave && leagueOver && league && (
          <div className="-mt-1 flex items-center gap-2 rounded-xl bg-panel-inset px-3 py-2 text-left text-sm">
            {human && <Crest abbrev={human.abbrev} size={28} side="you" />}
            <span className="min-w-0 flex-1 truncate font-semibold">
              <span className="text-muted">Last run · </span>{human ? `${human.name} · ` : ''}{league.phase === 'champion' ? 'Champion' : 'Season over'}
            </span>
            <button type="button" onClick={onContinue} className="focus-ring rounded px-1 font-bold text-poke-yellow hover:underline">Results</button>
            <button type="button" onClick={() => clearSave('league')} className="focus-ring rounded px-1 text-xs font-semibold text-muted hover:text-ink hover:underline">Clear</button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => go('daily')} className="menu-tile tile-daily min-h-28 flex-col justify-between gap-2 p-3.5">
            <span className="flex items-start justify-between gap-2">
              <Icon name="calendar" size={26} />
              <span className="whitespace-nowrap rounded-full bg-black/25 px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide">{dailyNote}</span>
            </span>
            <span>
              <span className="block font-display text-xl font-bold uppercase leading-tight tracking-wide">Daily</span>
              <span className="block text-xs font-semibold text-ink/75">Same league for everyone</span>
            </span>
            <Icon name="calendar" size={96} className="tile-mark" />
          </button>
          <button
            type="button"
            onClick={() => customOpen && go('setup')}
            aria-disabled={!customOpen}
            className={`menu-tile min-h-28 flex-col justify-between gap-2 p-3.5 ${customOpen ? '' : 'cursor-not-allowed opacity-60 hover:filter-none'}`}
          >
            <Icon name="settings" size={26} />
            <span>
              <span className="block font-display text-xl font-bold uppercase leading-tight tracking-wide">Custom</span>
              <span className="block text-xs font-semibold text-muted">{customOpen ? 'Your rules, no badges' : `Earn the ${badgeName(1)} to unlock`}</span>
            </span>
            <Icon name="settings" size={96} className="tile-mark" />
          </button>
        </div>

        <button type="button" onClick={() => go('hall')} className="menu-tile items-center gap-3 px-4 py-3">
          <Icon name="trophy" size={26} className="text-poke-yellow" />
          <span className="flex-1 font-display text-lg font-bold uppercase tracking-wide">Hall of Fame</span>
          <span className="font-display text-2xl font-bold leading-none text-muted" aria-hidden="true">›</span>
        </button>

        <div className="mt-1 grid grid-cols-4 gap-1 border-t-2 border-edge-dark pt-3">
          <UtilityButton icon="help" label="How to play" onClick={() => setHowTo(true)} />
          <UtilityButton icon="settings" label="Settings" onClick={() => openOverlay('settings')} />
          <UtilityButton icon="import" label="Import" onClick={() => fileRef.current?.click()} />
          <UtilityButton icon="bug" label="Bug" onClick={() => setBug(true)} />
        </div>
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
        {APP_VERSION.label} · built {APP_VERSION.builtAt}
        <br />
        Free fan project. Pokemon and sprites belong to Nintendo, Game Freak and The Pokemon Company; sprites via Pokemon Showdown.
      </p>
      {howTo && <HowToPlay onClose={() => setHowTo(false)} />}
      {bug && <BugReport onClose={() => setBug(false)} />}
      {ending && (
        <ResponsiveDialog
          title="End this run?"
          onClose={() => setEnding(false)}
          footer={<><GameButton variant="ghost" onClick={() => setEnding(false)}>Keep playing</GameButton><GameButton variant="danger" onClick={() => { clearSave('league'); setEnding(false); }}>End run</GameButton></>}
        >
          <DialogueBox>
            Your league{human ? ` (${human.name})` : ''} is deleted for good and does not count in the Hall of Fame. Your daily run and career are not touched.
          </DialogueBox>
        </ResponsiveDialog>
      )}
    </div>
  );
}
