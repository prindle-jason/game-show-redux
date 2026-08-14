import type { Round } from '@gameshow/schema';
import type { RoundMediaAsset } from './media-upload.js';

/**
 * Hardcoded round used to exercise the queue flow until the zip
 * import/export format exists — see docs/milestone-room-shell.md.
 */
export function createFixtureRound(): Round {
  return {
    schemaVersion: 1,
    roundId: crypto.randomUUID(),
    title: 'Science (fixture)',
    type: 'jeopardy',
    data: {
      categories: [
        {
          name: 'Science',
          clues: [
            { value: 200, clue: { text: 'H2O' }, answer: { text: 'What is water?' } },
            {
              value: 400,
              clue: { text: 'E=mc^2' },
              answer: { text: 'What is relativity?' },
              isDailyDouble: true,
            },
          ],
        },
        {
          name: 'History',
          clues: [
            {
              value: 200,
              clue: { text: 'The year the Titanic sank' },
              answer: { text: 'What is 1912?' },
            },
          ],
        },
        {
          name: 'Media',
          clues: [
            {
              value: 200,
              clue: { media: { kind: 'image', assetId: 'fixture-image' } },
              answer: { text: 'Who is Link?' },
            },
            {
              value: 400,
              clue: { media: { kind: 'audio', assetId: 'fixture-audio' } },
              answer: { text: 'What is a match victory?' },
            },
            {
              value: 600,
              clue: { media: { kind: 'video', assetId: 'fixture-video' } },
              answer: { text: 'What is prndddl?' },
            },
          ],
        },
      ],
    },
  };
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load fixture asset ${url}: ${response.status}`);
  }
  return response.blob();
}

/**
 * Loads the media referenced by `createFixtureRound()`'s "Media" category from
 * `public/fixtures/` (served as static files by Vite/Pages) — fetched lazily
 * rather than bundled, since `uploadRoundMedia` needs real `Blob`s to upload.
 */
export async function loadFixtureMediaAssets(): Promise<RoundMediaAsset[]> {
  const [image, audio, video] = await Promise.all([
    fetchAsBlob('/fixtures/alttp-link.png'),
    fetchAsBlob('/fixtures/ssbm-success.mp3'),
    fetchAsBlob('/fixtures/prndddl.mp4'),
  ]);
  return [
    { assetId: 'fixture-image', kind: 'image', blob: image },
    { assetId: 'fixture-audio', kind: 'audio', blob: audio },
    { assetId: 'fixture-video', kind: 'video', blob: video },
  ];
}
