import { useEffect, type ReactNode } from 'react';
import { Panel } from './Panel';
import { GameButton } from './GameButton';

interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Centered panel over a dimmed backdrop. Escape closes. */
export function Modal({ title, onClose, children, footer, wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg-deep/80 px-4 py-8" onClick={onClose}>
      <div className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <Panel
          title={title}
          aside={<GameButton variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</GameButton>}
        >
          {children}
          {footer && <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>}
        </Panel>
      </div>
    </div>
  );
}
