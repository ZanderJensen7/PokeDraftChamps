import { useCallback, useRef } from 'react';

/**
 * Publishes an element's height as a CSS variable on <html> (`--topbar-h`, `--draftbar-h`), so other layouts can
 * stick under it or pad for it. Attach the returned ref; the variable follows resizes and clears on unmount.
 */
export function useHeightVar(name: string): (el: HTMLElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty(name);
      return;
    }
    const publish = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    observer.current = ro;
  }, [name]);
}
