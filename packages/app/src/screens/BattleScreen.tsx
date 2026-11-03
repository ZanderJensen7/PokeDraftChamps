// The live battle: the human (p1) against the league AI (p2), driven by the engine's interactive battle.
// Protocol lines are narrated one sentence at a time; the action panel appears once narration catches up.
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode, type Ref } from 'react';
import type { MatchResult } from '@pdc/engine';
import type { ParsedRequest, RequestPokemon } from '@pdc/engine/battle';
import { useGame } from '../store/useGame';
import { useSettings } from '../store/settings';
import { GameButton, HpBar, ResponsiveDialog, PokeIcon, PokeSprite, RoleTag, Sheet, TypePill, typeColor } from '../components/ui';
import { BoostChips, MonHoverLayer, StatusBadge, useMonHover, type MonHoverBind } from '../components/battle/MonHoverCard';
import { buildMonInfo, type MonInfoContext, type MonTarget } from '../battle/monInfo';
import { getBridge } from '../game/bridge';
import { useIsLandscapePhone, useIsMobile } from '../hooks/useIsMobile';
import { displayName } from '../game/names';
import { dex9 } from '../game/sets';
import type { BattleNames, LiveBattle } from '../battle/session';
import { conditionName } from '../battle/conditions';
import {
  activeMon, battleViewReducer, initialBattleView, parseCondition, parseDetails, parseIdent,
  type FieldView, type MonView, type Side, type SideView,
} from '../battle/battleView';
import { narrate, parseLog, type LogEntry } from '../battle/narrate';
import { delayFor } from '../battle/pacing';
import { fxEvents } from '../battle/vfx';
import { BattleLog } from '../components/battle/BattleLog';
import { FxLayer, type FxHandle } from '../components/battle/FxLayer';

export function BattleScreen() {
  const battle = useGame((s) => s.battle);
  const simulatingWeek = useGame((s) => s.simulatingWeek);
  if (!battle) return null;
  if (simulatingWeek) return <Waiting text="Simulating the rest of the week…" />;
  if (!battle.live) return <Waiting text="Heading to the battlefield…" />;
  return <LiveBattleView live={battle.live} />;
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <div className="dialogue px-5 py-4 font-display text-xl font-bold">{text}</div>
    </div>
  );
}

const BEAT_MS = 300;

function errorText(line: string): string {
  return line.replace(/^\|error\|/, '').replace(/^\[[^\]]+\]\s*/, '') || 'That choice was rejected.';
}

