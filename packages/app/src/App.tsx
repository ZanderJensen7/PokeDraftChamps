import { lazy, Suspense, useEffect, useState } from 'react';
import { humanCoach } from '@pdc/engine';
import { useGame, weekLabel, type Screen } from './store/useGame';
import { useSettings } from './store/settings';
import { APP_VERSION } from './app/version';
import { BugReport } from './components/BugReport';
import { MonDetailHost } from './components/MonDetail';
import { GameButton, ResponsiveDialog, PokeBallLogo } from './components/ui';
import { leagueCode } from './game/names';
import { badgeLabel } from './game/badges';
import { TitleScreen } from './screens/TitleScreen';
import { SetupScreen } from './screens/SetupScreen';
import { BadgeRunScreen } from './screens/BadgeRunScreen';
import { DraftScreen } from './screens/DraftScreen';
import { HubScreen } from './screens/HubScreen';
import { TeamScreen } from './screens/TeamScreen';
import { PrepScreen } from './screens/PrepScreen';
import { RecapScreen } from './screens/RecapScreen';
import { EndScreen } from './screens/EndScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { DailyScreen } from './screens/DailyScreen';
import { HallOfFameScreen } from './screens/HallOfFameScreen';
import { PokedexScreen } from './screens/PokedexScreen';
import { BottomNav, useShowBottomNav } from './components/BottomNav';
import { useHeightVar } from './hooks/useHeightVar';
import { useIsLandscapePhone } from './hooks/useIsMobile';

// The live battle (and @pkmn/sim behind it) loads on first use, outside the initial chunk.
const LazyBattleScreen = lazy(() => import('./screens/BattleScreen').then((m) => ({ default: m.BattleScreen })));

function BattleRoute() {
  return (
    <Suspense fallback={<div className="dialogue mx-auto max-w-2xl px-5 py-4 font-display text-xl font-bold">Loading battle…</div>}>
      <LazyBattleScreen />
    </Suspense>
  );
}

// Replays share the battle stage, so they load with it (the sim itself stays out: a replay only reads the log).
const LazyReplayScreen = lazy(() => import('./screens/ReplayScreen').then((m) => ({ default: m.ReplayScreen })));

function ReplayRoute() {
  return (
    <Suspense fallback={<div className="dialogue mx-auto max-w-2xl px-5 py-4 font-display text-xl font-bold">Loading replay…</div>}>
      <LazyReplayScreen />
    </Suspense>
  );
}

const SCREENS: Record<Screen, () => React.JSX.Element | null> = {
  title: TitleScreen,
  badgerun: BadgeRunScreen,
  setup: SetupScreen,
  draft: DraftScreen,
  hub: HubScreen,
  team: TeamScreen,
  prep: PrepScreen,
  battle: BattleRoute,
  recap: RecapScreen,
  end: EndScreen,
  settings: SettingsScreen,
  analytics: AnalyticsScreen,
  daily: DailyScreen,
  hall: HallOfFameScreen,
  dex: PokedexScreen,
  replay: ReplayRoute,
};

function TopBar() {
  const run = useGame((s) => s.run);
  const screen = useGame((s) => s.screen);
  const go = useGame((s) => s.go);
  const openOverlay = useGame((s) => s.openOverlay);
  const navShown = useShowBottomNav();
  const [bug, setBug] = useState(false);
  // Publish the bar's height so phone screens can stick their own bars right under it.
  const headerRef = useHeightVar('--topbar-h');
  const human = run ? humanCoach(run) : null;
  const phaseText = !run
    ? ''
    : run.phase === 'draft'
      ? `Draft · Round ${Math.min(run.draft.round, run.config.rosterMax)}`
      : run.phase === 'champion' ? 'Champion'
        : run.phase === 'eliminated' ? 'Run over'
          : weekLabel(run);
  return (
    <header ref={headerRef} className="pt-safe sticky top-0 z-40 border-b-4 border-edge-dark bg-panel/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-1.5 sm:gap-3 sm:px-4 sm:py-2">
        <button type="button" onClick={() => go('title')} className="focus-ring flex min-h-11 shrink-0 items-center gap-2 rounded-lg" aria-label="Title screen">
          <PokeBallLogo size={32} />
          <span className="hidden font-display text-lg font-bold leading-none text-poke-yellow sm:inline">
            PokeDraft<span className="text-ink">Champs</span>
          </span>
        </button>
        {run && (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <span className="hidden truncate text-muted md:inline">
              {run.daily
                ? `Daily league · ${run.daily.date}`
                : `${run.config.stake > 1 ? `${badgeLabel(run.config.stake)} · ` : ''}${run.config.teams}-team league · code ${leagueCode(run.seed)}`}
            </span>
            <span className="truncate rounded-full bg-panel-inset px-3 py-1 font-display font-bold text-poke-yellow">{phaseText}</span>
            {human && <span className="shrink-0 rounded-md bg-you px-2 py-1 font-display font-bold">{human.abbrev}</span>}
          </div>
        )}
        {!run && <div className="flex-1" />}
        <GameButton variant="ghost" size="sm" onClick={() => setBug(true)} aria-label="Report a bug" title="Report a bug" className="min-h-11 min-w-11 md:min-h-0 md:min-w-0">
          🐞
        </GameButton>
        {screen !== 'settings' && (
          <GameButton
            variant="ghost"
            size="sm"
            onClick={() => openOverlay('settings')}
            aria-label="Settings"
            className={`min-h-11 min-w-11 md:min-h-0 md:min-w-0 ${navShown ? 'max-md:hidden' : ''}`}
          >
            ⚙
          </GameButton>
        )}
      </div>
      {bug && <BugReport onClose={() => setBug(false)} />}
    </header>
  );
}

