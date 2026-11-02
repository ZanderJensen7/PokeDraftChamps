import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DraftMon, RunState, SpeciesId } from '@pdc/engine';
import { ALL_TYPES, conflictsWithRoster, currentPicker, getDraftMon, humanCoach, legalPicks, runPool } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useSettings } from '../store/settings';
import {
  Crest, DialogueBox, GameButton, IconBadge, Modal, Panel, PokeIcon, PokeSprite, PriceBadge, RoleTag, Sheet, SpriteCard,
  StatBlock, Tabs, TypePills,
} from '../components/ui';
import { useIsMobile } from '../hooks/useIsMobile';
import { CaptainPicker } from '../components/CaptainPicker';
import { FitBadge } from '../components/draft/FitBadge';
import { MyTeamPanel } from '../components/draft/MyTeamPanel';
import { PickImpactSummary } from '../components/draft/PickImpactSummary';
import { needsOneLiner, useFitScores, useTeamNeeds } from '../hooks/useDraftHelper';
import { abbrevOf, displayName } from '../game/names';

type SortKey = 'price' | 'fit' | 'bst' | 'spe' | 'name';
const PAGE = 48;
const AI_PICK_MS = 250;
const RAIL_TABS = [
  { id: 'roster', label: 'Roster & board' },
  { id: 'team', label: 'My team' },
] as const;

function roundOrder(run: RunState, round: number): string[] {
  return round % 2 === 1 ? run.draft.order : [...run.draft.order].reverse();
}

function MonDetail({ mon, canDraft, reason, onDraft, onClose, sheet, impact }: {
  mon: DraftMon; canDraft: boolean; reason?: string; onDraft: () => void; onClose: () => void; sheet?: boolean; impact?: ReactNode;
}) {
  const Shell = sheet ? Sheet : Modal;
  return (
    <Shell
      title={<span className="flex items-center gap-2">{displayName(mon.name)}{mon.isMega && <RoleTag role="mega" />}</span>}
      onClose={onClose}
      footer={
        <>
          <GameButton variant="ghost" onClick={onClose} className="max-md:min-h-11">Back</GameButton>
          <GameButton disabled={!canDraft} onClick={onDraft} className="max-md:min-h-11">Draft {displayName(mon.name)} ({mon.points})</GameButton>
        </>
      }
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:w-40">
          <PokeSprite name={mon.name} size={120} />
          <TypePills types={mon.types} />
          <div className="flex items-center gap-2 text-sm text-muted">
            <PriceBadge points={mon.points} /> <span>{mon.tier}</span>
          </div>
        </div>
        <div className="flex-1 space-y-3">
          {impact && (
            <div className="game-inset px-3 py-2">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">For your team</div>
              {impact}
            </div>
          )}
          <StatBlock stats={mon.baseStats} />
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-muted">Abilities</div>
            <div className="font-semibold">{mon.abilities.join(' / ')}</div>
          </div>
          {mon.isMega && mon.requiredItem && (
            <p className="text-sm text-muted">
              Holds its {mon.requiredItem} and Mega Evolves in battle. Its base form can't join the same roster, and Megas can't be captains.
            </p>
          )}
          {!canDraft && reason && <DialogueBox>{reason}</DialogueBox>}
        </div>
      </div>
    </Shell>
  );
}

