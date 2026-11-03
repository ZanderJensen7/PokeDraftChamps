// The mon detail sheet: one dialog (modal from md up, bottom sheet on phones) opened from every screen that shows a
// mon outside the live battle. Openers call useMonDetail().open(species, { coachId }); MonDetailHost mounts once in App.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { monDetail, type CoachId, type MonDetail, type SpeciesId } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { useMonDetail } from '../store/monDetail';
import { getBridge } from '../game/bridge';
import { dex9 } from '../game/sets';
import { rolesOf, speciesName } from '../game/names';
import { ItemIcon, PokeSprite, PriceBadge, ResponsiveDialog, RoleTags, StatBlock, Tabs, TypePill, TypePills, typeColor } from './ui';
import { multClass, multText } from './prep/MatchupTable';

type TabId = 'overview' | 'matchups' | 'moves' | 'sets' | 'scouting';

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        <h3 className="font-display text-xs font-bold uppercase tracking-wide text-poke-yellow">{title}</h3>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function MoveChips({ moves, empty = 'None' }: { moves: readonly string[]; empty?: string }) {
  if (!moves.length) return <div className="text-xs text-faint">{empty}</div>;
  return (
    <div className="flex flex-wrap gap-1">
      {moves.map((name) => {
        const type = dex9.moves.get(name).type ?? 'Normal';
        return (
          <span
            key={name}
            className="rounded px-1.5 py-0.5 text-xs font-bold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]"
            style={{ background: typeColor(type) }}
            title={type}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}

function Overview({ d }: { d: MonDetail }) {
  const { card, speed } = d;
  const tiers = [
    { label: '0 EV', value: speed.ev0, title: 'Neutral nature, no Speed EVs' },
    { label: '252', value: speed.ev252, title: '252 Speed EVs, neutral nature' },
    { label: '252+', value: speed.ev252plus, title: '252 Speed EVs, +Speed nature' },
    { label: 'Scarf', value: speed.scarf252plus, title: 'Choice Scarf, 252+ Speed' },
  ];
  return (
    <div className="space-y-4">
      <Section title="Abilities">
        <ul className="space-y-1">
          {card.abilities.map((a) => (
            <li key={a.name} className="text-sm">
              <span className="font-bold">{a.name}</span>
              {a.desc && <span className="text-muted"> · {a.desc}</span>}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Base stats" hint={`BST ${card.bst}`}>
        <StatBlock stats={card.baseStats} />
      </Section>
      <Section title="Speed" hint="at Lv100">
        <div className="grid grid-cols-4 gap-1">
          {tiers.map((t) => (
            <div key={t.label} title={t.title} className="rounded border-2 border-edge bg-panel-inset px-1 py-0.5 text-center">
              <div className="text-[10px] font-bold uppercase text-muted">{t.label}</div>
              <div className="text-sm font-bold tabular-nums">{t.value}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Matchups({ d }: { d: MonDetail }) {
  const groups: { title: string; mult: number; types: string[] }[] = [
    { title: 'Weak 4×', mult: 4, types: d.matchup.x4 },
    { title: 'Weak 2×', mult: 2, types: d.matchup.x2 },
    { title: 'Resists ½×', mult: 0.5, types: d.matchup.x05 },
    { title: 'Resists ¼×', mult: 0.25, types: d.matchup.x025 },
    { title: 'Immune', mult: 0, types: d.matchup.immune },
  ];
  return (
    <div className="space-y-4">
      {groups.filter((g) => g.types.length).map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="flex flex-wrap gap-1">{g.types.map((t) => <TypePill key={t} type={t} />)}</div>
        </Section>
      ))}
      <Section title="Every type" hint="damage taken, abilities aside">
        <div className="grid grid-cols-6 gap-1 sm:grid-cols-9">
          {Object.entries(d.matchup.byType).map(([t, m]) => (
            <div key={t} className={`rounded px-1 py-0.5 text-center ${multClass(m)}`} title={`${t}: ${m}×`}>
              <div className="text-[10px] font-bold uppercase" style={{ color: typeColor(t) }}>{t.slice(0, 3)}</div>
              <div className="text-sm font-bold tabular-nums">{multText(m) || '1'}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Moves({ d }: { d: MonDetail }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return d.learnset;
    return d.learnset.filter((m) => m.toLowerCase().includes(s) || (dex9.moves.get(m).type ?? '').toLowerCase() === s);
  }, [q, d.learnset]);
  const notable = Object.entries(d.notableMoves).filter(([, moves]) => moves.length);
  return (
    <div className="space-y-4">
      <Section title="Notable moves">
        {notable.length === 0 && <div className="text-xs text-faint">None of the tracked utility moves.</div>}
        <div className="space-y-1.5">
          {notable.map(([cat, moves]) => (
            <div key={cat} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="w-28 shrink-0 text-xs font-bold text-muted">{cat}</span>
              <div className="min-w-0 flex-1"><MoveChips moves={moves} /></div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Learnset" hint={`${filtered.length} of ${d.learnset.length}`}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by move or type"
          aria-label="Filter learnset"
          className="focus-ring w-full rounded-lg border-2 border-edge bg-panel-inset px-3 py-2 text-base md:text-sm"
        />
        <MoveChips moves={filtered} empty="No move matches." />
      </Section>
    </div>
  );
}

function Sets({ d }: { d: MonDetail }) {
  if (!d.likelySets.length) return <p className="text-sm text-muted">No random-battle sets for this mon.</p>;
  return (
    <div className="space-y-4">
      {d.likelySets.map((r) => (
        <Section key={r.role} title={r.role}>
          <MoveChips moves={r.movepool} />
          {r.abilities.length > 0 && <div className="text-xs"><span className="font-bold text-muted">Ability </span>{r.abilities.join(' / ')}</div>}
          {r.teraTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="font-bold text-muted">Tera</span>
              {r.teraTypes.map((t) => <TypePill key={t} type={t} size="xs" />)}
            </div>
          )}
        </Section>
      ))}
    </div>
  );
}

function Scouting({ d, coachName }: { d: MonDetail; coachName?: string }) {
  const s = d.scouted!;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        From {coachName ?? 'this coach'}'s battles this season: brought <b className="text-ink">{s.timesBrought}</b>×, led{' '}
        <b className="text-ink">{s.timesLed}</b>×.
      </p>
      <Section title="Seen moves"><MoveChips moves={s.moves} empty="No moves seen yet." /></Section>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-muted">Item</span>
          {s.item ? <><ItemIcon name={s.item} />{s.item}</> : <span className="text-faint">?</span>}
        </div>
        <div><span className="font-bold text-muted">Ability </span>{s.ability ?? <span className="text-faint">?</span>}</div>
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-muted">Tera</span>
          {s.teraType ? <TypePill type={s.teraType} size="xs" /> : <span className="text-faint">not seen</span>}
        </div>
      </div>
    </div>
  );
}

function DetailBody({ species, coachId }: { species: SpeciesId; coachId?: CoachId }) {
  const run = useGame((s) => s.run);
  const coach = coachId ? run?.coaches.find((c) => c.id === coachId) : undefined;
  const roster = coach?.roster.find((r) => r.species === species);
  const scout = useMemo(() => {
    if (!run || !coachId) return undefined;
    const mon = getBridge().scout?.(run, coachId)?.bySpecies[species];
    return mon && mon.timesBrought > 0 ? mon : undefined;
  }, [run, coachId, species]);
  const [d, setD] = useState<MonDetail | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    setD(null);
    void monDetail(species, { scout, roster }).then((r) => { if (live) setD(r); });
    return () => { live = false; };
  }, [species, scout, roster]);
  useEffect(() => {
    if (tab === 'scouting' && !scout) setTab('overview');
  }, [tab, scout]);
  // Keyboard users land on the tab row.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [d]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'matchups', label: 'Matchups' },
    { id: 'moves', label: 'Moves' },
    { id: 'sets', label: 'Likely sets' },
    ...(scout ? [{ id: 'scouting' as const, label: 'Scouting' }] : []),
  ];
  if (!d) return <div className="py-8 text-center text-sm text-muted">Loading…</div>;
  const { card } = d;
  const roles = rolesOf(roster ?? { species, isTeraCaptain: false });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="grid size-24 shrink-0 place-items-center rounded-xl border-2 border-edge bg-panel-inset">
          <PokeSprite name={card.name} size={88} />
        </div>
        <div className="min-w-0 space-y-1.5">
          <TypePills types={card.types} />
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {card.price !== undefined && <PriceBadge points={card.price} />}
            <span className="rounded bg-panel-inset px-1.5 py-0.5 font-bold text-muted">{card.tier}</span>
            <RoleTags roles={roles} />
          </div>
          {card.mega && (
            <div className="flex items-center gap-1 text-xs text-muted">
              <ItemIcon name={card.mega.stone} /> Mega Evolves from {card.mega.baseName} with {card.mega.stone}
            </div>
          )}
          {coach && <div className="text-xs text-faint">{coach.name}</div>}
        </div>
      </div>
      <div ref={tabsRef} className="sticky -top-3 z-10 -mx-3 bg-panel px-3 py-1.5 md:top-0 md:mx-0 md:px-0">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === 'overview' && <Overview d={d} />}
        {tab === 'matchups' && <Matchups d={d} />}
        {tab === 'moves' && <Moves d={d} />}
        {tab === 'sets' && <Sets d={d} />}
        {tab === 'scouting' && scout && <Scouting d={d} coachName={coach?.name} />}
      </div>
    </div>
  );
}

/** The single detail sheet; mounted once in App.tsx. */
export function MonDetailHost() {
  const target = useMonDetail((s) => s.target);
  const close = useMonDetail((s) => s.close);
  // Opened over another dialog (the draft's pick card): Escape closes only this one, and before the one below sees it.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [target, close]);
  if (!target) return null;
  return (
    <ResponsiveDialog title={speciesName(target.species)} onClose={close}>
      <DetailBody key={`${target.species}:${target.coachId ?? ''}`} species={target.species} coachId={target.coachId} />
    </ResponsiveDialog>
  );
}

/** Wraps a mon's icon / sprite / name in a button that opens its detail sheet. Never nest inside another button. */
export function MonDetailButton({ species, coachId, children, className = '' }: {
  species: SpeciesId; coachId?: CoachId; children: ReactNode; className?: string;
}) {
  const open = useMonDetail((s) => s.open);
  return (
    <button
      type="button"
      title="Details"
      aria-label={`${speciesName(species)} details`}
      onClick={(e) => { e.stopPropagation(); open(species, { coachId }); }}
      className={`focus-ring cursor-pointer rounded-md text-left hover:brightness-125 ${className}`}
    >
      {children}
    </button>
  );
}

/** Small "i" button beside a row that is already a button (team list, free agency). */
export function MonInfoButton({ species, coachId, className = '' }: { species: SpeciesId; coachId?: CoachId; className?: string }) {
  const open = useMonDetail((s) => s.open);
  return (
    <button
      type="button"
      title="Details"
      aria-label={`${speciesName(species)} details`}
      onClick={(e) => { e.stopPropagation(); open(species, { coachId }); }}
      className={`focus-ring grid size-8 shrink-0 place-items-center rounded-full border-2 border-edge bg-panel-inset font-display text-sm font-bold text-muted hover:text-ink max-md:size-11 ${className}`}
    >
      i
    </button>
  );
}
