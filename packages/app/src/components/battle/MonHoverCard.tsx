// Showdown-style info card for a mon in battle: hover (desktop, short delay) or tap (phones, in a Sheet).
// Opposing mons get three move tiers: seen this battle, scouted from earlier logs, likely from the role sets.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RoleTag, Sheet, StatBlock, TypePill, typeColor } from '../ui';
import { STAT_SHORT } from '../../battle/battleView';
import type { MonInfo, MonTarget, MoveLine, SpeedResult } from '../../battle/monInfo';

const STATUS_TYPE: Record<string, string> = { par: 'electric', brn: 'fire', psn: 'poison', tox: 'poison', frz: 'ice', slp: 'normal' };

export function StatusBadge({ status }: { status: string }) {
  if (!status) return null;
  return (
    <span className="type-pill px-1.5 py-0.5 text-[10px] uppercase" style={{ background: typeColor(STATUS_TYPE[status] ?? 'normal') }}>
      {status}
    </span>
  );
}

export function BoostChips({ boosts, className = '' }: { boosts: Record<string, number> | [string, number][]; className?: string }) {
  const entries = (Array.isArray(boosts) ? boosts : Object.entries(boosts)).filter(([, n]) => n !== 0);
  if (!entries.length) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {entries.map(([stat, n]) => (
        <span key={stat} className={`rounded px-1 text-[10px] font-bold text-white ${n > 0 ? 'bg-win' : 'bg-loss'}`}>
          {n > 0 ? '+' : ''}{n} {STAT_SHORT[stat] ?? stat}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- card

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-xs font-bold uppercase tracking-wide text-poke-yellow">{title}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function MoveChips({ moves, empty }: { moves: MoveLine[]; empty?: string }) {
  if (!moves.length) return <div className="text-xs text-faint">{empty ?? 'None'}</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {moves.map((m) => (
        <span
          key={m.name}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"
          style={{ background: typeColor(m.type) }}
          title={m.type}
        >
          {m.name}
          {m.maxpp !== undefined && <span className="tabular-nums opacity-90">{m.pp ?? m.maxpp}/{m.maxpp}</span>}
        </span>
      ))}
    </div>
  );
}

function InfoLine({ label, value, scouted, extra }: { label: string; value?: string; scouted?: string; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
      <span className="font-bold text-muted">{label}</span>
      <span className="font-bold">{value ?? '?'}</span>
      {scouted && scouted !== value && <span className="text-faint">scouted: <span className="text-muted">{scouted}</span></span>}
      {extra}
    </div>
  );
}

const RESULT_CLS: Record<SpeedResult, string> = {
  you: 'border-win text-win',
  them: 'border-loss text-loss',
  tie: 'border-poke-yellow text-poke-yellow',
};

function SpeedSection({ info }: { info: MonInfo }) {
  const s = info.speed;
  return (
    <Section title="Speed" hint={s.yours && s.theirs ? 'green: you move first' : undefined}>
      <div className="text-xs">
        <span className="font-bold text-you">You</span>{' '}
        {s.yours ? <><span className="text-muted">{s.yours.name}</span> <span className="font-bold tabular-nums">{s.yours.value}</span></> : <span className="text-faint">no active mon yet</span>}
      </div>
      <div className="text-xs">
        <span className="font-bold text-opp">Foe</span>{' '}
        {s.theirs ? <span className="text-muted">{s.theirs.name}, at Lv100</span> : <span className="text-faint">no active mon yet</span>}
      </div>
      {s.theirs && (
        <div className="grid grid-cols-4 gap-1">
          {s.theirs.tiers.map((t) => (
            <div key={t.label} className={`rounded border-2 bg-panel-inset px-1 py-0.5 text-center ${t.result ? RESULT_CLS[t.result] : 'border-edge text-ink'}`}>
              <div className="text-[10px] font-bold uppercase text-muted">{t.label}</div>
              <div className="text-sm font-bold tabular-nums">{t.value}</div>
            </div>
          ))}
        </div>
      )}
      {s.notes.length > 0 && <div className="text-[11px] text-faint">{s.notes.join(' · ')}</div>}
    </Section>
  );
}

/** The card body (no frame): shared by the desktop popover and the phone sheet. */
export function MonCard({ info, header = true }: { info: MonInfo; header?: boolean }) {
  const mine = info.side === 'p1';
  return (
    <div className="space-y-2.5 text-ink">
      <div className="space-y-1.5">
        {header && (
          <div className="flex items-center gap-1.5">
            <span className={`truncate font-display text-base font-bold ${mine ? 'text-you' : 'text-opp'}`}>{info.name}</span>
            {info.teraCaptain && <RoleTag role="tera" compact />}
            <span className="ml-auto shrink-0 text-xs font-bold tabular-nums">{info.hpText}</span>
          </div>
        )}
        {!header && <div className="text-right text-xs font-bold tabular-nums">{info.hpText}</div>}
        <div className="flex flex-wrap items-center gap-1">
          {info.types.map((t) => <TypePill key={t} type={t} size="xs" />)}
          {info.tera && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted">TERA <TypePill type={info.tera} size="xs" /></span>}
          <StatusBadge status={info.fainted ? '' : info.status} />
        </div>
        {info.teraCaptain && !info.tera && (
          <div className="text-[11px] text-muted">
            Tera captain
            {info.teraPlan && <> · Tera {info.teraPlan}</>}
            {info.scoutedTera && <> · scouted: Tera {info.scoutedTera}</>}
            {!info.scoutedTera && info.likelyTera.length > 0 && <> · likely Tera {info.likelyTera.join(' / ')}</>}
          </div>
        )}
        <BoostChips boosts={info.boosts} />
        <InfoLine
          label="Item"
          value={info.item ? `${info.item}${info.itemGone ? ' (gone)' : ''}` : mine ? 'none' : undefined}
          scouted={info.scoutedItem}
        />
        <InfoLine
          label="Ability"
          value={info.ability}
          scouted={info.scoutedAbility}
          extra={!info.ability && !info.scoutedAbility && info.possibleAbilities.length > 0
            ? <span className="text-faint">possible: {info.possibleAbilities.join(' / ')}</span>
            : undefined}
        />
      </div>

      {mine ? (
        <Section title="Moves" hint={info.mine?.some((m) => m.maxpp !== undefined) ? undefined : 'PP shows while active'}>
          <MoveChips moves={info.mine ?? []} />
        </Section>
      ) : (
        <div className="space-y-1.5">
          <Section title="Seen this battle"><MoveChips moves={info.seen ?? []} empty="Nothing yet" /></Section>
          <Section title="Scouted" hint="earlier logs this season"><MoveChips moves={info.scouted ?? []} empty="Nothing new" /></Section>
          <Section title="Likely" hint="role movepools"><MoveChips moves={info.likely ?? []} empty="No set data" /></Section>
        </div>
      )}

      <SpeedSection info={info} />

      <Section title="Base stats">
        <StatBlock stats={info.baseStats} compact />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- hover / tap state

const HOVER_MS = 280;

interface OpenCard { target: MonTarget; rect: DOMRect }

/**
 * Hover state for the battle screen. Desktop: hover or focus opens after a short delay, leaving closes,
 * a click opens at once. Phones: a tap toggles the card (shown in a Sheet).
 */
export function useMonHover(mobile: boolean) {
  const [open, setOpen] = useState<OpenCard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; };
  useEffect(() => clear, []);
  const close = useCallback(() => { clear(); setOpen(null); }, []);

  const bind = (target: MonTarget) => {
    const same = (o: OpenCard | null) => !!o && o.target.side === target.side && o.target.index === target.index;
    const openSoon = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
      if (mobile) return;
      clear();
      const el = e.currentTarget;
      timer.current = setTimeout(() => setOpen({ target, rect: el.getBoundingClientRect() }), HOVER_MS);
    };
    const leave = () => { if (!mobile) close(); };
    return {
      onMouseEnter: openSoon,
      onFocus: openSoon,
      onMouseLeave: leave,
      onBlur: leave,
      onClick: (e: MouseEvent<HTMLElement>) => {
        clear();
        const rect = e.currentTarget.getBoundingClientRect();
        setOpen((o) => (mobile && same(o) ? null : { target, rect }));
      },
    };
  };
  return { open, close, bind };
}

export type MonHoverBind = ReturnType<ReturnType<typeof useMonHover>['bind']>;

const GAP = 8;
const MARGIN = 8;

/** Desktop popover, anchored beside the hovered sprite or icon and kept inside the viewport. */
function Popover({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + GAP;
    if (left + w > vw - MARGIN) left = rect.left - GAP - w;
    if (left < MARGIN) left = Math.min(Math.max(MARGIN, rect.left + rect.width / 2 - w / 2), vw - MARGIN - w);
    const top = Math.min(Math.max(MARGIN, rect.top), Math.max(MARGIN, vh - MARGIN - h));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = 'visible';
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ visibility: 'hidden' }}
      className="game-panel anim-pick-in pointer-events-none fixed left-0 top-0 z-50 max-h-[calc(100dvh-1rem)] w-[20rem] overflow-hidden px-3 py-2.5 shadow-2xl"
    >
      {children}
    </div>,
    document.body,
  );
}

/** The open card: a popover on desktop, a bottom sheet on phones. */
export function MonHoverLayer({ info, rect, mobile, onClose }: { info: MonInfo; rect: DOMRect; mobile: boolean; onClose: () => void }) {
  if (mobile) {
    return (
      <Sheet
        title={<span className="inline-flex items-center gap-1.5">{info.name}{info.teraCaptain && <RoleTag role="tera" compact />}</span>}
        onClose={onClose}
      >
        <MonCard info={info} header={false} />
      </Sheet>
    );
  }
  return <Popover rect={rect} onClose={onClose}><MonCard info={info} /></Popover>;
}
