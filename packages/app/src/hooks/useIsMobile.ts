import { useSyncExternalStore } from 'react';
import { useSettings } from '../store/settings';

/** Phone layouts kick in below Tailwind's `md` breakpoint (768px). */
export const MOBILE_QUERY = '(max-width: 767px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
}

/** True while a CSS media query matches; re-renders when it flips. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(subscribe(query), () => window.matchMedia(query).matches, () => false);
}

/** True on phone-width viewports, where screens render their alternate layout. */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/** True on short landscape phones (field and actions sit side by side in battle). */
export function useIsLandscapePhone(): boolean {
  return useMediaQuery('(orientation: landscape) and (max-height: 540px)');
}

/** True when the app setting or the OS asks for reduced motion: animations are skipped, not just shortened. */
export function useReducedMotion(): boolean {
  const setting = useSettings((s) => s.reducedMotion);
  const system = useMediaQuery(REDUCED_MOTION_QUERY);
  return setting || system;
}