function LiveBattleView({ live }: { live: LiveBattle }) {
  const { battle, opp } = live;
  const reduced = useSettings((s) => s.reducedMotion);
  const effectsOn = useSettings((s) => s.battleEffects) && !reduced;
  const fx = useRef<FxHandle>(null);
  const ctx = useMemo(() => ({ oppName: opp.name, names: live.names }), [opp.name, live.names]);
  const [state, dispatch] = useReducer(battleViewReducer, 'The battle is about to begin…', initialBattleView);
  const linesRef = useRef<string[]>([]);
  const [received, setReceived] = useState(0);
  const [request, setRequest] = useState<ParsedRequest | null>(null);
  // The latest request stays readable after a choice clears `request`: the hover card reads own HP, PP and speed from it.
  const [lastRequest, setLastRequest] = useState<ParsedRequest | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [beatDone, setBeatDone] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const lastDelay = useRef(0);

  // Subscribe to the battle. onLine/onRequest replay history, so StrictMode's double effect is harmless.
  useEffect(() => {
    linesRef.current = [];
    let replayed = false;
    const offLine = battle.onLine((line) => {
      linesRef.current.push(line);
      setReceived(linesRef.current.length);
      if (replayed && line.startsWith('|error|')) useGame.getState().setToast(errorText(line));
    });
    replayed = true;
    const offReq = battle.onRequest((req) => { setRequest(req); setLastRequest(req); });
    let alive = true;
    live.result.then((r) => { if (alive) setResult(r); }, () => undefined);
    return () => { alive = false; offLine(); offReq(); };
  }, [battle, live.result]);

  // Narration pacing: apply lines up to (and including) the next one that deserves a beat.
  const caughtUp = state.shown >= received;
  useEffect(() => {
    if (caughtUp) return;
    const t = setTimeout(() => {
      const all = linesRef.current;
      const batch: string[] = [];
      let say: string | undefined;
      let delay = 0;
      for (let i = state.shown; i < all.length; i++) {
        const line = all[i]!;
        batch.push(line);
        const n = narrate(line, ctx);
        if (n && n.kind !== 'turn') say = n.text;
        delay = delayFor(line, n, reduced, effectsOn);
        if (delay > 0) break;
      }
      lastDelay.current = delay;
      // Effects (and cries) fire as the lines are narrated; a fainting mon is looked up in the view before it leaves.
      const view = state.view;
      fx.current?.play(fxEvents(batch, (ident) => {
        const id = parseIdent(ident);
        return id ? view.sides[id.side].team.find((m) => m.nick === id.name)?.species : undefined;
      }));
      dispatch({ type: 'advance', lines: batch, say });
    }, lastDelay.current);
    return () => clearTimeout(t);
  }, [state.shown, state.view, caughtUp, ctx, reduced, effectsOn]);

  /** Click on the dialogue: show everything received so far at once. */
  const skip = () => {
    const rest = linesRef.current.slice(state.shown);
    if (!rest.length) return;
    let say: string | undefined;
    for (const line of rest) {
      const n = narrate(line, ctx);
      if (n && n.kind !== 'turn') say = n.text;
    }
    lastDelay.current = 0;
    dispatch({ type: 'advance', lines: rest, say });
  };

  // The action panel replaces the dialogue a beat after narration catches up with a pending request.
  const ready = !!request && !request.wait && !result && caughtUp;
  useEffect(() => {
    if (!ready) { setBeatDone(false); return; }
    const t = setTimeout(() => setBeatDone(true), reduced ? 0 : BEAT_MS);
    return () => clearTimeout(t);
  }, [ready, request, reduced]);

  const choose = (cmd: string) => {
    setRequest(null);
    setBeatDone(false);
    battle.choose(cmd);
  };

  const forfeit = () => {
    setForfeitOpen(false);
    setRequest(null);
    live.forfeit();
  };

  const view = state.view;

  // Hover / tap info card. Scouting comes from the prep doc (already built for this opponent) or, failing
  // that, one scout pass per battle; the field view tracks revealed moves/items/abilities as lines apply.
  const prep = useGame((s) => s.prep);
  const scouted = useMemo(() => {
    const oppIds = new Set(live.opp.roster.map((r) => r.species));
    if (prep && prep.opp.length > 0 && prep.opp.every((c) => oppIds.has(c.species))) return prep.scouted;
    const run = useGame.getState().battle?.run;
    return (run && getBridge().scout?.(run, live.opp.id)?.bySpecies) ?? {};
  }, [prep, live.opp]);
  const infoCtx = useMemo<Omit<MonInfoContext, 'request'>>(() => ({
    lineups: { p1: live.humanLineup, p2: live.oppLineup },
    teraCaptains: {
      p1: live.human.roster.filter((r) => r.isTeraCaptain).map((r) => r.species),
      p2: live.opp.roster.filter((r) => r.isTeraCaptain).map((r) => r.species),
    },
    scouted,
  }), [live, scouted]);
  const showResult = !!result && caughtUp;
  const showActions = ready && beatDone && !showResult;
  const shown = state.shown;
  const logEntries = useMemo(() => parseLog(linesRef.current.slice(0, shown), ctx), [shown, ctx]);
  const actionArea = showResult && result ? (
    <ResultBanner result={result} live={live} />
  ) : showActions && request ? (
    <ActionPanel request={request} names={live.names} onChoose={choose} onForfeit={() => setForfeitOpen(true)} />
  ) : (
    <button
      type="button"
      onClick={skip}
      className="dialogue block min-h-[5.5rem] w-full px-5 py-4 text-left font-display text-xl font-bold phone:min-h-[4.5rem] phone:px-4 phone:py-3 phone:text-lg"
      aria-live="polite"
      title={caughtUp ? undefined : 'Tap to skip'}
    >
      {state.say}
      {!caughtUp && <span className="ml-2 align-middle text-sm text-poke-red">▼</span>}
    </button>
  );

  return (
    <BattleStage
      view={view}
      names={live.names}
      labels={{ p1: live.human.name, p2: opp.name }}
      fx={fx}
      effectsOn={effectsOn}
      logEntries={logEntries}
      actionArea={actionArea}
      info={infoCtx}
      request={lastRequest}
    >
      {forfeitOpen && (
        <ResponsiveDialog
          title="Forfeit this battle?"
          onClose={() => setForfeitOpen(false)}
          footer={(
            <>
              <GameButton variant="secondary" onClick={() => setForfeitOpen(false)}>KEEP FIGHTING</GameButton>
              <GameButton variant="danger" onClick={forfeit}>FORFEIT</GameButton>
            </>
          )}
        >
          <p>The match counts as a loss.</p>
        </ResponsiveDialog>
      )}
    </BattleStage>
  );
}

