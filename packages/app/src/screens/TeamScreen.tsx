import { useEffect, useMemo, useRef, useState } from 'react';
import { Sets } from '@pkmn/sets';
import { toID } from '@pkmn/dex';
import type { BattleSet, MoveRow, RosterEntry, SampleSet, SpeciesId, StatsTable } from '@pdc/engine';
import { SPREAD_PRESETS, exportSetText, fillSet, getDraftMon, humanCoach, moveRows, spreadFor } from '@pdc/engine';
import { useGame } from '../store/useGame';
import {
  CloseButton, DialogueBox, GameButton, IconBadge, ItemIcon, ResponsiveDialog, Panel, PokeSprite, PriceBadge, RoleTags, StatBlock, TypePill, TypePills,
} from '../components/ui';
import { displayName, rolesOf } from '../game/names';
import { MonDetailButton } from '../components/MonDetail';
import { ExportRosterDialog, ImportRosterDialog, SampleSets, rosterExportText } from '../components/TeamSetTools';
import { MoveTable } from '../components/MoveTable';
import { ItemPicker } from '../components/ItemPicker';
import { TeamStats } from '../components/TeamStats';
import { useMonDetail } from '../store/monDetail';
import { useTeamDrafts } from '../store/teamDrafts';
import {
  EV_STAT_CAP, EV_TOTAL_CAP, STAT_LABEL, STAT_NAMES, TERA_TYPES, Z_CRYSTALS, abilityShortDesc, battleSpecies, blankSet, dex9, itemShortDesc,
  lockedStone, moveInfo, natureNames, natureStats, natureSummary, speciesAbilities, zCrystalType,
} from '../game/sets';

type StatName = keyof StatsTable;

const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function spreadText(evs: StatsTable): string {
  return STAT_NAMES.filter((k) => (evs[k] ?? 0) > 0).map((k) => `${evs[k]} ${STAT_LABEL[k]}`).join(' / ') || 'no EVs';
}