function Toast() {
  const toast = useGame((s) => s.toast);
  const setToast = useGame((s) => s.setToast);
  const screen = useGame((s) => s.screen);
  const navShown = useShowBottomNav();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast, setToast]);
  if (!toast) return null;
  // Phones: clear the bottom nav; in battle and draft drop from the top so the pinned controls stay tappable.
  const place = navShown
    ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-4'
    : screen === 'battle' || screen === 'replay' || screen === 'draft'
      ? 'top-[calc(4rem+env(safe-area-inset-top))] md:top-auto md:bottom-4'
      : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]';
  return (
    <div className={`fixed inset-x-0 ${place} z-[60] flex justify-center px-4`} role="status">
      <button type="button" onClick={() => setToast(null)} className="dialogue max-w-md px-4 py-3 text-left font-semibold">
        {toast}
      </button>
    </div>
  );
}

/** Tiny version string in the bottom-right corner of every screen; tapping it opens Settings (About). */
function VersionBadge() {
  const screen = useGame((s) => s.screen);
  const openOverlay = useGame((s) => s.openOverlay);
  const navShown = useShowBottomNav();
  // Phones: sit above the bottom nav when it is shown; in battle (and replays) the bottom bar is pinned, so hide the badge there.
  if (screen === 'battle' || screen === 'replay') return null;
  const place = navShown ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-1' : 'bottom-[calc(0.25rem+env(safe-area-inset-bottom))]';
  return (
    <button
      type="button"
      onClick={() => { if (screen !== 'settings') openOverlay('settings'); }}
      title={`${APP_VERSION.label} · built ${APP_VERSION.builtAt}`}
      aria-label={`Version ${APP_VERSION.version}, open settings`}
      className={`fixed right-2 ${place} z-30 rounded px-1 font-mono text-[10px] leading-4 text-faint opacity-70 hover:opacity-100 focus-visible:opacity-100`}
    >
      v{APP_VERSION.version} · {APP_VERSION.commit}
    </button>
  );
}

/** Shown when the player tries to leave a live battle: leaving forfeits it, so playMatch never hangs. */
function LeaveBattleConfirm() {
  const to = useGame((s) => s.leaveBattleTo);
  const confirm = useGame((s) => s.confirmLeaveBattle);
  if (!to) return null;
  return (
    <ResponsiveDialog
      title="Leave this battle?"
      onClose={() => confirm(false)}
      footer={(
        <>
          <GameButton variant="secondary" onClick={() => confirm(false)}>KEEP FIGHTING</GameButton>
          <GameButton variant="danger" onClick={() => confirm(true)}>FORFEIT & LEAVE</GameButton>
        </>
      )}
    >
      <p>Leaving forfeits the match. It counts as a loss.</p>
    </ResponsiveDialog>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  const reducedMotion = useSettings((s) => s.reducedMotion);
  const Current = SCREENS[screen];
  const navShown = useShowBottomNav();
  // Short landscape phones keep the phone gutters: the battle layout fills the height to the pixel.
  const landscapePhone = useIsLandscapePhone();
  const gutters = landscapePhone
    ? (navShown ? 'pb-nav' : 'pb-safe-3')
    : `sm:px-4 sm:py-6 ${navShown ? 'pb-nav md:pb-6' : 'pb-safe-3 sm:pb-6'}`;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);
  return (
    <div className={`min-h-screen ${reducedMotion ? 'reduce-motion' : ''}`}>
      {screen !== 'title' && <TopBar />}
      <main className={`mx-auto max-w-6xl px-3 py-3 ${gutters} ${screen === 'title' ? 'pt-safe' : ''}`}>
        <Current />
      </main>
      {navShown && <BottomNav />}
      <VersionBadge />
      <MonDetailHost />
      <LeaveBattleConfirm />
      <Toast />
    </div>
  );
}