// ---------------------------------------------------------------- stage (shared with the replay screen)

export interface BattleStageProps {
  view: FieldView;
  names: BattleNames;
  /** Coach names on the team strips: p1 (blue, bottom) and p2 (red, top). */
  labels: Record<Side, string>;
  fx: Ref<FxHandle>;
  effectsOn: boolean;
  logEntries: LogEntry[];
  /** What sits under the field: the dialogue, the action panel or the result banner (a replay's transport bar). */
  actionArea: ReactNode;
  info: Omit<MonInfoContext, 'request'>;
  request: ParsedRequest | null;
  /** Both HP boxes print exact HP (replays read the omniscient log); live battles only show your own. */
  exactHp?: boolean;
  /** Field chip prefixes for side conditions; defaults to "You" / "Foe". */
  sideTags?: Record<Side, string>;
  /** Dialogs rendered over the stage. */
  children?: ReactNode;
}

/** The field between the two team strips, the battle log (side panel, inline or a sheet) and the mon hover card. */
export function BattleStage({ view, names, labels, fx, effectsOn, logEntries, actionArea, info, request, exactHp, sideTags, children }: BattleStageProps) {
  const isMobile = useIsMobile();
  const landscape = useIsLandscapePhone();
  const phone = isMobile || landscape;
  // The log is open by default and remembered, except on portrait phones where it is a sheet opened on demand.
  const portrait = isMobile && !landscape;
  const logPref = useSettings((s) => s.battleLogOpen);
  const updateSettings = useSettings((s) => s.update);
  const [sheetOpen, setSheetOpen] = useState(false);
  const logOpen = portrait ? sheetOpen : logPref;
  const toggleLog = () => (portrait ? setSheetOpen((o) => !o) : updateSettings({ battleLogOpen: !logPref }));
  const hover = useMonHover(phone);
  const openCard = hover.open;
  const cardInfo = useMemo(
    () => (openCard ? buildMonInfo(view, openCard.target, { ...info, request }) : null),
    [openCard, view, info, request],
  );
  const logToggle = (
    <GameButton size="sm" variant="ghost" onClick={toggleLog} aria-pressed={logOpen} className={phone ? 'min-h-9 !px-2.5 !py-0.5' : ''}>
      {logOpen ? 'HIDE LOG' : 'LOG'}
    </GameButton>
  );
  const fieldStack = (
    <>
      <TeamStrip side={view.sides.p2} sideId="p2" bind={hover.bind} tone="opp" label={labels.p2} />
      <Field view={view} names={names} bind={hover.bind} fx={fx} effectsOn={effectsOn} phone={phone} landscape={landscape} exactHp={exactHp} sideTags={sideTags} />
      <TeamStrip side={view.sides.p1} sideId="p1" bind={hover.bind} tone="you" label={labels.p1} extra={phone ? logToggle : undefined} />
    </>
  );

  return (
    <div
      className={landscape
        ? 'grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-3'
        : 'mx-auto grid max-w-6xl gap-4 py-4 phone:gap-2 phone:py-0 lg:grid-cols-[minmax(0,1fr)_320px]'}
    >
      {landscape ? (
        <>
          <div className="min-w-0 space-y-1">{fieldStack}</div>
          {/* Landscape phones: the log fills the space above the action panel, which never scrolls away. */}
          <div className="flex h-[calc(100dvh-var(--topbar-h,3.75rem)-1.5rem)] min-w-0 flex-col gap-2">
            {logOpen && <BattleLog entries={logEntries} className="min-h-[3rem] flex-1" />}
            <div className={`min-h-0 shrink-0 overflow-y-auto ${logOpen ? 'max-h-[calc(100%-3.5rem)]' : 'max-h-full'}`}>{actionArea}</div>
          </div>
        </>
      ) : (
        <div className="min-w-0 space-y-2 phone:flex phone:min-h-[calc(100dvh-var(--topbar-h,3.75rem)-1.5rem-env(safe-area-inset-bottom))] phone:flex-col phone:gap-1.5 phone:space-y-0">
          {fieldStack}
          {/* Phones: the action panel stays pinned to the bottom of the screen. */}
          <div className="phone:pb-safe phone:sticky phone:bottom-0 phone:z-20 phone:mt-auto phone:pt-1">{actionArea}</div>
          {!phone && <div className="flex justify-end lg:hidden">{logToggle}</div>}
          {!phone && logOpen && <BattleLog entries={logEntries} className="h-72 lg:hidden" />}
        </div>
      )}
      {!landscape && (
        <div className="hidden lg:sticky lg:top-[calc(var(--topbar-h,3.75rem)+1rem)] lg:block lg:self-start">
          <div className="mb-2 flex justify-end">{logToggle}</div>
          {logOpen && <BattleLog entries={logEntries} className="h-[min(36rem,calc(100dvh-var(--topbar-h,3.75rem)-6rem))]" />}
        </div>
      )}
      {portrait && sheetOpen && (
        <Sheet title="Battle log" full onClose={() => setSheetOpen(false)}>
          <BattleLog entries={logEntries} className="h-full" />
        </Sheet>
      )}
      {openCard && cardInfo && <MonHoverLayer info={cardInfo} rect={openCard.rect} mobile={phone} onClose={hover.close} />}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- field

/** The name on an HP box: the Mega form once it has Mega Evolved, else the roster's name for the nickname. */
function monName(mon: MonView, side: Side, names: BattleNames): string {
  if (/-Mega\b/.test(mon.species)) return displayName(mon.species);
  return (mon.nick && names[side][mon.nick]) || mon.nick || displayName(mon.species);
}

function HpBox({ mon, name, mine, compact }: { mon: MonView; name: string; mine: boolean; compact?: boolean }) {
  const isMega = /-Mega\b/.test(mon.species);
  // Keyed by the mon so a switch-in shows its HP at once instead of counting up from the last mon's.
  const number = mine && <span className="shrink-0 font-display text-sm font-bold tabular-nums"><TweenNumber key={mon.nick ?? mon.species} value={mon.hp} />/{mon.maxhp}</span>;
  // Landscape phones: the field is short, so status and Tera share the name row and your HP number sits beside the bar.
  if (compact) {
    return (
      <div className="battle-hpbox w-full px-2 py-1">
        <div className="flex items-center gap-1">
          <span className="truncate font-display text-sm font-bold leading-tight">{name}</span>
          {isMega && <RoleTag role="mega" compact />}
          <StatusBadge status={mon.status} />
          {mon.tera && <TypePill type={mon.tera} size="xs" />}
          <span className="ml-auto shrink-0 text-[11px] font-bold">Lv{mon.level}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <HpBar value={mon.hp} max={mon.maxhp} className="min-w-0 flex-1" />
          {number}
        </div>
        <BoostChips boosts={mon.boosts} className="mt-0.5" />
      </div>
    );
  }
  return (
    <div className="battle-hpbox w-full px-3 py-2 phone:px-2 phone:py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-display text-base font-bold leading-tight phone:text-sm">{name}</span>
        {isMega && <RoleTag role="mega" compact />}
        <span className="ml-auto shrink-0 text-xs font-bold">Lv{mon.level}</span>
      </div>
      <div className="mb-1 flex min-h-[1.1rem] items-center gap-1">
        <StatusBadge status={mon.status} />
        {mon.tera && <TypePill type={mon.tera} size="xs" />}
      </div>
      <HpBar value={mon.hp} max={mon.maxhp} />
      {mine && <div className="mt-0.5 text-right">{number}</div>}
      <BoostChips boosts={mon.boosts} className="mt-1" />
    </div>
  );
}

/** Your HP number counts down (or up) over the same 400 ms the bar takes, so a hit reads as one motion. */
function TweenNumber({ value, ms = 400 }: { value: number; ms?: number }) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - t) * (1 - t);
      const v = Math.round(from + (value - from) * eased);
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); fromRef.current = value; };
  }, [value, ms]);
  return <>{shown}</>;
}

