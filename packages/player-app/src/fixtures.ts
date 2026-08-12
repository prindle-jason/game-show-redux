import type { Round } from '@gameshow/schema';

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
      ],
    },
  };
}
