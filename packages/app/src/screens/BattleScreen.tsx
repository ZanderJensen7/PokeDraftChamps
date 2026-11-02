// The live battle: the human (p1) against the league AI (p2), driven by the engine's interactive battle.
// Protocol lines are narrated one sentence at a time; the action panel appears once narration catches up.
import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { MatchResult, ParsedRequest, RequestPokemon } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useSettings } from '../store/settings';
import { GameButton, HpBar, ResponsiveDialog, PokeIcon, PokeSprite, RoleTag, Sheet, TypePill, typeColor } from '../components/ui';
import { useIsLandscapePhone, useIsMobile } from '../hooks/useIsMobile';
import { displayName } from '../game/names';
import { dex9 } from '../game/sets';
import type { LiveBattle } from '../battle/session';
import {
  activeMon, battleViewReducer, initialBattleView, parseCondition, parseDetails, STAT_SHORT,
  type FieldView, type MonView, type SideView,
} from '../battle/battleView';
import { isHpLine, isLogWorthy, narrate, type Narration } from '../battle/narrate';

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

const SAY_MS = 360;
const HP_MS = 400;
const TURN_MS = 300;
const BEAT_MS = 300;

function delayFor(line: string, n: Narration | null, reduced: boolean): number {
  if (n?.kind === 'say' || n?.kind === 'end') return SAY_MS;
  if (n?.kind === 'turn') return reduced ? 0 : TURN_MS;
  if (isHpLine(line)) return reduced ? 0 : HP_MS;
  return 0;
}

function errorText(line: string): string {
  return line.replace(/^\|error\|/, '').replace(/^\[[^\]]+\]\s*/, '') || 'That choice was rejected.';
}

function LiveBattleView({ live }: { live: LiveBattle }) {
  const { battle, opp } = live;
  const reduced = useSettings((s) => s.reducedMotion);
  const ctx = useMemo(() => ({ oppName: opp.name }), [opp.name]);
  const [state, dispatch] = useReducer(battleViewReducer, 'The battle is about to begin…', initialBattleView);
  const linesRef = useRef<string[]>([]);
  const [received, setReceived] = useState(0);
  const [request, setRequest] = useState<ParsedRequest | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [beatDone, setBeatDone] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const lastDelay = useRef(0);
  const isMobile = useIsMobile();
  const landscape = useIsLandscapePhone();
  const phone = isMobile || landscape;

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
    const offReq = battle.onRequest((req) => setRequest(req));
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
        delay = delayFor(line, n, reduced);
        if (delay > 0) break;
      }
      lastDelay.current = delay;
      dispatch({ type: 'advance', lines: batch, say });
    }, lastDelay.current);
    return () => clearTimeout(t);
  }, [state.shown, caughtUp, ctx, reduced]);

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
  const showResult = !!result && caughtUp;
  const showActions = ready && beatDone && !showResult;
  const shown = state.shown;
  const logLines = useMemo(() => linesRef.current.slice(0, shown).filter(isLogWorthy), [shown]);
  const logToggle = (
    <GameButton size="sm" variant="ghost" onClick={() => setLogOpen((o) => !o)} className={phone ? 'min-h-9 !px-2.5 !py-0.5' : ''}>
      {logOpen ? 'HIDE LOG' : 'LOG'}
    </GameButton>
  );
  const actionArea = showResult && result ? (
    <ResultBanner result={result} live={live} />
  ) : showActions && request ? (
    <ActionPanel request={request} onChoose={choose} onForfeit={() => setForfeitOpen(true)} />
  ) : (
    <button
      type="button"
      onClick={skip}
      className="dialogue block min-h-[5.5rem] w-full px-5 py-4 text-left font-display text-xl font-bold max-md:min-h-[4.5rem] max-md:px-4 max-md:py-3 max-md:text-lg"
      aria-live="polite"
      title={caughtUp ? undefined : 'Tap to skip'}
    >
      {state.say}
      {!caughtUp && <span className="ml-2 align-middle text-sm text-poke-red">▼</span>}
    </button>
  );
  const fieldStack = (
    <>
      <TeamStrip side={view.sides.p2} tone="opp" label={opp.name} />
      <Field view={view} />
      <TeamStrip side={view.sides.p1} tone="you" label={live.human.name} extra={phone ? logToggle : undefined} />
    </>
  );

  return (
    <div
      className={landscape
        ? 'grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-3'
        : 'mx-auto grid max-w-6xl gap-4 py-4 max-md:gap-2 max-md:py-0 lg:grid-cols-[minmax(0,1fr)_320px]'}
    >
      {landscape ? (
        <>
          <div className="min-w-0 space-y-1">{fieldStack}</div>
          <div className="min-w-0">{actionArea}</div>
        </>
      ) : (
        <div className="min-w-0 space-y-2 max-md:flex max-md:min-h-[calc(100dvh-var(--topbar-h,3.75rem)-1.5rem-env(safe-area-inset-bottom))] max-md:flex-col max-md:gap-1.5 max-md:space-y-0">
          {fieldStack}
          {/* Phones: the action panel stays pinned to the bottom of the screen. */}
          <div className="max-md:pb-safe max-md:sticky max-md:bottom-0 max-md:z-20 max-md:mt-auto max-md:pt-1">{actionArea}</div>
          {!phone && <div className="flex justify-end lg:hidden">{logToggle}</div>}
          {!phone && logOpen && <div className="lg:hidden"><LogPanel lines={logLines} /></div>}
        </div>
      )}
      <div className="hidden lg:block">
        <div className="mb-2 flex justify-end">{logToggle}</div>
        {logOpen && <LogPanel lines={logLines} />}
      </div>
      {phone && logOpen && (
        <Sheet title="Battle log" full onClose={() => setLogOpen(false)}>
          <LogPanel lines={logLines} fill />
        </Sheet>
      )}
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
    </div>
  );
}