function FieldSprite({ mon, side, size, phone }: { mon: MonView; side: 'p1' | 'p2'; size: number; phone: boolean }) {
  // Phones (portrait or landscape) land around 115-125 px: 190 x 0.62 for the foe, 230 x 0.54 for your back sprite.
  const scale = phone ? (side === 'p2' ? 'scale-[0.62]' : 'scale-[0.54]') : 'scale-90 lg:scale-100';
  return (
    <div className={`battle-sprite anim-pick-in origin-bottom ${scale} ${mon.fainted ? 'is-fainted' : ''}`}>
      {/* The inner wrapper takes the hit flash / glow classes, so they never fight the scale transform above. */}
      <div data-fx={side}>
        <PokeSprite name={mon.species} side={side} size={size} />
      </div>
    </div>
  );
}

type BindFn = (target: MonTarget) => MonHoverBind;

/** Wraps a sprite so hovering (desktop) or tapping (phones) opens its info card. */
function SpriteHit({ mon, side, index, bind, children }: { mon: MonView; side: Side; index: number; bind: BindFn; children: ReactNode }) {
  return (
    <button type="button" {...bind({ side, index })} aria-label={`${displayName(mon.species)} info`} className="flex cursor-help justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-poke-yellow">
      {children}
    </button>
  );
}