export function DraftScreen() {
  const run = useGame((s) => s.run);
  const draftShown = useGame((s) => s.draftShown);
  const revealNextPick = useGame((s) => s.revealNextPick);
  const skip = useGame((s) => s.skipDraftAnimation);
  const humanPick = useGame((s) => s.humanPick);
  const setCaptainsWith = useGame((s) => s.setCaptainsWith);
  const reducedMotion = useSettings((s) => s.reducedMotion);

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [maxPrice, setMaxPrice] = useState(20);
  const [sort, setSort] = useState<SortKey>('price');
  const [onlyLegal, setOnlyLegal] = useState(true);
  const [megasOnly, setMegasOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [detail, setDetail] = useState<DraftMon | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'pool' | 'board' | 'team'>('pool');
  const [railTab, setRailTab] = useState<'roster' | 'team'>('roster');
  const [hovered, setHovered] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isMobile = useIsMobile();

  const pool = run ? runPool(run) : [];
  const ownedIds = useMemo<SpeciesId[]>(() => (run ? humanCoach(run).roster.map((r) => r.species) : []), [run]);
  const { needs, loading: needsLoading } = useTeamNeeds(ownedIds);
  const fit = useFitScores(ownedIds, pool);
  const totalPicks = run ? run.draft.picks.length : 0;
  const animating = draftShown < totalPicks;
  const noCaptains = !!run && run.config.teraCaptains === 0 && (run.config.zCaptains ?? 0) === 0;
  const draftOver = !!run && run.phase === 'draft' && run.draft.complete && !animating;

  // No captain roles in this league: the captain step is skipped and the draft ends straight away.
  useEffect(() => {
    if (draftOver && noCaptains) setCaptainsWith({ tera: [], z: [] });
  }, [draftOver, noCaptains, setCaptainsWith]);

  useEffect(() => {
    if (!animating) return;
    if (reducedMotion) {
      skip();
      return;
    }
    const t = setTimeout(revealNextPick, AI_PICK_MS);
    return () => clearTimeout(t);
  }, [animating, draftShown, reducedMotion, revealNextPick, skip]);

  const shownPicks = useMemo(() => (run ? run.draft.picks.slice(0, draftShown) : []), [run, draftShown]);
  const available = useMemo(() => {
    if (!run) return new Set<string>();
    return new Set([...run.draft.available, ...run.draft.picks.slice(draftShown).map((p) => p.species)]);
  }, [run, draftShown]);

  if (!run) return null;
  const human = humanCoach(run);
  const picker = animating ? run.draft.picks[draftShown]?.coach : currentPicker(run.draft, run.config);
  const myTurn = !animating && picker === run.humanId && !run.draft.complete;
  const legal = myTurn ? new Set(legalPicks(run.draft, run.humanId, run.config, pool)) : new Set<string>();
  const round = animating ? (run.draft.picks[draftShown]?.round ?? run.draft.round) : run.draft.round;
  const overall = animating ? draftShown + 1 : run.draft.pickIndex + 1;
  const done = run.draft.complete && !animating;
  const spent = human.pointsSpent;
  const left = run.config.budget - spent;
  const picksLeft = run.config.rosterSize - human.roster.length;
  const owned = human.roster.map((r) => r.species);

  const q = search.trim().toLowerCase();
  const filtered = pool
    .filter((m) => available.has(m.id))
    .filter((m) => !q || m.name.toLowerCase().includes(q) || displayName(m.name).toLowerCase().includes(q) || m.abilities.some((a) => a.toLowerCase().includes(q)))
    .filter((m) => !type || m.types.includes(type))
    .filter((m) => !megasOnly || m.isMega)
    .filter((m) => m.points <= maxPrice)
    .filter((m) => !onlyLegal || !myTurn || legal.has(m.id))
    .sort((a, b) =>
      sort === 'price' ? b.points - a.points || b.bst - a.bst
        : sort === 'fit' ? (fit.get(b.id) ?? 0) - (fit.get(a.id) ?? 0) || b.points - a.points
        : sort === 'bst' ? b.bst - a.bst
          : sort === 'spe' ? b.baseStats.spe - a.baseStats.spe
            : displayName(a.name).localeCompare(displayName(b.name)));

  const reasonFor = (m: DraftMon): string | undefined => {
    if (!available.has(m.id)) return 'Already drafted.';
    if (!myTurn) return 'Wait for your turn.';
    if (!legal.has(m.id) && conflictsWithRoster(owned, m.id, pool)) {
      const other = human.roster.find((r) => getDraftMon(r.species)?.num === m.num);
      const otherName = other ? displayName(getDraftMon(other.species)?.name ?? other.species) : 'another form of it';
      return `You already own ${otherName}: a Pokemon and its Mega can't share a roster.`;
    }
    if (!legal.has(m.id)) return `Too expensive: you need to keep points for ${picksLeft - 1} more picks.`;
    return undefined;
  };

  const ticker = shownPicks.slice(-8).reverse();
  const order = roundOrder(run, Math.min(round, run.config.rosterSize));
  const filtersActive = (type ? 1 : 0) + (maxPrice < 20 ? 1 : 0) + (sort !== 'price' ? 1 : 0) + (onlyLegal ? 0 : 1) + (megasOnly ? 1 : 0);
  const selectedMon = myTurn && selected && legal.has(selected) ? pool.find((m) => m.id === selected) ?? null : null;

  const searchInput = (
    <input
      className="field col-span-2 min-w-0"
      type="search"
      placeholder="Search name or ability"
      value={search}
      onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
      aria-label="Search"
    />
  );

  const filterControls = (
    <>
      <select className="field" value={type} onChange={(e) => { setType(e.target.value); setLimit(PAGE); }} aria-label="Type filter">
        <option value="">All types</option>
        {ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select className="field" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
        <option value="price">Sort: price</option>
        <option value="fit">Sort by fit</option>
        <option value="bst">Sort: BST</option>
        <option value="spe">Sort: speed</option>
        <option value="name">Sort: name</option>
      </select>
      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm font-semibold md:min-h-0">
        <span className="whitespace-nowrap text-muted">Max price</span>
        <input type="range" min={1} max={20} value={maxPrice} onChange={(e) => { setMaxPrice(Number(e.target.value)); setLimit(PAGE); }} className="flex-1" />
        <span className="w-6 font-display font-bold text-poke-yellow tabular-nums">{maxPrice}</span>
      </label>
      <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm font-semibold md:min-h-0">
        <input type="checkbox" checked={onlyLegal} onChange={(e) => setOnlyLegal(e.target.checked)} className="h-5 w-5 accent-poke-yellow md:h-4 md:w-4" />
        Only show what I can afford now
      </label>
      {run.config.megas && (
        <button
          type="button"
          aria-pressed={megasOnly}
          onClick={() => { setMegasOnly((v) => !v); setLimit(PAGE); }}
          className={`game-btn col-span-2 justify-self-start px-3 py-1 text-sm max-md:min-h-11 sm:col-span-1 ${megasOnly ? 'btn-primary' : 'btn-ghost'}`}
        >
          Megas only
        </button>
      )}
    </>
  );

  const onCard = (m: DraftMon) => {
    // Phones: on your pick a tap selects (the sticky DRAFT button confirms); a second tap opens the details.
    if (isMobile && myTurn && legal.has(m.id)) {
      if (selected === m.id) setDetail(m);
      else setSelected(m.id);
      return;
    }
    setDetail(m);
  };

  const poolGrid = (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {filtered.slice(0, limit).map((m) => {
          const can = legal.has(m.id);
          const score = fit.get(m.id) ?? 0;
          const expanded = isMobile && selectedMon?.id === m.id;
          const peek = !isMobile && hovered === m.id;
          const leave = () => setHovered((h) => (h === m.id ? null : h));
          return (
            <div
              key={m.id}
              className={`relative min-w-0 ${peek ? 'z-20' : ''}`}
              onMouseEnter={isMobile ? undefined : () => setHovered(m.id)}
              onMouseLeave={isMobile ? undefined : leave}
              onFocus={isMobile ? undefined : () => setHovered(m.id)}
              onBlur={isMobile ? undefined : leave}
            >
              <SpriteCard
                name={m.name}
                className="h-full w-full"
                badge={<PriceBadge points={m.points} />}
                marker={(
                  <span className="flex flex-col items-start gap-1">
                    <FitBadge score={score} />
                    {m.isMega && <RoleTag role="mega" />}
                  </span>
                )}
                disabled={myTurn && !can}
                selected={expanded}
                onClick={() => onCard(m)}
                title={reasonFor(m)}
                ariaLabel={`${displayName(m.name)}, ${m.points} points, ${m.types.join('/')}, BST ${m.bst}, team fit ${score}`}
              >
                <div className="truncate text-center font-display font-bold leading-tight">{displayName(m.name)}</div>
                <div className="mt-1 flex justify-center"><TypePills types={m.types} size="xs" /></div>
                <div className="mt-1 flex justify-center gap-2 text-xs font-semibold text-muted">
                  <span>BST {m.bst}</span><span>Spe {m.baseStats.spe}</span>
                </div>
                {expanded && (
                  <PickImpactSummary rosterIds={ownedIds} candidate={m.id} pool={pool} className="mt-2 border-t-2 border-edge-dark pt-2" />
                )}
              </SpriteCard>
              {peek && (
                <div className="pointer-events-none absolute inset-x-0 top-full -mt-1 rounded-lg border-2 border-b-4 border-poke-yellow bg-panel-hi p-2 shadow-lg shadow-black/40">
                  <PickImpactSummary rosterIds={ownedIds} candidate={m.id} pool={pool} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length > limit && (
        <div className="mt-3 flex justify-center">
          <GameButton variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit})</GameButton>
        </div>
      )}
      {filtered.length === 0 && <DialogueBox>Nothing matches these filters.</DialogueBox>}
    </>
  );

  const rosterPanel = (
    <Panel title="Your roster" aside={<span className="font-display font-bold">{human.roster.length}/{run.config.rosterSize}</span>}>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <div className="game-inset py-1.5"><div className="font-display text-xl font-bold tabular-nums">{spent}</div><div className="text-xs font-bold uppercase text-muted">Spent</div></div>
        <div className="game-inset py-1.5"><div className="font-display text-xl font-bold text-poke-yellow tabular-nums">{left}</div><div className="text-xs font-bold uppercase text-muted">Left</div></div>
        <div className="game-inset py-1.5"><div className="font-display text-xl font-bold tabular-nums">{picksLeft}</div><div className="text-xs font-bold uppercase text-muted">Picks left</div></div>
      </div>
      {human.roster.length === 0 ? (
        <p className="text-sm text-muted">No picks yet.</p>
      ) : (
        <ul className="space-y-1">
          {human.roster.map((r) => {
            const m = getDraftMon(r.species);
            return (
              <li key={r.species} className="anim-pick-in flex items-center gap-2 rounded-lg bg-panel-inset px-2 py-0.5">
                <PokeIcon name={m?.name ?? r.species} title={displayName(m?.name ?? r.species)} />
                <span className="flex-1 truncate font-semibold">{displayName(m?.name ?? r.species)}</span>
                {m?.isMega && <RoleTag role="mega" compact />}
                <TypePills types={m?.types ?? []} size="xs" />
                <span className="w-6 text-right font-display font-bold text-poke-yellow">{m?.points}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  const myTeamPanel = (
    <MyTeamPanel rosterIds={ownedIds} rosterSize={run.config.rosterSize} needs={needs} loading={needsLoading} />
  );
  const needsLine = needsOneLiner(needs);

  const roundChips = (
    <>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Round {round} order {round % 2 === 0 ? '(snake back)' : ''}</div>
      <div className="mb-3 flex flex-wrap gap-1">
        {order.map((id) => {
          const on = id === picker;
          const you = id === run.humanId;
          return (
            <span
              key={id}
              className={`rounded-md border-2 px-1.5 py-0.5 font-display text-xs font-bold ${on ? 'border-poke-yellow bg-poke-yellow text-cream-ink' : you ? 'border-you bg-you-soft' : 'border-edge-dark bg-panel-inset text-muted'}`}
            >
              {abbrevOf(run, id)}
            </span>
          );
        })}
      </div>
    </>
  );

  const boardPanel = (
    <Panel
      title="Draft board"
      aside={<GameButton variant="ghost" size="sm" className="max-md:min-h-11" onClick={() => setShowBoard(true)}>All teams</GameButton>}
    >
      {!done && roundChips}
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Latest picks</div>
      <ul className="space-y-1">
        {ticker.map((p) => {
          const m = getDraftMon(p.species);
          const you = p.coach === run.humanId;
          return (
            <li key={p.overall} className={`anim-pick-in flex items-center gap-2 rounded-lg px-2 py-0.5 ${you ? 'bg-you-soft' : 'bg-panel-inset'}`}>
              <span className="w-7 text-xs font-bold text-faint tabular-nums">#{p.overall}</span>
              <PokeIcon name={m?.name ?? p.species} title={displayName(m?.name ?? p.species)} />
              <span className="flex-1 truncate font-semibold">{displayName(m?.name ?? p.species)}</span>
              <span className="font-display text-xs font-bold text-muted">{abbrevOf(run, p.coach)}</span>
              <span className="w-5 text-right font-display text-sm font-bold text-poke-yellow">{p.points}</span>
            </li>
          );
        })}
        {ticker.length === 0 && <li className="text-sm text-muted">The draft is about to begin.</li>}
      </ul>
    </Panel>
  );

  const allTeams = (
    <div className="space-y-2">
      {run.draft.order.map((id) => {
        const picks = shownPicks.filter((p) => p.coach === id);
        const pts = picks.reduce((s, p) => s + p.points, 0);
        const you = id === run.humanId;
        return (
          <div key={id} className={`flex flex-col gap-2 rounded-lg p-2 sm:flex-row sm:items-center ${you ? 'bg-you-soft' : 'bg-panel-inset'}`}>
            <div className="flex w-40 shrink-0 items-center gap-2">
              <Crest abbrev={abbrevOf(run, id)} size={24} side={you ? 'you' : undefined} />
              <span className="font-display font-bold">{abbrevOf(run, id)}</span>
              <span className="text-xs text-muted">{pts} pts</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {picks.map((p) => <IconBadge key={p.overall} name={getDraftMon(p.species)?.name ?? p.species} roles={getDraftMon(p.species)?.isMega ? ['mega'] : []} tone={you ? 'you' : 'neutral'} />)}
            </div>
          </div>
        );
      })}
    </div>
  );

  const overlays = (
    <>
      {detail && (
        <MonDetail
          mon={detail}
          sheet={isMobile}
          canDraft={myTurn && legal.has(detail.id)}
          reason={reasonFor(detail)}
          impact={available.has(detail.id) ? (
            <span className="flex flex-col gap-1.5">
              <FitBadge score={fit.get(detail.id) ?? 0} />
              <PickImpactSummary rosterIds={ownedIds} candidate={detail.id} pool={pool} />
            </span>
          ) : undefined}
          onClose={() => setDetail(null)}
          onDraft={() => { humanPick(detail.id); setDetail(null); setSelected(null); }}
        />
      )}
      {showBoard && (isMobile
        ? <Sheet title="All teams" full onClose={() => setShowBoard(false)}>{allTeams}</Sheet>
        : <Modal title="All teams" wide onClose={() => setShowBoard(false)}>{allTeams}</Modal>)}
    </>
  );

  // ---------- Phones: sticky status + POOL/BOARD tabs, filter sheet, sticky DRAFT button ----------
  if (isMobile && !done) {
    return (
      <div className="space-y-3">
        <div className="sticky top-[var(--topbar-h,3.75rem)] z-30 -mx-3 -mt-3 space-y-2 border-b-2 border-edge-dark bg-bg/95 px-3 pt-2 pb-2 backdrop-blur">
          <div
            className={`flex min-h-11 items-center gap-2 rounded-lg border-2 border-b-4 px-2.5 py-1 text-sm font-bold ${myTurn ? 'anim-clock border-poke-yellow-dark bg-poke-yellow text-cream-ink' : 'border-edge bg-panel'}`}
            aria-live="polite"
          >
            {myTurn ? (
              <span className="shrink-0 font-display text-base uppercase leading-none">Your pick!</span>
            ) : (
              <span className="flex min-w-0 shrink items-center gap-1.5">
                {picker && <Crest abbrev={abbrevOf(run, picker)} size={22} side="opp" />}
                <span className="truncate font-display">{picker ? abbrevOf(run, picker) : ''} picking…</span>
              </span>
            )}
            <span className={`ml-auto shrink-0 tabular-nums ${myTurn ? '' : 'text-muted'}`}>
              <span className={myTurn ? '' : 'text-poke-yellow'}>{left}</span> pts · {picksLeft} picks · R{round}
            </span>
            {animating && (
              <GameButton variant="secondary" size="sm" onClick={skip} className="min-h-9 shrink-0 !px-2 !py-1 text-xs">Skip</GameButton>
            )}
          </div>
          {myTurn && needsLine && (
            <p className="truncate px-0.5 text-xs font-bold text-poke-yellow" title={needsLine}>{needsLine}</p>
          )}
          <div role="tablist" className="grid grid-cols-3 gap-1.5">
            {(['pool', 'board', 'team'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`game-btn min-h-11 !px-1 text-sm whitespace-nowrap ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
              >
                {t === 'pool' ? `POOL · ${filtered.length}` : t === 'board' ? `BOARD · ${human.roster.length}/${run.config.rosterSize}` : 'MY TEAM'}
              </button>
            ))}
          </div>
        </div>

        {tab === 'pool' ? (
          <>
            {ticker.length > 0 && (
              <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3" aria-label="Latest picks">
                {ticker.map((p) => {
                  const m = getDraftMon(p.species);
                  const you = p.coach === run.humanId;
                  return (
                    <span key={p.overall} className={`anim-pick-in flex shrink-0 items-center gap-1 rounded-full border-2 py-0.5 pr-2.5 pl-1 text-xs font-bold ${you ? 'border-you bg-you-soft' : 'border-edge-dark bg-panel-inset'}`}>
                      <PokeIcon name={m?.name ?? p.species} title={displayName(m?.name ?? p.species)} />
                      <span className="max-w-24 truncate">{displayName(m?.name ?? p.species)}</span>
                      <span className="font-display text-muted">{abbrevOf(run, p.coach)}</span>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2">
              <input
                className="field min-w-0 flex-1"
                type="search"
                placeholder="Search name or ability"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
                aria-label="Search"
              />
              <GameButton variant="ghost" onClick={() => setFiltersOpen(true)} className="min-h-11 shrink-0" aria-label={`Filters${filtersActive ? `, ${filtersActive} active` : ''}`}>
                Filter{filtersActive > 0 && <span className="ml-1.5 rounded-full bg-poke-yellow px-1.5 text-xs text-cream-ink">{filtersActive}</span>}
              </GameButton>
            </div>
            {poolGrid}
            {myTurn && <div className="h-20" aria-hidden="true" />}
          </>
        ) : tab === 'board' ? (
          <div className="space-y-3">
            {rosterPanel}
            {boardPanel}
          </div>
        ) : (
          <>
            {myTeamPanel}
            {myTurn && <div className="h-20" aria-hidden="true" />}
          </>
        )}

        {myTurn && (
          <div className="pb-safe-3 fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t-4 border-edge-dark bg-panel/95 px-3 pt-3 backdrop-blur">
            {selectedMon ? (
              <>
                <GameButton variant="ghost" onClick={() => setDetail(selectedMon)} className="min-h-12 shrink-0" aria-label={`About ${displayName(selectedMon.name)}`}>Info</GameButton>
                <GameButton block size="lg" onClick={() => { humanPick(selectedMon.id); setSelected(null); }} className="min-h-12 truncate !text-lg">
                  DRAFT {displayName(selectedMon.name).toUpperCase()} · {selectedMon.points}
                </GameButton>
              </>
            ) : (
              <GameButton block size="lg" disabled className="min-h-12 !text-lg" onClick={() => undefined}>TAP A POKEMON TO PICK</GameButton>
            )}
          </div>
        )}

        {filtersOpen && (
          <Sheet
            title="Filter the pool"
            onClose={() => setFiltersOpen(false)}
            footer={(
              <>
                <GameButton
                  variant="ghost"
                  onClick={() => { setType(''); setMaxPrice(20); setSort('price'); setOnlyLegal(true); setMegasOnly(false); setLimit(PAGE); }}
                >
                  Reset
                </GameButton>
                <GameButton onClick={() => setFiltersOpen(false)}>Show {filtered.length}</GameButton>
              </>
            )}
          >
            <div className="grid grid-cols-2 gap-3">{filterControls}</div>
          </Sheet>
        )}
        {overlays}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {done ? (
        noCaptains
          ? <Panel title="Draft complete"><DialogueBox>Wrapping up the draft…</DialogueBox></Panel>
          : <CaptainPicker run={run} mode="draft" />
      ) : myTurn ? (
        <div className="anim-clock flex flex-col items-start justify-between gap-2 rounded-xl border-2 border-b-4 border-poke-yellow-dark bg-poke-yellow px-4 py-3 text-cream-ink sm:flex-row sm:items-center">
          <div>
            <div className="font-display text-2xl font-bold uppercase leading-none">You're on the clock!</div>
            <div className="font-semibold">Round {round} · pick #{overall} · {left} points left for {picksLeft} picks</div>
            {needsLine && <div className="mt-0.5 text-sm font-bold">{needsLine}</div>}
          </div>
          <span className="font-display font-bold">Tap a Pokemon to draft</span>
        </div>
      ) : (
        <div className="flex flex-col items-start justify-between gap-2 rounded-xl border-2 border-b-4 border-edge bg-panel px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            {picker && <Crest abbrev={abbrevOf(run, picker)} size={36} side="opp" />}
            <div>
              <div className="font-display text-xl font-bold">{picker ? abbrevOf(run, picker) : ''} is picking…</div>
              <div className="text-sm text-muted">Round {round} · pick #{overall}</div>
            </div>
          </div>
          {animating && <GameButton variant="secondary" onClick={skip}>Skip to my pick</GameButton>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_25.5rem]">
        {/* Pool */}
        {!done && (
          <Panel title="Draft pool" aside={<span>{filtered.length} shown</span>} className="order-2 lg:order-1">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {searchInput}
              {filterControls}
            </div>
            {poolGrid}
          </Panel>
        )}

        {/* Side: roster + board */}
        <div className={`order-1 space-y-4 lg:order-2 ${done ? 'lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0' : ''}`}>
          {done ? (
            <>
              {rosterPanel}
              {boardPanel}
            </>
          ) : (
            <>
              <Tabs tabs={RAIL_TABS} value={railTab} onChange={setRailTab} />
              {railTab === 'roster' ? (
                <>
                  {rosterPanel}
                  {boardPanel}
                </>
              ) : myTeamPanel}
            </>
          )}
        </div>
      </div>

      {overlays}
    </div>
  );
}
