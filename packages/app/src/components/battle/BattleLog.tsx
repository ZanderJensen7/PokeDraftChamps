import { useLayoutEffect, useRef, useState } from 'react';
import type { LogEntry, LogSeg } from '../../battle/narrate';
import { GameButton, typeColor } from '../ui';

interface BattleLogProps {
  entries: readonly LogEntry[];
  className?: string;
}

/** Within this many pixels of the bottom counts as "reading the latest": new lines keep it pinned. */
const STICK_PX = 24;

/** Showdown-style battle log: turn dividers, bold side-colored names, muted indented sub-lines, win banner. */
export function BattleLog({ entries, className = '' }: BattleLogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const stick = useRef(true);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_PX;
    stick.current = bottom;
    setAtBottom(bottom);
  };

  const jump = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stick.current = true;
    setAtBottom(true);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className={`relative min-h-0 ${className}`}>
      <div
        ref={ref}
        onScroll={onScroll}
        role="log"
        aria-live="off"
        aria-label="Battle log"
        className="game-inset h-full overflow-y-auto overscroll-contain px-3 py-2 text-sm leading-snug"
      >
        {entries.length === 0 && <p className="py-2 text-center text-muted">The battle is about to begin.</p>}
        {entries.map((e, i) => <Entry key={i} entry={e} />)}
      </div>
      {!atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <GameButton size="sm" variant="secondary" className="pointer-events-auto shadow-lg" onClick={jump}>
            Jump to latest
          </GameButton>
        </div>
      )}
    </div>
  );
}

function Segs({ segs }: { segs: readonly LogSeg[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.side ? (
          <strong key={i} className={s.side === 'p1' ? 'text-you' : 'text-opp'}>{s.text}</strong>
        ) : s.strong ? (
          <strong key={i}>{s.text}</strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Entry({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case 'turn':
      return (
        <div className="my-2 flex items-center gap-2 first:mt-0" role="separator">
          <span className="h-px flex-1 bg-edge" />
          <span className="font-display text-sm font-bold uppercase tracking-wide text-poke-yellow">{entry.segs[0]?.text}</span>
          <span className="h-px flex-1 bg-edge" />
        </div>
      );
    case 'win':
      return (
        <p className="mt-3 rounded-lg border-2 border-poke-yellow-dark bg-poke-yellow px-3 py-2 text-center font-display text-base font-bold text-cream-ink">
          {entry.segs.map((s, i) => (s.strong ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}
        </p>
      );
    case 'start':
      return <p className="py-1 text-center text-muted"><Segs segs={entry.segs} /></p>;
    case 'hp':
    case 'minor':
    case 'ability':
      return <p className="pl-3 text-muted"><Segs segs={entry.segs} /></p>;
    case 'effect':
      return <p className="pl-3 italic text-muted"><Segs segs={entry.segs} /></p>;
    case 'faint':
      return <p className="font-bold text-ink"><Segs segs={entry.segs} /></p>;
    default:
      return (
        <p className={`text-ink ${entry.kind === 'switch' ? 'mt-1' : ''}`}>
          {entry.pill && (
            <span
              className="type-pill mr-1.5 inline-flex px-1.5 py-0.5 align-middle text-xs uppercase"
              style={{ background: typeColor(entry.pill.type) }}
            >
              {entry.pill.label}
            </span>
          )}
          <Segs segs={entry.segs} />
        </p>
      );
  }
}
