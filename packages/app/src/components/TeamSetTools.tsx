// Team editor extras: recommended (sample) sets and whole-roster Showdown import / export.
import { useEffect, useMemo, useState } from 'react';
import type { BattleSet, ImportReport, RosterEntry, SampleSet, StatsTable } from '@pdc/engine';
import { exportSetText, getDraftMon, importRosterSets, loadSampleSets, randomsSampleSets, setRulesFor } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { GameButton, ItemIcon, ResponsiveDialog, TypePill, typeColor } from './ui';
import { displayName } from '../game/names';
import { STAT_LABEL, STAT_NAMES, moveInfo } from '../game/sets';

const OPEN_KEY = 'pdc.sampleSetsOpen';
let openPref: boolean | null = null;

/** The panel's last open / closed choice this browser session (sessionStorage, with a module copy when it is blocked). */
function readOpenPref(): boolean | null {
  if (openPref !== null) return openPref;
  try {
    const v = sessionStorage.getItem(OPEN_KEY);
    return v === null ? null : v === '1';
  } catch {
    return null;
  }
}

function writeOpenPref(open: boolean): void {
  openPref = open;
  try { sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* storage blocked: the module copy still holds */ }
}

function evSummary(evs: Partial<StatsTable> | undefined): string {
  return STAT_NAMES.filter((k) => (evs?.[k] ?? 0) > 0).map((k) => `${evs![k]} ${STAT_LABEL[k]}`).join(' / ') || 'no EVs';
}

function SampleCard({ sample, showTera, onUse, onMerge }: { sample: SampleSet; showTera: boolean; onUse: () => void; onMerge: () => void }) {
  const s = sample.set;
  return (
    <li className="rounded-lg border-2 border-edge bg-panel-inset p-2 max-md:w-[82%] max-md:shrink-0 max-md:snap-start">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-base font-bold">{sample.label}</span>
        <span className="text-xs font-bold uppercase tracking-wide text-muted">{sample.source}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        {s.item && <span className="flex items-center gap-1"><ItemIcon name={s.item} /><span className="font-semibold">{s.item}</span></span>}
        {s.ability && <span><span className="text-muted">Ability</span> <span className="font-semibold">{s.ability}</span></span>}
        {s.nature && <span><span className="text-muted">Nature</span> <span className="font-semibold">{s.nature}</span></span>}
        {showTera && s.teraType && <span className="flex items-center gap-1"><span className="text-muted">Tera</span><TypePill type={s.teraType} size="xs" /></span>}
      </div>
      <div className="mt-0.5 text-xs"><span className="text-muted">EVs</span> <span className="font-semibold">{evSummary(s.evs)}</span></div>
      <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Moves">
        {(s.moves ?? []).map((m) => {
          const info = moveInfo(m);
          return (
            <li key={m} className="flex items-center gap-1 rounded-full bg-panel-hi px-2 py-0.5 text-xs font-semibold">
              {info && <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: typeColor(info.type) }} />}
              {m}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <GameButton size="sm" onClick={onUse}>Use this set</GameButton>
        <GameButton size="sm" variant="ghost" onClick={onMerge} title="Keep your set; fill empty move slots with this set's moves">Merge moves only</GameButton>
      </div>
    </li>
  );
}

/**
 * Recommended sets for a mon: the randoms role sets at once, Smogon's when they arrive (listed first). Every mon starts
 * on a generated default set, so the panel is open until the player closes it; that choice sticks for the session.
 */
export function SampleSets({ entry, showTera, onPick, onMerge }: {
  entry: RosterEntry; showTera: boolean; onPick: (s: SampleSet) => void; onMerge: (s: SampleSet) => void;
}) {
  const [open, setOpenState] = useState(() => readOpenPref() ?? true);
  const [sets, setSets] = useState<SampleSet[] | null>(null);
  const randoms = useMemo(() => randomsSampleSets(entry.species), [entry.species]);
  const setOpen = (v: boolean) => { writeOpenPref(v); setOpenState(v); };

  useEffect(() => {
    if (!open) return;
    let live = true;
    setSets(null);
    loadSampleSets(entry.species).then((s) => { if (live) setSets(s); }).catch(() => { if (live) setSets([]); });
    return () => { live = false; };
  }, [open, entry.species]);

  const shown = sets ?? randoms;
  return (
    <section aria-label="Recommended sets">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">Recommended sets</h3>
        <GameButton variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'}
        </GameButton>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          {sets === null && <p className="text-sm text-muted" role="status">Loading Smogon sets… the randoms sets are ready below.</p>}
          {sets !== null && shown.length === 0 && <p className="text-sm text-muted">No sample sets available.</p>}
          <ul className="grid gap-2 md:grid-cols-2 max-md:no-scrollbar max-md:flex max-md:snap-x max-md:overflow-x-auto max-md:overscroll-x-contain max-md:pb-1" aria-label="Sample sets">
            {shown.map((s) => <SampleCard key={s.id} sample={s} showTera={showTera} onUse={() => onPick(s)} onMerge={() => onMerge(s)} />)}
          </ul>
          <p className="text-xs text-muted">Smogon sets come from data.pkmn.cc when online. Picking one only fills the editor; save to keep it.</p>
        </div>
      )}
    </section>
  );
}