// ---------------------------------------------------------------- field

const STATUS_TYPE: Record<string, string> = { par: 'electric', brn: 'fire', psn: 'poison', tox: 'poison', frz: 'ice', slp: 'normal' };

function StatusBadge({ status }: { status: string }) {
  if (!status) return null;
  return (
    <span className="type-pill px-1.5 py-0.5 text-[10px] uppercase" style={{ background: typeColor(STATUS_TYPE[status] ?? 'normal') }}>
      {status}
    </span>
  );
}

function Boosts({ mon }: { mon: MonView }) {
  const entries = Object.entries(mon.boosts).filter(([, n]) => n !== 0);
  if (!entries.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.map(([stat, n]) => (
        <span key={stat} className={`rounded px-1 text-[10px] font-bold text-white ${n > 0 ? 'bg-win' : 'bg-loss'}`}>
          {n > 0 ? '+' : ''}{n} {STAT_SHORT[stat] ?? stat}
        </span>
      ))}
    </div>
  );
}

function HpBox({ mon, mine }: { mon: MonView; mine: boolean }) {
  return (
    <div className="battle-hpbox w-full px-2 py-1.5 sm:px-3 sm:py-2">
      <div className="flex items-center gap-1.5">
        <span className="truncate font-display text-sm font-bold leading-tight sm:text-base">{/-Mega\b/.test(mon.species) ? displayName(mon.species) : (mon.nick ?? mon.species)}</span>
        {/-Mega\b/.test(mon.species) && <RoleTag role="mega" compact />}
        <span className="ml-auto shrink-0 text-xs font-bold">Lv{mon.level}</span>
      </div>
      <div className="mb-1 flex min-h-[1.1rem] items-center gap-1">
        <StatusBadge status={mon.status} />
        {mon.tera && <TypePill type={mon.tera} size="xs" />}
      </div>
      <HpBar value={mon.hp} max={mon.maxhp} />
      {mine && <div className="mt-0.5 text-right font-display text-sm font-bold tabular-nums">{mon.hp}/{mon.maxhp}</div>}
      <Boosts mon={mon} />
    </div>
  );
}

function FieldSprite({ mon, side, size }: { mon: MonView; side: 'p1' | 'p2'; size: number }) {
  // Phones land around 115-125 px: 190 x 0.62 for the foe, 230 x 0.54 for your back sprite.
  const phoneScale = side === 'p2' ? 'scale-[0.62]' : 'scale-[0.54]';
  return (
    <div className={`battle-sprite anim-pick-in origin-bottom ${phoneScale} sm:scale-90 lg:scale-100 ${mon.fainted ? 'is-fainted' : ''}`}>
      <PokeSprite name={mon.species} side={side} size={size} />
    </div>
  );
}

