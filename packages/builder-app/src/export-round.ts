import { CURRENT_ROUND_SCHEMA_VERSION, type Round } from '@gameshow/schema';
import JSZip from 'jszip';
import type { WheelDraft } from './wheel-draft-store.js';

export function wheelDraftToRound(draft: WheelDraft): Round {
  return {
    schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
    roundId: draft.roundId,
    title: draft.title,
    type: 'wheel-of-fortune',
    data: {
      category: draft.category,
      solution: draft.solution,
      wedges: draft.wedges,
      vowelCost: draft.vowelCost,
      solveBonus: draft.solveBonus,
    },
  };
}

/**
 * Wheel of Fortune rounds carry no media, so the zip is just `round.json` —
 * an `/assets` folder only matters for round types whose data references
 * `MediaRef`s.
 */
export async function exportWheelRound(draft: WheelDraft): Promise<Blob> {
  const round = wheelDraftToRound(draft);
  const zip = new JSZip();
  zip.file('round.json', JSON.stringify(round, null, 2));
  return zip.generateAsync({ type: 'blob' });
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'round';
}

export function downloadRoundZip(blob: Blob, title: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(title)}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}
