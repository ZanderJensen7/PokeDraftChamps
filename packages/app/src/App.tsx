import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react';
import { humanCoach } from '@pdc/engine';
import { useGame, weekLabel, type Screen } from './store/useGame';
import { useSettings } from './store/settings';
import { GameButton, ResponsiveDialog, PokeBallLogo } from './components/ui';
import { leagueCode } from './game/names';
import { TitleScreen } from './screens/TitleScreen';
import { SetupScreen } from './screens/SetupScreen';
import { DraftScreen } from './screens/DraftScreen';
import { HubScreen } from './screens/HubScreen';
import { TeamScreen } from './screens/TeamScreen';
import { PrepScreen } from './screens/PrepScreen';
import { RecapScreen } from './screens/RecapScreen';
import { EndScreen } from './screens/EndScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AnalyticsScreen } from './screens/AnalyticsScreen';
import { BottomNav, useShowBottomNav } from './components/BottomNav';

// The live battle (and @pkmn/sim behind it) loads on first use, outside the initial chunk.
const LazyBattleScreen = lazy(() => import('./screens/BattleScreen').then((m) => ({ default: m.BattleScreen })));

function BattleRoute() {
  return (
    <Suspense fallback={<div className="dialogue mx-auto max-w-2xl px-5 py-4 font-display text-xl font-bold">Loading battle…</div>}>
      <LazyBattleScreen />
    </Suspense>
  );
}

const SCREENS: Record<Screen, () => React.JSX.Element | null> = {
  title: TitleScreen,
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
};

function TopBar() {
  const run = useGame((s) => s.run);
  const screen = useGame((s) => s.screen);
  const go = useGame((s) => s.go);
  const openOverlay = useGame((s) => s.openOverlay);
  const navShown = useShowBottomNav();
  const headerRef = useRef<HTMLElement>(null);
  // Publish the bar's height so phone screens can stick their own bars right under it.
  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--topbar-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const human = run ? humanCoach(run) : null;
  const phaseText = !run
    ? ''
    : run.phase === 'draft'
      ? `Draft · Round ${Math.min(run.draft.round, run.config.rosterSize)}`
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
            <span className="hidden truncate text-muted md:inline">{run.config.teams}-team league · code {leagueCode(run.seed)}</span>
            <span className="truncate rounded-full bg-panel-inset px-3 py-1 font-display font-bold text-poke-yellow">{phaseText}</span>
            {human && <span className="shrink-0 rounded-md bg-you px-2 py-1 font-display font-bold">{human.abbrev}</span>}
          </div>
        )}
        {!run && <div className="flex-1" />}
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
    : screen === 'battle' || screen === 'draft'
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
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);
  return (
    <div className={`min-h-screen ${reducedMotion ? 'reduce-motion' : ''}`}>
      {screen !== 'title' && <TopBar />}
      <main className={`mx-auto max-w-6xl px-3 py-3 sm:px-4 sm:py-6 ${navShown ? 'pb-nav md:pb-6' : 'pb-safe-3 sm:pb-6'} ${screen === 'title' ? 'pt-safe' : ''}`}>
        <Current />
      </main>
      {navShown && <BottomNav />}
      <LeaveBattleConfirm />
      <Toast />
    </div>
  );
}