function Field({ view }: { view: FieldView }) {
  const foe = activeMon(view, 'p2');
  const me = activeMon(view, 'p1');
  const chips = [
    view.weather,
    ...view.fields,
    ...Object.keys(view.sides.p2.conditions).map((c) => `Foe: ${c}`),
    ...Object.keys(view.sides.p1.conditions).map((c) => `You: ${c}`),
  ].filter((c): c is string => !!c);
  return (
    <div className="battle-field">
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
      {/* opponent: HP box top-left, front sprite top-right on its platform */}
      {foe && <div className="absolute left-2 top-2 z-10 w-[46%] max-w-[15rem] sm:left-3 sm:top-3 sm:w-[42%]"><HpBox mon={foe} mine={false} /></div>}
      <div className="battle-platform right-[6%] top-[40%] h-[15%] w-[36%]" />
      <div className="absolute right-[12%] top-[8%] flex w-[24%] justify-center">
        {foe && <FieldSprite key={`${foe.nick}|${foe.species}`} mon={foe} side="p2" size={190} />}
      </div>
      {/* you: back sprite bottom-left, HP box bottom-right */}
      <div className="battle-platform -bottom-[6%] left-[2%] h-[20%] w-[44%]" />
      <div className="absolute bottom-0 left-[6%] flex w-[36%] justify-center">
        {me && <FieldSprite key={`${me.nick}|${me.species}`} mon={me} side="p1" size={230} />}
      </div>
      {me && <div className="absolute bottom-2 right-2 z-10 w-[46%] max-w-[15rem] sm:bottom-3 sm:right-3 sm:w-[42%]"><HpBox mon={me} mine /></div>}
    </div>
  );
}

