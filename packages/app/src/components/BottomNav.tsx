import type { ReactNode } from 'react';
import { nextHumanMatch } from '@pdc/engine';
import { useGame, type Screen } from '../store/useGame';
import { hasPlayedMatches } from '../analytics/useAnalytics';

const NAV_SCREENS: readonly Screen[] = ['hub', 'team', 'prep', 'analytics', 'settings', 'recap', 'end'];
/** Screens an overlay can return to that sit outside the season loop. */
const OUTSIDE_LOOP: readonly Screen[] = ['title', 'badgerun', 'setup', 'draft', 'battle'];

/** True when the phone bottom nav should show (season screens only, never title/setup/draft/battle). */
export function useShowBottomNav(): boolean {
  const run = useGame((s) => s.run);
  const screen = useGame((s) => s.screen);
  const returnTo = useGame((s) => s.returnTo);
  if (!run || run.phase === 'draft') return false;
  if (!NAV_SCREENS.includes(screen)) return false;
  if ((screen === 'settings' || screen === 'team') && OUTSIDE_LOOP.includes(returnTo)) return false;
  return true;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  hub: <Icon><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></Icon>,
  team: <Icon><circle cx="12" cy="12" r="9" /><path d="M3 12h6M15 12h6" /><circle cx="12" cy="12" r="3" /></Icon>,
  prep: <Icon><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4" /><path d="M8.5 10h7M8.5 14h7M8.5 18h4" /></Icon>,
  analytics: <Icon><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></Icon>,
  settings: <Icon><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></Icon>,
};

/** Fixed phone navigation (below 768px): Hub / Team / Prep / Stats / Settings. */
export function BottomNav() {
  const run = useGame((s) => s.run);
  const screen = useGame((s) => s.screen);
  const go = useGame((s) => s.go);
  const openOverlay = useGame((s) => s.openOverlay);
  if (!run) return null;
  const over = run.phase === 'champion' || run.phase === 'eliminated';
  const canPrep = !over && !!nextHumanMatch(run);
  const canAnalytics = hasPlayedMatches(run);
  const items: { id: keyof typeof ICONS; label: string; active: boolean; disabled?: boolean; onClick: () => void }[] = [
    { id: 'hub', label: over ? 'Season' : 'Hub', active: screen === 'hub' || screen === 'recap' || screen === 'end', onClick: () => go(over ? 'end' : 'hub') },
    { id: 'team', label: 'Team', active: screen === 'team', onClick: () => openOverlay('team') },
    { id: 'prep', label: 'Prep', active: screen === 'prep', disabled: !canPrep, onClick: () => go('prep') },
    { id: 'analytics', label: 'Stats', active: screen === 'analytics', disabled: !canAnalytics, onClick: () => go('analytics') },
    { id: 'settings', label: 'Settings', active: screen === 'settings', onClick: () => openOverlay('settings') },
  ];
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t-4 border-edge-dark bg-panel/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={it.onClick}
              disabled={it.disabled}
              aria-current={it.active ? 'page' : undefined}
              className={`focus-ring flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 font-display text-[0.8rem] font-bold disabled:opacity-35 ${it.active ? 'text-poke-yellow' : 'text-muted active:text-ink'}`}
            >
              <span className={`flex h-7 w-11 items-center justify-center rounded-full ${it.active ? 'bg-panel-hi' : ''}`}>{ICONS[it.id]}</span>
              {it.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
