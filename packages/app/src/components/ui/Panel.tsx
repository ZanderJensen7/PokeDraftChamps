import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  /** Right side of the title band (counts, buttons). */
  aside?: ReactNode;
  variant?: 'raised' | 'inset';
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/** The bevelled "game box": navy panel, lighter border, darker bottom edge, optional title band. */
export function Panel({ title, aside, variant = 'raised', className = '', bodyClassName = '', children }: PanelProps) {
  return (
    <section className={`${variant === 'raised' ? 'game-panel' : 'game-inset'} min-w-0 ${className}`}>
      {(title || aside) && (
        <header className="flex items-center justify-between gap-3 border-b-2 border-edge-dark px-4 py-2">
          <h2 className="title-band text-lg leading-tight">{title}</h2>
          {aside && <div className="flex shrink-0 items-center gap-2 text-sm text-muted">{aside}</div>}
        </header>
      )}
      <div className={`p-3 sm:p-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