function TeamStrip({ side, tone, label, extra }: { side: SideView; tone: 'you' | 'opp'; label: string; extra?: ReactNode }) {
  const slots: (MonView | null)[] = [...side.team];
  while (slots.length < 6) slots.push(null);
  return (
    <div className={`flex items-center gap-2 max-md:gap-1.5 ${tone === 'opp' ? 'flex-row-reverse' : ''}`}>
      <span className={`min-w-0 truncate font-display text-sm font-bold max-md:text-xs ${tone === 'you' ? 'text-you' : 'text-opp'}`}>{label}</span>
      <div className="flex shrink-0 gap-1 max-md:gap-0.5">
        {slots.slice(0, 6).map((m, i) => (
          <span
            key={i}
            className={`flex h-9 w-10 items-center justify-center overflow-hidden rounded-md max-md:h-7 max-md:w-8 [&>[role=img]]:max-md:scale-75 ${
              m && side.active === i
                ? `border-2 ${tone === 'you' ? 'border-you bg-you-soft' : 'border-opp bg-opp-soft'}`
                : 'border border-edge bg-panel-inset'
            }`}
            title={m ? displayName(m.species) : 'Unknown'}
          >
            {m ? <PokeIcon name={m.species} faded={m.fainted} /> : <span className="text-faint">?</span>}
          </span>
        ))}
      </div>
      {extra && <div className="ml-auto shrink-0">{extra}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- actions

function speciesOf(p: RequestPokemon): string {
  return parseDetails(p.details).species;
}

interface ChoiceProps {
  request: ParsedRequest;
  onChoose: (cmd: string) => void;
}

function ActionPanel({ request, onChoose, onForfeit }: ChoiceProps & { onForfeit: () => void }) {
  if (request.teamPreview) return <LeadPicker request={request} onChoose={onChoose} />;
  if (request.forceSwitch?.some(Boolean)) {
    return (
      <div className="dialogue space-y-3 px-4 py-3 max-md:space-y-2 max-md:px-3 max-md:py-2.5">
        <div className="font-display text-lg font-bold">Choose who comes in next.</div>
        <Bench request={request} onChoose={onChoose} />
      </div>
    );
  }
  return <MovePanel request={request} onChoose={onChoose} onForfeit={onForfeit} />;
}

function MovePanel({ request, onChoose, onForfeit }: ChoiceProps & { onForfeit: () => void }) {
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
        <Bench request={request} onChoose={onChoose} />
      </div>
    );
  }
  return (
    <div className="dialogue space-y-3 px-4 py-3 max-md:space-y-2 max-md:px-2.5 max-md:py-2.5">
      {/* Phones: the bench opens as a bottom sheet over the move grid. */}
      {mode === 'switch' && isMobile && (
        <Sheet title="Switch to…" onClose={() => setMode('moves')}>
          <Bench request={request} onChoose={onChoose} />
        </Sheet>
      )}
      <div className="grid grid-cols-2 gap-2 max-md:gap-1.5">
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
                className={`w-full rounded-lg border-2 px-3 py-2 text-left text-white shadow-[0_3px_0_rgb(0_0_0/0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale max-md:flex max-md:min-h-14 max-md:flex-col max-md:justify-between max-md:px-2 max-md:py-1.5 ${zOn ? 'border-poke-yellow' : 'border-edge-dark'}`}
                style={{ background: typeColor(type) }}
              >
                <div className={`truncate font-display text-lg font-bold leading-tight [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] max-md:text-base ${z ? 'pr-9' : ''}`}>{zOn && z ? z.move : m.move}</div>
                <div className="flex justify-between gap-1 text-xs font-bold [text-shadow:0_1px_2px_rgb(0_0_0/0.6)] max-md:text-[11px]">
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
      <div className="flex flex-wrap items-center gap-2 max-md:grid max-md:auto-cols-fr max-md:grid-flow-col max-md:gap-1.5 max-md:[&>button]:min-h-11 max-md:[&>button]:px-1 max-md:[&>button]:text-xs">
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
            TERA <span className="max-md:hidden">{teraType.toUpperCase()} </span>{tera ? 'ON' : 'OFF'}
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
        <GameButton size="sm" variant="danger" className="ml-auto max-md:ml-0" onClick={onForfeit}>FORFEIT</GameButton>
      </div>
    </div>
  );
}

function Bench({ request, onChoose }: ChoiceProps) {
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
            className="flex items-center gap-2 rounded-lg border-2 border-edge bg-panel px-2 py-1.5 text-left text-ink hover:border-poke-yellow disabled:cursor-not-allowed disabled:opacity-45 max-md:min-h-14"
          >
            <PokeIcon name={speciesOf(p)} faded={fainted} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{displayName(speciesOf(p))}{p.active && !fainted ? ' (in battle)' : ''}</div>
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

function LeadPicker({ request, onChoose }: ChoiceProps) {
  const mons = request.side.pokemon;
  const [order, setOrder] = useState<number[]>([]);
  const toggle = (slot: number) => setOrder((o) => (o.includes(slot) ? o.filter((s) => s !== slot) : [...o, slot]));
  const send = () => {
    const rest = mons.map((_, i) => i + 1).filter((s) => !order.includes(s));
    onChoose(`team ${[...order, ...rest].join('')}`);
  };
  return (
    <div className="dialogue space-y-3 px-4 py-3 max-md:space-y-2 max-md:px-3 max-md:py-2.5">
      <div className="font-display text-lg font-bold max-md:text-base">Pick your lead, then more to set the order.</div>
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
              <span className="w-full truncate text-center text-xs font-bold">{displayName(speciesOf(p))}</span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <GameButton variant="ghost" size="sm" onClick={() => setOrder([])} disabled={!order.length} className="max-md:min-h-11">RESET</GameButton>
        <GameButton className="ml-auto max-md:min-h-11 max-md:flex-1" disabled={!order.length} onClick={send}>BATTLE!</GameButton>
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
    <div className="dialogue anim-pick-in flex flex-wrap items-center gap-4 px-5 py-4 max-md:gap-2 max-md:px-4 max-md:py-3">
      <div className={`font-display text-3xl font-bold max-md:text-2xl ${won ? 'text-win' : 'text-loss'}`}>
        {won ? 'YOU WIN' : 'YOU LOSE'} {mine}-{theirs}
      </div>
      <GameButton className="ml-auto max-md:ml-0 max-md:w-full max-md:min-h-12" size="lg" disabled={sent} onClick={() => { setSent(true); live.finish(); }}>
        CONTINUE
      </GameButton>
    </div>
  );
}

function LogPanel({ lines, fill }: { lines: string[]; fill?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  return (
    <div ref={ref} className={`${fill ? 'h-full text-xs' : 'max-h-[32rem] text-[11px]'} overflow-y-auto rounded-lg border-2 border-edge bg-bg-deep p-2 font-mono leading-snug text-muted`}>
      {lines.map((l, i) => (
        <div key={i} className={l.startsWith('|turn|') ? 'mt-1 border-t border-edge pt-1 font-bold text-poke-yellow' : 'break-all'}>{l}</div>
      ))}
    </div>
  );
}
