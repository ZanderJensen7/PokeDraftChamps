import { create } from 'zustand';
import type { BattleSet, SpeciesId } from '@pdc/engine';

interface TeamDraftsStore {
  /** The run the drafts belong to; another run's drafts are dropped. */
  runId: string | null;
  /** Unsaved edits by species: only mons whose draft differs from their saved set. */
  drafts: Record<SpeciesId, BattleSet>;
  put: (runId: string, species: SpeciesId, draft: BattleSet | null, saved: BattleSet | undefined) => void;
  drop: (species: SpeciesId[]) => void;
  clear: () => void;
}

const same = (a: BattleSet | null | undefined, b: BattleSet | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The team editor's unsaved edits (in memory only): they survive switching mons and leaving the screen until saved or discarded. */
export const useTeamDrafts = create<TeamDraftsStore>((set, get) => ({
  runId: null,
  drafts: {},
  put: (runId, species, draft, saved) => {
    const drafts = get().runId === runId ? { ...get().drafts } : {};
    if (!draft || same(draft, saved)) delete drafts[species];
    else drafts[species] = draft;
    set({ runId, drafts });
  },
  drop: (species) => {
    const drafts = { ...get().drafts };
    for (const s of species) delete drafts[s];
    set({ drafts });
  },
  clear: () => set({ drafts: {} }),
}));
