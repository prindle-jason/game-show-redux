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

/**
 * Hand-authored Final Jeopardy fixture round, to exercise the phase machine
 * until real round import/authoring exists.
 */
export function createFinalJeopardyFixtureRound(): Round {
  return {
    schemaVersion: 1,
    roundId: crypto.randomUUID(),
    title: 'Final Jeopardy (fixture)',
    type: 'final-jeopardy',
    data: {
      category: 'World Capitals',
      clue: { text: 'This African capital sits at the highest elevation of any national capital' },
      answer: { text: 'What is Addis Ababa?' },
    },
  };
}

/**
 * Hand-authored Wheel of Fortune fixture round, to exercise the turn/spin/
 * solve flow until real round import/authoring exists.
 */
export function createWheelFixtureRound(): Round {
  return {
    schemaVersion: 1,
    roundId: crypto.randomUUID(),
    title: 'Wheel of Fortune (fixture)',
    type: 'wheel-of-fortune',
    data: {
      category: 'Video Games',
      solution: ['', 'IT IS', 'DANGEROUS', 'TO GO ALONE'],
      wedges: [
        { kind: 'cash', value: 300 },
        { kind: 'cash', value: 500 },
        { kind: 'cash', value: 700 },
        { kind: 'bankrupt' },
        { kind: 'lose-turn' },
      ],
      vowelCost: 250,
      solveBonus: 1000,
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
