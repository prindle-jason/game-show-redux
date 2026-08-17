import { CURRENT_ROUND_SCHEMA_VERSION, type Round } from '@gameshow/schema';
import JSZip from 'jszip';
import { type JeopardyDraft, jeopardyDraftToBoardData } from './jeopardy-draft-store.js';
import { addMediaAssetsToZip } from './media-assets.js';

export function jeopardyDraftToRound(draft: JeopardyDraft): Round {
  return {
    schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
    roundId: draft.roundId,
    title: draft.title,
    type: 'jeopardy',
    data: jeopardyDraftToBoardData(draft),
  };
}

export async function exportJeopardyRound(draft: JeopardyDraft): Promise<Blob> {
  const round = jeopardyDraftToRound(draft);
  const zip = new JSZip();
  zip.file('round.json', JSON.stringify(round, null, 2));
  await addMediaAssetsToZip(zip, round, draft.assets);
  return zip.generateAsync({ type: 'blob' });
}
