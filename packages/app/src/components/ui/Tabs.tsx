import { useEffect, useRef } from 'react';

interface TabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}

/**
 * Row of chunky menu tabs. Wraps from `md` up; on phones it is one swipeable row
 * that keeps the active tab centered.
 */
export function Tabs<T extends string>({ tabs, value, onChange }: TabsProps<T>) {
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !active || row.scrollWidth <= row.clientWidth) return;
    // Scroll the row only (never the page) so the active tab sits in the middle.
    const left = active.offsetLeft - row.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
    row.scrollTo({ left, behavior: 'smooth' });
  }, [value]);
  return (
    <div
      ref={rowRef}
      role="tablist"
      className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`game-btn min-h-11 shrink-0 px-3 py-1.5 text-sm whitespace-nowrap md:min-h-0 ${value === t.id ? 'btn-primary' : 'btn-ghost'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  options: readonly { value: T; label: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}

/** Card-style option picker (league size, sprite set). */
export function Segmented<T extends string | number>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.sub ? `${o.label} ${o.sub}` : o.label}
            onClick={() => onChange(o.value)}
            className={`focus-ring rounded-xl border-2 border-b-4 px-2 py-3 text-center transition-transform duration-150 active:translate-y-0.5
              ${on ? 'border-poke-yellow bg-panel-hi' : 'border-edge bg-panel-inset hover:bg-panel'}`}
          >
            <div className={`font-display text-2xl font-bold leading-tight max-sm:text-lg ${on ? 'text-poke-yellow' : 'text-ink'}`}>{o.label}</div>
            {o.sub && <div className="text-xs font-semibold text-muted">{o.sub}</div>}
          </button>
        );
      })}
    </div>
  );
}
