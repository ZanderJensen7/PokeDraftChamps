// Team editor extras: the legal-move picker, sample sets, and whole-roster Showdown import / export.
import { useEffect, useMemo, useState } from 'react';
import type { BattleSet, ImportReport, RosterEntry, SampleSet } from '@pdc/engine';
import { exportSetText, getDraftMon, importRosterSets, loadSampleSets, setRulesFor } from '@pdc/engine';
import { useGame } from '../store/useGame';
import { GameButton, ResponsiveDialog, TypePill } from './ui';
import { displayName } from '../game/names';
import { moveInfo } from '../game/sets';

/** Search box + every legal move of the mon (type, category, power); picking one fills the slot. */
export function MovePickerDialog({ moves, taken, onPick, onClose }: {
  moves: string[] | null; taken: string[]; onPick: (move: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (moves ?? [])
      .filter((m) => !taken.some((t) => t.toLowerCase() === m.toLowerCase()))
      .map((m) => ({ name: m, info: moveInfo(m) }))
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.info?.type.toLowerCase().startsWith(q) || r.info?.category.toLowerCase().startsWith(q));
  }, [moves, taken, query]);
  return (
    <ResponsiveDialog title="Pick a move" onClose={onClose} full>
      <input
        autoFocus
        type="search"
        className="field mb-2 w-full"
        placeholder="Search by name, type or Physical / Special / Status"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search moves"
      />
      {moves === null ? <p className="text-sm text-muted">Loading moves…</p> : (
        <ul className="max-h-[55vh] space-y-1 overflow-y-auto" aria-label="Legal moves">
          {rows.map(({ name, info }) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => onPick(name)}
                className="focus-ring flex min-h-11 w-full items-center gap-2 rounded-lg border-2 border-transparent bg-panel-inset px-2 text-left hover:border-edge"
              >
                <span className="flex-1 font-semibold">{name}</span>
                {info && (
                  <>
                    <TypePill type={info.type} size="xs" />
                    <span className="w-20 text-right text-xs text-muted">{info.category === 'Status' ? 'Status' : `${info.power || '—'} ${info.category.slice(0, 4)}`}</span>
                  </>
                )}
              </button>
            </li>
          ))}
          {!rows.length && <li className="py-3 text-center text-sm text-muted">{query ? 'No legal move matches.' : 'No moves left to pick.'}</li>}
        </ul>
      )}
    </ResponsiveDialog>
  );
}

/** Smogon + randoms sample sets for a mon; picking one hands the partial set to the editor. */
export function SampleSets({ entry, onPick }: { entry: RosterEntry; onPick: (s: SampleSet) => void }) {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState<SampleSet[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setSets(null);
    loadSampleSets(entry.species).then((s) => { if (live) setSets(s); }).catch(() => { if (live) setSets([]); });
    return () => { live = false; };
  }, [open, entry.species]);

  return (
    <div>
      <GameButton variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide sample sets' : 'Sample sets'}
      </GameButton>
      {open && (
        <div className="mt-2 space-y-1">
          {sets === null && <p className="text-sm text-muted">Loading sample sets…</p>}
          {sets?.length === 0 && <p className="text-sm text-muted">No sample sets available.</p>}
          {sets?.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg bg-panel-inset px-2 py-1">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-semibold">{s.label}</span>
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted">{s.source}</span>
                </div>
                <div className="truncate text-xs text-muted">{[s.set.item, ...(s.set.moves ?? [])].filter(Boolean).join(' · ')}</div>
              </div>
              <GameButton size="sm" variant="secondary" onClick={() => onPick(s)}>Use</GameButton>
            </div>
          ))}
          {sets && <p className="text-xs text-muted">Smogon sets come from data.pkmn.cc when online. Picking one only fills the editor; save to keep it.</p>}
        </div>
      )}
    </div>
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
