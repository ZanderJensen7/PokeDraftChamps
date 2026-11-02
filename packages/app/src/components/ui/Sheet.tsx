import { useEffect, type ReactNode } from 'react';
import { GameButton } from './GameButton';

interface SheetProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Fill the whole screen instead of rising from the bottom. */
  full?: boolean;
}

/** Phone bottom sheet (or full-screen panel). Escape or the backdrop closes it. */
export function Sheet({ title, onClose, children, footer, full }: SheetProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-bg-deep/80" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`anim-sheet-in flex w-full flex-col border-edge-dark bg-panel shadow-2xl
          ${full ? 'h-full pt-safe' : 'max-h-[85dvh] rounded-t-2xl border-x-4 border-t-4'}`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-edge-dark py-1 pr-1.5 pl-4">
          <h2 className="title-band text-lg leading-tight">{title}</h2>
          <GameButton variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11">✕</GameButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t-2 border-edge px-3 pt-3 pb-safe-3">{footer}</div>}
        {!footer && <div className="pb-safe shrink-0" />}
      </div>
    </div>
  );
}