function Field({ view, names, bind, fx, effectsOn, phone, landscape, exactHp, sideTags = { p1: 'You', p2: 'Foe' } }: {
  view: FieldView; names: BattleNames; bind: BindFn; fx: Ref<FxHandle>; effectsOn: boolean; phone: boolean; landscape: boolean;
  exactHp?: boolean; sideTags?: Record<Side, string>;
}) {
  const foe = activeMon(view, 'p2');
  const me = activeMon(view, 'p1');
  const chips = [
    view.weather && conditionName(view.weather),
    ...view.fields.map(conditionName),
    ...Object.keys(view.sides.p2.conditions).map((c) => `${sideTags.p2}: ${c}`),
    ...Object.keys(view.sides.p1.conditions).map((c) => `${sideTags.p1}: ${c}`),
  ].filter((c): c is string => !!c);
  return (
    <div className="battle-field">
      <FxLayer handle={fx} visual={effectsOn} view={view} />
      {view.turn > 0 && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-cream-ink/80 px-2 py-0.5 font-display text-xs font-bold text-poke-yellow">
          TURN {view.turn}
        </div>
      )}
      {chips.length > 0 && (
        <div className="absolute left-1/2 top-8 flex max-w-[50%] -translate-x-1/2 flex-wrap justify-center gap-1">
          {chips.map((c) => <span key={c} className="rounded bg-cream-ink/75 px-1.5 text-[10px] font-bold text-cream">{c}</span>)}
        </div>
      )}
      {/* opponent: HP box top-left, front sprite top-right on its platform. Landscape phones: the field is wide and
          short, so the boxes are compact and the sprites sit further out, clear of the opposite box. */}
      {foe && (
        <div className={`absolute z-10 ${landscape ? 'left-2 top-2 w-[40%] max-w-[13rem]' : 'left-3 top-3 w-[42%] max-w-[15rem] phone:left-2 phone:top-2 phone:w-[46%]'}`}>
          <HpBox mon={foe} name={monName(foe, 'p2', names)} mine={!!exactHp} compact={landscape} />
        </div>
      )}
      <div data-fx-ground="p2" className={`battle-platform h-[15%] w-[36%] ${landscape ? 'right-[4%] top-[43%]' : 'right-[6%] top-[40%]'}`} />
      {/* The sprite scales from its bottom edge, so the landscape slot is anchored by its bottom (58% down the field). */}
      <div className={`absolute flex w-[24%] justify-center ${landscape ? 'right-[10%] bottom-[42%]' : 'right-[12%] top-[8%]'}`}>
        {foe && (
          <SpriteHit mon={foe} side="p2" index={view.sides.p2.active} bind={bind}>
            <FieldSprite key={`${foe.nick}|${foe.species}`} mon={foe} side="p2" size={190} phone={phone} />
          </SpriteHit>
        )}
      </div>
      {/* you: back sprite bottom-left, HP box bottom-right */}
      <div data-fx-ground="p1" className="battle-platform -bottom-[6%] left-[2%] h-[20%] w-[44%]" />
      <div className={`absolute bottom-0 flex w-[36%] justify-center ${landscape ? 'left-[4%]' : 'left-[6%]'}`}>
        {me && (
          <SpriteHit mon={me} side="p1" index={view.sides.p1.active} bind={bind}>
            <FieldSprite key={`${me.nick}|${me.species}`} mon={me} side="p1" size={230} phone={phone} />
          </SpriteHit>
        )}
      </div>
      {me && (
        <div className={`absolute z-10 ${landscape ? 'bottom-2 right-2 w-[40%] max-w-[13rem]' : 'bottom-3 right-3 w-[42%] max-w-[15rem] phone:bottom-2 phone:right-2 phone:w-[46%]'}`}>
          <HpBox mon={me} name={monName(me, 'p1', names)} mine compact={landscape} />
        </div>
      )}
    </div>
  );
}

