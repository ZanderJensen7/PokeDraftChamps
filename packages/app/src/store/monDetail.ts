import { create } from 'zustand';
import type { CoachId, SpeciesId } from '@pdc/engine';

export interface MonDetailTarget { species: SpeciesId; coachId?: CoachId }

interface MonDetailStore {
  target: MonDetailTarget | null;
  /** The element that opened the sheet; focus returns to it on close. */
  opener: HTMLElement | null;
  open: (species: SpeciesId, opts?: { coachId?: CoachId }) => void;
  close: () => void;
}

/** The one mon detail sheet (mounted in App.tsx): any component opens it with a species and, in a league, its coach. */
export const useMonDetail = create<MonDetailStore>((set, get) => ({
  target: null,
  opener: null,
  open: (species, opts = {}) => {
    const active = document.activeElement;
    set({ target: { species, coachId: opts.coachId }, opener: active instanceof HTMLElement ? active : null });
  },
  close: () => {
    const { opener } = get();
    set({ target: null, opener: null });
    if (opener?.isConnected) opener.focus();
  },
}));