function SetEditor({ entry, saved, draft, setDraft, pendingCount, onSave, showTera, opponents }: {
  entry: RosterEntry; saved: BattleSet | undefined; showTera: boolean; opponents: SpeciesId[];
  /** This mon's unsaved edit, else its saved set (the screen keeps every mon's edits until Save). */
  draft: BattleSet | null; setDraft: (d: BattleSet | null) => void;
  /** Mons with unsaved edits, this one included. */
  pendingCount: number; onSave: () => void;
}) {
  const species = entry.species;
  const isZCaptain = !!entry.isZCaptain;
  const setToast = useGame((s) => s.setToast);
  const mon = getDraftMon(species);
  const name = displayName(mon?.name ?? species);
  const stone = lockedStone(species);
  const [rows, setRows] = useState<MoveRow[] | null>(null);
  const [io, setIo] = useState<'import' | 'export' | null>(null);
  const [ioText, setIoText] = useState('');

  useEffect(() => {
    let live = true;
    setRows(null);
    moveRows(species).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [species]);

  const moves = useMemo(() => (rows ? rows.map((r) => r.name) : null), [rows]);
  const natures = useMemo(() => natureNames(), []);
  const abilities = speciesAbilities(species);
  const battleSp = dex9.species.get(battleSpecies(species));
  const useSample = (sample: SampleSet) => {
    setDraft(fillSet(entry, sample.set));
    useGame.getState().setToast(`Filled in ${name}'s ${sample.label} set (${sample.source}). Save to keep it.`);
  };
  /** Keep the current set; the sample's legal moves fill the empty move slots. */
  const mergeMoves = (sample: SampleSet) => {
    const base = draft ?? fillSet(entry, {});
    const have = base.moves.filter(Boolean);
    if (have.length >= 4) {
      setToast('All four move slots are full. Remove a move first.');
      return;
    }
    const legal = (m: string) => !moves || moves.some((o) => o.toLowerCase() === m.toLowerCase());
    const add = (sample.set.moves ?? [])
      .filter((m) => legal(m) && !have.some((h) => h.toLowerCase() === m.toLowerCase()))
      .slice(0, 4 - have.length);
    setDraft({ ...base, moves: [...have, ...add] });
    setToast(add.length ? `Added ${add.join(', ')} from the ${sample.label} set. Save to keep it.` : 'Those moves are already in the set.');
  };

  if (!draft) {
    return (
      <div className="space-y-3">
        <DialogueBox>No set yet for {name}. Pick a recommended set, build one from scratch or paste a Showdown set.</DialogueBox>
        <SampleSets entry={entry} showTera={showTera} onPick={useSample} onMerge={mergeMoves} />
        <div className="flex flex-wrap gap-2">
          <GameButton
            onClick={() => {
              const b = blankSet(species);
              const crystal = isZCaptain && !stone ? Z_CRYSTALS.find((z) => zCrystalType(z) === mon?.types[0]) : undefined;
              setDraft(crystal ? { ...b, item: crystal } : b);
            }}
          >
            Build a set
          </GameButton>
          <GameButton variant="secondary" onClick={() => { setIoText(''); setIo('import'); }}>Import Showdown text</GameButton>
        </div>
        {io === 'import' && (
          <ImportModal
            text={ioText}
            setText={setIoText}
            onClose={() => setIo(null)}
            onImport={(t) => {
              setDraft(fillSet(entry, Sets.importSet(t) as Partial<BattleSet>));
              setIo(null);
            }}
          />
        )}
      </div>
    );
  }

  const patch = (p: Partial<BattleSet>) => setDraft({ ...draft, ...p });
  const total = STAT_NAMES.reduce((sum, k) => sum + (draft.evs[k] ?? 0), 0);
  const setEv = (k: StatName, v: number) => {
    const others = total - (draft.evs[k] ?? 0);
    const clamped = Math.max(0, Math.min(v, EV_STAT_CAP, EV_TOTAL_CAP - others));
    patch({ evs: { ...draft.evs, [k]: clamped - (clamped % 4) } });
  };
  const moveList = [0, 1, 2, 3].map((i) => draft.moves[i] ?? '');
  const illegal = moves ? moveList.filter((m) => m && !moves.some((o) => o.toLowerCase() === m.toLowerCase())) : [];
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const zType = zCrystalType(draft.item);
  const mon0 = getDraftMon(species);
  const applyPreset = (role: string, label: string) => {
    if (!mon0) return;
    const sp = spreadFor(role, moveList.filter(Boolean).map(toID), mon0.baseStats, draft.item);
    patch({ evs: sp.evs, nature: sp.nature, ivs: sp.ivs });
    useGame.getState().setToast(`${label}: ${spreadText(sp.evs)}, ${sp.nature}.`);
  };
  const zMoves = zType ? moveList.filter((m) => m && moveInfo(m)?.type === zType && moveInfo(m)?.category !== 'Status') : [];
  const abilityDesc = abilityShortDesc(draft.ability);
  const nat = natureStats(draft.nature);

  return (
    <div className="space-y-4">
      <SampleSets entry={entry} showTera={showTera} onPick={useSample} onMerge={mergeMoves} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid grid-cols-2 content-start gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">Item</span>
            <div className="flex items-center gap-2">
              {stone ? (
                <>
                  <ItemIcon name={stone} />
                  <input className="field min-w-0 flex-1 opacity-80" value={stone} readOnly aria-label="Item" aria-readonly="true" aria-describedby="pdc-item-note" />
                </>
              ) : isZCaptain ? (
                <>
                  {draft.item && <ItemIcon name={draft.item} />}
                  <select className="field min-w-0 flex-1" value={Z_CRYSTALS.includes(draft.item) ? draft.item : ''} onChange={(e) => patch({ item: e.target.value })} aria-label="Item" aria-describedby="pdc-item-note">
                    {!Z_CRYSTALS.includes(draft.item) && <option value="">Pick a Z-Crystal</option>}
                    {Z_CRYSTALS.map((z) => <option key={z} value={z}>{z} ({zCrystalType(z)})</option>)}
                  </select>
                </>
              ) : (
                <ItemPicker value={draft.item} onChange={(item) => patch({ item })} />
              )}
            </div>
            {!isZCaptain && !stone && draft.item && <span className="text-xs text-muted">{itemShortDesc(draft.item)}</span>}
            {stone && (
              <span id="pdc-item-note" className="text-xs text-muted">Locked: {name} holds its {stone} and Mega Evolves in battle.</span>
            )}
            {!stone && isZCaptain && (
              <span id="pdc-item-note" className="text-xs text-muted">
                Z captain: holds a Z-Crystal, one Z-Move per battle.{' '}
                {zType && (zMoves.length ? `Powers ${zMoves.join(', ')}.` : `No ${zType} attack in this moveset yet.`)}
              </span>
            )}
          </div>
          <label className="col-span-2 flex flex-col gap-1 xl:col-span-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">Ability</span>
            <select className="field" value={draft.ability} onChange={(e) => patch({ ability: e.target.value })}>
              {abilities.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {abilityDesc && <span className="text-xs text-muted">{abilityDesc}</span>}
          </label>
          <label className="col-span-2 flex flex-col gap-1 xl:col-span-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">Nature</span>
            <select className="field" value={draft.nature} onChange={(e) => patch({ nature: e.target.value })}>
              {natures.map((n) => <option key={n} value={n}>{n} ({natureSummary(n)})</option>)}
            </select>
            <span className="text-xs">
              {nat
                ? <><span className="font-bold text-win">+{STAT_LABEL[nat.plus]}</span>{' '}<span className="font-bold text-loss">−{STAT_LABEL[nat.minus]}</span></>
                : <span className="text-muted">No stat changes</span>}
            </span>
          </label>
          {showTera && <label className="col-span-2 flex flex-col gap-1">
            <span className="text-sm font-bold uppercase tracking-wide text-muted">Tera type</span>
            <div className="flex items-center gap-2">
              <select className="field flex-1" value={draft.teraType ?? ''} onChange={(e) => patch({ teraType: e.target.value || undefined })}>
                {TERA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              {draft.teraType && <TypePill type={draft.teraType} />}
            </div>
          </label>}
        </div>

        <div>
          <TeamStats
            base={battleSp.baseStats as StatsTable}
            evs={draft.evs}
            ivs={draft.ivs}
            nature={draft.nature}
            opponents={opponents}
            onEv={setEv}
            presets={(
              <>
                {SPREAD_PRESETS.map((p) => (
                  <GameButton key={p.role} variant="ghost" size="sm" onClick={() => applyPreset(p.role, p.label)}>{p.label}</GameButton>
                ))}
                <GameButton variant="ghost" size="sm" disabled={total === 0} onClick={() => patch({ evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } })}>Clear</GameButton>
              </>
            )}
          />
          {stone && <p className="mt-1 text-xs text-muted">Stats shown for {battleSp.name}, before it Mega Evolves.</p>}
        </div>
      </div>

      <MoveTable rows={rows} chosen={moveList} types={battleSp.types} onChange={(m) => patch({ moves: m })} />

      {illegal.length > 0 && <p className="text-sm font-semibold text-poke-red">{name} can't learn {illegal.join(', ')}. Swap {illegal.length === 1 ? 'it' : 'them'} out before saving.</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <GameButton variant="ghost" size="sm" onClick={() => { setIoText(''); setIo('import'); }}>Import</GameButton>
          <GameButton variant="ghost" size="sm" onClick={() => { setIoText(exportSetText(draft, { teraCaptain: showTera })); setIo('export'); }}>Export</GameButton>
          <GameButton variant="ghost" size="sm" disabled={!dirty} onClick={() => setDraft(saved ?? null)}>Revert</GameButton>
        </div>
        <GameButton disabled={pendingCount === 0} onClick={onSave}>{pendingCount > 1 ? `Save all (${pendingCount})` : 'Save'}</GameButton>
      </div>

      {io === 'import' && (
        <ImportModal
          text={ioText}
          setText={setIoText}
          onClose={() => setIo(null)}
          onImport={(t) => {
            setDraft(fillSet(entry, Sets.importSet(t) as Partial<BattleSet>));
            setIo(null);
          }}
        />
      )}
      {io === 'export' && (
        <ResponsiveDialog title="Showdown export" onClose={() => setIo(null)} footer={<GameButton onClick={() => { void navigator.clipboard?.writeText(ioText); setIo(null); }}>Copy &amp; close</GameButton>}>
          <textarea className="field h-56 w-full font-mono text-sm" readOnly value={ioText} aria-label="Exported set" />
        </ResponsiveDialog>
      )}
    </div>
  );
}

function ImportModal({ text, setText, onClose, onImport }: {
  text: string; setText: (t: string) => void; onClose: () => void; onImport: (t: string) => void;
}) {
  return (
    <ResponsiveDialog
      title="Import Showdown set"
      onClose={onClose}
      footer={<><GameButton variant="ghost" onClick={onClose}>Cancel</GameButton><GameButton disabled={!text.trim()} onClick={() => onImport(text)}>Import</GameButton></>}
    >
      <p className="mb-2 text-sm text-muted">Paste one set. The species line is ignored; it applies to the selected Pokemon. Remember to save after importing. To paste a whole team, use Import sets at the top.</p>
      <textarea className="field h-56 w-full font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Showdown set text" />
    </ResponsiveDialog>
  );
}

export function TeamScreen() {
  const run = useGame((s) => s.run);
  const closeOverlay = useGame((s) => s.closeOverlay);
  const human = run ? humanCoach(run) : null;
  const [sel, setSel] = useState<SpeciesId | null>(human?.roster[0]?.species ?? null);
  const [roster, setRoster] = useState<'import' | 'export' | null>(null);
  const [leaving, setLeaving] = useState(false);
  const saveSet = useGame((s) => s.saveSet);
  const setToast = useGame((s) => s.setToast);
  const draftsRun = useTeamDrafts((s) => s.runId);
  const allDrafts = useTeamDrafts((s) => s.drafts);
  const drafts = run && draftsRun === run.id ? allDrafts : {};
  const pending = Object.keys(drafts);
  const sets = human?.sets;
  // A saved set that changes (Save, Import sets) replaces that mon's unsaved edits.
  const prevSets = useRef(sets);
  useEffect(() => {
    const prev = prevSets.current;
    prevSets.current = sets;
    if (!prev || !sets || prev === sets) return;
    const changed = Object.keys(useTeamDrafts.getState().drafts).filter((sp) => sets[sp] !== prev[sp]);
    if (changed.length) useTeamDrafts.getState().drop(changed);
  }, [sets]);
  // Closing the tab with unsaved edits asks first.
  useEffect(() => {
    if (pending.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending.length]);
  if (!run || !human) return null;
  const monName = (sp: SpeciesId) => displayName(getDraftMon(sp)?.name ?? sp);
  /** Saves every mon's edits at once, or none if any has a move it can't learn (that mon opens). */
  const saveAll = async (): Promise<boolean> => {
    const entries = Object.entries(drafts);
    for (const [sp, d] of entries) {
      const rows = await moveRows(sp).catch(() => null);
      const bad = rows ? d.moves.filter((m) => m && !rows.some((r) => r.name.toLowerCase() === m.toLowerCase())) : [];
      if (bad.length) {
        setSel(sp);
        setToast(`${monName(sp)} can't learn ${bad.join(', ')}. Nothing saved yet.`);
        return false;
      }
    }
    for (const [sp, d] of entries) saveSet(sp, { ...d, moves: d.moves.filter(Boolean) });
    setToast(entries.length === 1 ? `Saved ${monName(entries[0]![0])}'s set.` : `Saved ${entries.length} sets.`);
    return true;
  };
  const close = () => (pending.length ? setLeaving(true) : closeOverlay());
  const current = human.roster.find((r) => r.species === sel) ?? human.roster[0];
  const mon = current ? getDraftMon(current.species) : undefined;
  const teraEnabled = run.config.teraCaptains > 0;
  const opponents = run.coaches.filter((c) => c.id !== human.id).flatMap((c) => c.roster.map((r) => r.species));

  return (
    <div className="space-y-4">
      <div className="title-band flex flex-wrap items-center justify-between gap-2">
        <h1 className="mr-auto font-display text-3xl font-bold uppercase leading-none">{human.abbrev} team</h1>
        <CloseButton onClick={close} label="Close team editor" className="sm:order-last" />
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full">
          <GameButton variant="secondary" size="sm" onClick={() => setRoster('import')}>Import sets</GameButton>
          <GameButton
            variant="secondary"
            size="sm"
            disabled={!human.roster.some((r) => human.sets[r.species])}
            onClick={() => setRoster('export')}
          >
            Export all
          </GameButton>
        </div>
      </div>
      {roster === 'import' && <ImportRosterDialog roster={human.roster} teraEnabled={teraEnabled} onClose={() => setRoster(null)} />}
      {roster === 'export' && <ExportRosterDialog text={rosterExportText(human.roster, human.sets, teraEnabled)} onClose={() => setRoster(null)} />}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <Panel title="Roster" className="max-md:sticky max-md:top-[var(--topbar-h,3.75rem)] max-md:z-20" aside={<span>{human.pointsSpent}/{run.config.budget} pts</span>}>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1 max-md:no-scrollbar max-md:-mx-1 max-md:flex max-md:snap-x max-md:overflow-x-auto max-md:overscroll-x-contain max-md:px-1 max-md:pb-1">
            {human.roster.map((r) => {
              const m = getDraftMon(r.species);
              const on = r.species === current?.species;
              const hasSet = !!human.sets[r.species];
              const edited = !!drafts[r.species];
              return (
                <li key={r.species} className="max-md:shrink-0 max-md:snap-start">
                  <button
                    type="button"
                    onClick={() => setSel(r.species)}
                    className={`focus-ring flex w-full items-center gap-2 rounded-lg border-2 px-2 py-0.5 text-left max-md:min-h-12 max-md:w-auto max-md:pr-3 ${on ? 'border-poke-yellow bg-panel-hi' : 'border-transparent bg-panel-inset hover:border-edge'}`}
                  >
                    <IconBadge name={m?.name ?? r.species} roles={rolesOf(r)} tone="you" />
                    <span className="flex-1 truncate font-semibold max-md:flex-none">{displayName(m?.name ?? r.species)}</span>
                    {edited
                      ? <span className="text-xs font-bold text-poke-yellow" title="Unsaved changes">EDITED</span>
                      : !hasSet && <span className="text-xs font-bold text-poke-yellow">NO SET</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {current && mon && (
          <Panel
            title={displayName(mon.name)}
            aside={(
              <span className="flex items-center gap-2">
                {rolesOf(current).length > 0 && <RoleTags roles={rolesOf(current)} />}
                <GameButton variant="ghost" size="sm" onClick={() => useMonDetail.getState().open(current.species, { coachId: human.id })}>Details</GameButton>
              </span>
            )}
          >
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center">
              <MonDetailButton species={current.species} coachId={human.id} className="self-center"><PokeSprite name={mon.name} size={112} /></MonDetailButton>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2"><TypePills types={mon.types} /><PriceBadge points={mon.points} /></div>
                <StatBlock stats={mon.baseStats} compact />
              </div>
            </div>
            <SetEditor
              key={current.species}
              entry={current}
              saved={human.sets[current.species]}
              draft={drafts[current.species] ?? human.sets[current.species] ?? null}
              setDraft={(d) => useTeamDrafts.getState().put(run.id, current.species, d, human.sets[current.species])}
              pendingCount={pending.length}
              onSave={() => void saveAll()}
              showTera={teraEnabled && current.isTeraCaptain}
              opponents={opponents}
            />
          </Panel>
        )}
      </div>
      {leaving && (
        <ResponsiveDialog
          title="Unsaved changes"
          onClose={() => setLeaving(false)}
          footer={(
            <>
              <GameButton variant="ghost" onClick={() => { useTeamDrafts.getState().clear(); setLeaving(false); closeOverlay(); }}>Discard</GameButton>
              <GameButton onClick={() => void saveAll().then((ok) => { setLeaving(false); if (ok) closeOverlay(); })}>Save and close</GameButton>
            </>
          )}
        >
          <DialogueBox>
            You changed {pending.length === 1 ? 'the set' : 'the sets'} of {andList(pending.map(monName))} without saving.
            Save {pending.length === 1 ? 'it' : 'them'} before you go?
          </DialogueBox>
        </ResponsiveDialog>
      )}
    </div>
  );
}