function TeamStrip({ side, sideId, bind, tone, label, extra }: {
  side: SideView; sideId: Side; bind: BindFn; tone: 'you' | 'opp'; label: string; extra?: ReactNode;
}) {
  const slots: (MonView | null)[] = [...side.team];
  while (slots.length < 6) slots.push(null);
  return (
    <div className={`flex items-center gap-2 phone:gap-1.5 ${tone === 'opp' ? 'flex-row-reverse' : ''}`}>
      <span className={`min-w-0 truncate font-display text-sm font-bold phone:text-xs ${tone === 'you' ? 'text-you' : 'text-opp'}`}>{label}</span>
      <div className="flex shrink-0 gap-1 phone:gap-0.5">
        {slots.slice(0, 6).map((m, i) => (
          <SlotTag
            key={i}
            hit={m ? { ...bind({ side: sideId, index: i }), 'aria-label': `${displayName(m.species)} info` } : undefined}
            className={`flex h-9 w-10 items-center justify-center overflow-hidden rounded-md phone:h-7 phone:w-8 [&>[role=img]]:phone:scale-75 ${
              m && side.active === i
                ? `border-2 ${tone === 'you' ? 'border-you bg-you-soft' : 'border-opp bg-opp-soft'}`
                : 'border border-edge bg-panel-inset'
            }`}
            title={m ? undefined : 'Unknown'}
          >
            {m ? <PokeIcon name={m.species} faded={m.fainted} /> : <span className="text-faint">?</span>}
          </SlotTag>
        ))}
      </div>
      {extra && <div className="ml-auto shrink-0">{extra}</div>}
    </div>
  );
}

/** A team-strip slot: a button when a known mon sits in it (opens its card), a plain span otherwise. */
function SlotTag({ hit, className, title, children }: {
  hit?: MonHoverBind & { 'aria-label': string }; className: string; title?: string; children: ReactNode;
}) {
  if (!hit) return <span className={className} title={title}>{children}</span>;
  return <button type="button" {...hit} className={`${className} cursor-help focus-visible:outline-2 focus-visible:outline-poke-yellow`}>{children}</button>;
}

// ---------------------------------------------------------------- actions

function speciesOf(p: RequestPokemon): string {
  return parseDetails(p.details).species;
}

/** Your request entry's name: the roster's (a Mega pick by its Mega name), else the species it lists. */
function nameOf(p: RequestPokemon, names: BattleNames): string {
  const nick = parseIdent(p.ident)?.name;
  return (nick && names.p1[nick]) || displayName(speciesOf(p));
}

interface ChoiceProps {
  request: ParsedRequest;
  names: BattleNames;
  onChoose: (cmd: string) => void;
}

function ActionPanel({ request, names, onChoose, onForfeit }: ChoiceProps & { onForfeit: () => void }) {
  if (request.teamPreview) return <LeadPicker request={request} names={names} onChoose={onChoose} />;
  if (request.forceSwitch?.some(Boolean)) {
    return (
      <div className="dialogue space-y-3 px-4 py-3 phone:space-y-2 phone:px-3 phone:py-2.5">
        <div className="font-display text-lg font-bold">Choose who comes in next.</div>
        <Bench request={request} names={names} onChoose={onChoose} />
      </div>
    );
  }
  return <MovePanel request={request} names={names} onChoose={onChoose} onForfeit={onForfeit} />;
}