function ReportList({ report }: { report: ImportReport }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="font-semibold">
        Applied {report.applied.length} set{report.applied.length === 1 ? '' : 's'}
        {report.skipped.length > 0 && `, skipped ${report.skipped.length}`}.
      </p>
      {report.applied.length > 0 && (
        <ul className="space-y-1 text-sm">
          {report.applied.map((a) => (
            <li key={a.rosterId}>
              <span className="font-semibold">{displayName(getDraftMon(a.rosterId)?.name ?? a.rosterId)}</span>
              {a.warnings.map((w) => <div key={w} className="text-xs text-poke-yellow">⚠ {w}</div>)}
            </li>
          ))}
        </ul>
      )}
      {report.skipped.length > 0 && (
        <ul className="space-y-1 text-sm">
          {report.skipped.map((s, i) => (
            <li key={i}>
              <span className="font-semibold">{s.label}</span>
              <div className="text-xs text-loss">Skipped: {s.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Paste Showdown text for one or many mons; valid sets are saved, the rest are listed with why. */
export function ImportRosterDialog({ roster, teraEnabled, onClose }: { roster: RosterEntry[]; teraEnabled: boolean; onClose: () => void }) {
  const saveSet = useGame((s) => s.saveSet);
  const setToast = useGame((s) => s.setToast);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const r = await importRosterSets(text, roster, { teraEnabled });
      for (const a of r.applied) saveSet(a.rosterId, a.set);
      setReport(r);
      if (r.applied.length) setToast(`Imported ${r.applied.length} set${r.applied.length === 1 ? '' : 's'}.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      title="Import sets"
      onClose={onClose}
      wide
      footer={report
        ? <><GameButton variant="ghost" onClick={() => setReport(null)}>Import more</GameButton><GameButton onClick={onClose}>Done</GameButton></>
        : <><GameButton variant="ghost" onClick={onClose}>Cancel</GameButton><GameButton disabled={!text.trim() || busy} onClick={() => { void run(); }}>{busy ? 'Importing…' : 'Import'}</GameButton></>}
    >
      {report ? <ReportList report={report} /> : (
        <>
          <p className="mb-2 text-sm text-muted">
            Paste Showdown export text for one or many Pokemon. Each set goes to the roster Pokemon with the same species (a Mega pick
            by its Mega name or its stone). Sets are saved straight away; illegal ones are skipped and listed.
          </p>
          <textarea className="field h-56 w-full font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Showdown team text" />
        </>
      )}
    </ResponsiveDialog>
  );
}

/** The whole roster's saved sets as Showdown text (Tera Type lines for Tera captains only). */
export function rosterExportText(roster: RosterEntry[], sets: Record<string, BattleSet>, teraEnabled: boolean): string {
  return roster
    .filter((r) => sets[r.species])
    .map((r) => exportSetText(sets[r.species]!, { teraCaptain: setRulesFor(r, teraEnabled).teraCaptain }).trimEnd())
    .join('\n\n');
}

export function ExportRosterDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const setToast = useGame((s) => s.setToast);
  return (
    <ResponsiveDialog
      title="Showdown export: whole roster"
      onClose={onClose}
      wide
      footer={<GameButton onClick={() => { void navigator.clipboard?.writeText(text); setToast('Copied the roster.'); onClose(); }}>Copy &amp; close</GameButton>}
    >
      <textarea className="field h-72 w-full font-mono text-sm" readOnly value={text} aria-label="Exported roster" />
    </ResponsiveDialog>
  );
}
