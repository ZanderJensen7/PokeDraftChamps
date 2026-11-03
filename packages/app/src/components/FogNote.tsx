import { DialogueBox } from './ui';

/** Fog of war (stake 7+): how much of an opposing roster is still hidden. Nothing when the whole roster shows. */
export function FogNote({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <DialogueBox className="text-sm">
      Fog of war: {total - shown} of {total} mons unseen. Scout their stored battles.
    </DialogueBox>
  );
}