function MovePanel({ request, names, onChoose, onForfeit }: ChoiceProps & { onForfeit: () => void }) {
  const [mode, setMode] = useState<'moves' | 'switch'>('moves');
  const [tera, setTera] = useState(false);
  // Mega Evolution is armed by default: a Mega pick was drafted to Mega Evolve.
  const [mega, setMega] = useState(true);
  const [zSlot, setZSlot] = useState<number | null>(null);
  const active = request.active?.[0];
  const teraType = active?.canTerastallize || null;
  const canMega = !!active?.canMegaEvo;
  const zMoves = active?.canZMove ?? [];
  const megaOn = canMega && mega && !tera;
  const suffix = (i: number): string => {
    if (zSlot === i && zMoves[i]) return ' zmove';
    if (megaOn) return ' mega';
    if (tera && teraType) return ' terastallize';
    return '';
  };
  const trapped = !!active?.trapped;
  const isMobile = useIsMobile();
  if (mode === 'switch' && !isMobile) {
    return (
      <div className="dialogue space-y-3 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="font-display text-lg font-bold">Switch to…</div>
          <GameButton size="sm" variant="ghost" onClick={() => setMode('moves')}>BACK</GameButton>
        </div>
        <Bench request={request} names={names} onChoose={onChoose} />
      </div>
    );
  }
  return (
    <div className="dialogue space-y-3 px-4 py-3 phone:space-y-2 phone:px-2.5 phone:py-2.5">
      {/* Phones: the bench opens as a bottom sheet over the move grid. */}
      {mode === 'switch' && isMobile && (
        <Sheet title="Switch to…" onClose={() => setMode('moves')}>
          <Bench request={request} names={names} onChoose={onChoose} />
        </Sheet>
      )}
      <div className="grid grid-cols-2 gap-2 phone:gap-1.5">
        {(active?.moves ?? []).map((m, i) => {
          const move = dex9.moves.get(m.id);
          const type = move.exists ? move.type : 'Normal';
          const z = zMoves[i] ?? null;
          const zOn = zSlot === i && !!z;
          const disabled = (!!m.disabled || m.pp === 0) && !zOn;
          return (
            <div key={`${m.id}-${i}`} className="relative">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChoose(`move ${i + 1}${suffix(i)}`)}
                className={`w-full rounded-lg border-2 px-3 py-2 text-left text-white shadow-[0_3px_0_rgb(0_0_0/0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale phone:flex phone:min-h-14 phone:flex-col phone:justify-between phone:px-2 phone:py-1.5 ${zOn ? 'border-poke-yellow' : 'border-edge-dark'}`}
                style={{ background: typeColor(type) }}
              >
                <div className={`truncate font-display text-lg font-bold leading-tight [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] phone:text-base ${z ? 'pr-9' : ''}`}>{zOn && z ? z.move : m.move}</div>
                <div className="flex justify-between gap-1 text-xs font-bold [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] phone:text-[11px]">
                  <span className="uppercase">{zOn ? `Z-Move · ${type}` : type}</span>
                  {m.maxpp !== undefined && <span className="tabular-nums">PP {m.pp ?? m.maxpp}/{m.maxpp}</span>}
                </div>
              </button>
              {z && (
                <button
                  type="button"
                  aria-pressed={zOn}
                  aria-label={zOn ? `Cancel ${z.move}` : `Arm ${z.move} (Z-Move from ${m.move})`}
                  title={zOn ? `Cancel ${z.move}` : `Z-Move: ${z.move}`}
                  onClick={() => { setZSlot(zOn ? null : i); if (!zOn) setTera(false); }}
                  className={`absolute right-1.5 top-1.5 rounded-md border-2 px-1.5 font-display text-sm font-bold ${zOn ? 'border-poke-yellow bg-type-stellar text-cream-ink' : 'border-cream-edge bg-cream-mid text-cream-ink hover:brightness-105'}`}
                >
                  Z
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 phone:grid phone:auto-cols-fr phone:grid-flow-col phone:gap-1.5 phone:[&>button]:min-h-11 phone:[&>button]:px-1 phone:[&>button]:text-xs">
        <GameButton size="sm" variant="secondary" disabled={trapped} onClick={() => setMode('switch')} title={trapped ? 'Trapped' : undefined}>
          SWITCH
        </GameButton>
        {teraType && (
          <button
            type="button"
            aria-pressed={tera}
            onClick={() => { setTera((t) => !t); setZSlot(null); }}
            className={`rounded-lg border-2 px-3 py-1.5 font-display text-sm font-bold ${tera ? 'border-poke-yellow text-white' : 'border-cream-edge bg-cream-mid text-cream-ink hover:brightness-105'}`}
            style={tera ? { background: typeColor(teraType) } : undefined}
          >
            TERA <span className="phone:hidden">{teraType.toUpperCase()} </span>{tera ? 'ON' : 'OFF'}
          </button>
        )}
        {canMega && (
          <button
            type="button"
            aria-pressed={megaOn}
            onClick={() => { if (megaOn) setMega(false); else { setMega(true); setTera(false); } }}
            title="Mega Evolve before moving this turn"
            className={`rounded-lg border-2 px-3 py-1.5 font-display text-sm font-bold ${megaOn ? 'border-poke-yellow bg-crest-3 text-ink' : 'border-cream-edge bg-cream-mid text-cream-ink hover:brightness-105'}`}
          >
            MEGA {megaOn ? 'ON' : 'OFF'}
          </button>
        )}
        <GameButton size="sm" variant="danger" className="ml-auto phone:ml-0" onClick={onForfeit}>FORFEIT</GameButton>
      </div>
    </div>
  );
}

function Bench({ request, names, onChoose }: ChoiceProps) {
  const mons = request.side.pokemon;
  const any = mons.some((p) => !p.active && !parseCondition(p.condition)?.fainted);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {mons.map((p, i) => {
        const c = parseCondition(p.condition);
        const fainted = !!c?.fainted;
        return (
          <button
            key={p.ident}
            type="button"
            disabled={p.active || fainted}
            onClick={() => onChoose(`switch ${i + 1}`)}
            className="flex items-center gap-2 rounded-lg border-2 border-edge bg-panel px-2 py-1.5 text-left text-ink hover:border-poke-yellow disabled:cursor-not-allowed disabled:opacity-45 phone:min-h-14"
          >
            <PokeIcon name={speciesOf(p)} faded={fainted} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{nameOf(p, names)}{p.active && !fainted ? ' (in battle)' : ''}</div>
              <HpBar value={c?.hp ?? 0} max={c?.maxhp || 1} />
              <div className="text-right text-[11px] font-bold tabular-nums text-muted">{fainted ? 'Fainted' : `${c?.hp ?? 0}/${c?.maxhp ?? 0}`}</div>
            </div>
          </button>
        );
      })}
      {!any && <GameButton onClick={() => onChoose('default')}>CONTINUE</GameButton>}
    </div>
  );
}

function LeadPicker({ request, names, onChoose }: ChoiceProps) {
  const mons = request.side.pokemon;
  const [order, setOrder] = useState<number[]>([]);
  const toggle = (slot: number) => setOrder((o) => (o.includes(slot) ? o.filter((s) => s !== slot) : [...o, slot]));
  const send = () => {
    const rest = mons.map((_, i) => i + 1).filter((s) => !order.includes(s));
    onChoose(`team ${[...order, ...rest].join('')}`);
  };
  return (
    <div className="dialogue space-y-3 px-4 py-3 phone:space-y-2 phone:px-3 phone:py-2.5">
      <div className="font-display text-lg font-bold phone:text-base">Pick your lead, then more to set the order.</div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {mons.map((p, i) => {
          const pos = order.indexOf(i + 1);
          return (
            <button
              key={p.ident}
              type="button"
              onClick={() => toggle(i + 1)}
              aria-pressed={pos >= 0}
              className={`relative flex flex-col items-center rounded-lg border-2 bg-panel px-1 py-2 text-ink ${
                pos === 0 ? 'border-poke-yellow' : pos > 0 ? 'border-you' : 'border-edge hover:border-poke-yellow'
              }`}
            >
              {pos >= 0 && (
                <span className="absolute left-1 top-1 rounded-full bg-poke-yellow px-1.5 text-xs font-bold text-cream-ink">{pos === 0 ? 'LEAD' : pos + 1}</span>
              )}
              <PokeSprite name={speciesOf(p)} side="p2" size={64} />
              <span className="w-full truncate text-center text-xs font-bold">{nameOf(p, names)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <GameButton variant="ghost" size="sm" onClick={() => setOrder([])} disabled={!order.length} className="phone:min-h-11">RESET</GameButton>
        <GameButton className="ml-auto phone:min-h-11 phone:flex-1" disabled={!order.length} onClick={send}>BATTLE!</GameButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- end + log

function ResultBanner({ result, live }: { result: MatchResult; live: LiveBattle }) {
  const [sent, setSent] = useState(false);
  const won = result.winner === live.human.id;
  const mine = result.remaining[live.human.id] ?? 0;
  const theirs = result.remaining[live.opp.id] ?? 0;
  return (
    <div className="dialogue anim-pick-in flex flex-wrap items-center gap-4 px-5 py-4 phone:gap-2 phone:px-4 phone:py-3">
      <div className={`font-display text-3xl font-bold phone:text-2xl ${won ? 'text-win' : 'text-loss'}`}>
        {won ? 'YOU WIN' : 'YOU LOSE'} {mine}-{theirs}
      </div>
      <GameButton className="ml-auto phone:ml-0 phone:w-full phone:min-h-12" size="lg" disabled={sent} onClick={() => { setSent(true); live.finish(); }}>
        CONTINUE
      </GameButton>
    </div>
  );
}
