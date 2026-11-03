import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 8;
const OVERLAP = 4;
const MIN_W = 240;

/**
 * The hover popover of a pool card (desktop). Portaled and fixed so no scroll box clips it; it sits under the card
 * and flips above when there is more room there, stays inside the viewport horizontally, and closes on scroll,
 * resize or Escape. The card is the parent of the placeholder this renders in place.
 */
export function CardPeek({ onDismiss, children }: { onDismiss: () => void; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const place = () => {
    const card = anchor.current?.parentElement;
    const el = box.current;
    if (!card || !el) return;
    const r = card.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(Math.max(r.width, MIN_W), vw - 2 * MARGIN);
    el.style.width = `${Math.round(w)}px`;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(MARGIN, r.left), vw - MARGIN - w);
    const below = vh - MARGIN - (r.bottom - OVERLAP);
    const above = r.top + OVERLAP - MARGIN;
    const top = h > below && above > below ? r.top + OVERLAP - h : r.bottom - OVERLAP;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - MARGIN - h)))}px`;
    el.style.visibility = 'visible';
  };

  useLayoutEffect(() => {
    place();
    // The role chips arrive after the popover opens and change its height.
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [onDismiss]);

  return (
    <>
      <span ref={anchor} className="hidden" aria-hidden />
      {createPortal(
        <div
          ref={box}
          role="tooltip"
          style={{ visibility: 'hidden' }}
          className="pointer-events-none fixed left-0 top-0 z-40 rounded-lg border-2 border-b-4 border-poke-yellow bg-panel-hi p-2 shadow-lg shadow-black/40"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
