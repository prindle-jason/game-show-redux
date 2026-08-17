import { CURRENT_ROUND_SCHEMA_VERSION, type Round } from '@gameshow/schema';
import JSZip from 'jszip';
import { type FinalJeopardyDraft, finalJeopardyDraftToData } from './final-jeopardy-draft-store.js';
import { addMediaAssetsToZip } from './media-assets.js';

export function finalJeopardyDraftToRound(draft: FinalJeopardyDraft): Round {
  return {
    schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
    roundId: draft.roundId,
    title: draft.title,
    type: 'final-jeopardy',
    data: finalJeopardyDraftToData(draft),
  };
}

export async function exportFinalJeopardyRound(draft: FinalJeopardyDraft): Promise<Blob> {
  const round = finalJeopardyDraftToRound(draft);
  const zip = new JSZip();
  zip.file('round.json', JSON.stringify(round, null, 2));
  await addMediaAssetsToZip(zip, round, draft.assets);
  return zip.generateAsync({ type: 'blob' });
}
