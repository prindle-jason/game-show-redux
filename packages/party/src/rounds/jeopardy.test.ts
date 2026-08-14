import type { JeopardyBoardData, MediaRef, ResolvedMediaRef } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import {
  createInitialJeopardyState,
  isJeopardyComplete,
  listJeopardyMediaUrls,
  reduceJeopardy,
  resolveJeopardyMedia,
  toJeopardyContestantView,
} from './jeopardy.js';

const BOARD: JeopardyBoardData = {
  categories: [
    {
      name: 'A',
      clues: [
        { value: 100, clue: { text: 'a1' }, answer: { text: 'ans a1' } },
        { value: 200, clue: { text: 'a2' }, answer: { text: 'ans a2' }, isDailyDouble: true },
      ],
    },
    {
      name: 'B',
      clues: [{ value: 100, clue: { text: 'b1' }, answer: { text: 'ans b1' } }],
    },
  ],
};

/** BOARD has no media, so this should never actually run. */
function noopResolveMediaRef(ref: MediaRef): ResolvedMediaRef {
  throw new Error(`unexpected media resolution for ${JSON.stringify(ref)}`);
}

const RESOLVED_BOARD = resolveJeopardyMedia(BOARD, noopResolveMediaRef);

const CONTESTANT_IDS = ['p1', 'p2'];
const HOST_CTX = { requesterId: 'host', isHost: true, contestantIds: CONTESTANT_IDS };
function ctxFor(requesterId: string) {
  return { requesterId, isHost: false, contestantIds: CONTESTANT_IDS };
}

function initialState() {
  return createInitialJeopardyState('round-1', CONTESTANT_IDS);
}

describe('createInitialJeopardyState', () => {
  it('seeds a controlling player from the contestant pool, deterministically', () => {
    const first = createInitialJeopardyState('round-1', CONTESTANT_IDS);
    const second = createInitialJeopardyState('round-1', CONTESTANT_IDS);
    expect(first.controllingPlayerId).toEqual(second.controllingPlayerId);
    expect(CONTESTANT_IDS).toContain(first.controllingPlayerId);
  });

  it('has no controlling player when there are no contestants', () => {
    const state = createInitialJeopardyState('round-1', []);
    expect(state.controllingPlayerId).toBeNull();
  });
});

describe('pick-clue', () => {
  it('rejects a non-host', () => {
    const result = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('opens buzzing for a regular clue', () => {
    const result = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      HOST_CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.activeClue).toEqual({ categoryIndex: 0, clueIndex: 0 });
    expect(result.state.buzzedPlayerId).toBeNull();
  });

  it('rejects picking an already-revealed clue', () => {
    let state = initialState();
    const pick = reduceJeopardy(
      state,
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      HOST_CTX,
    );
    if (!pick.ok) throw new Error('unreachable');
    const buzz = reduceJeopardy(pick.state, BOARD, { type: 'buzz' }, ctxFor('p1'));
    if (!buzz.ok) throw new Error('unreachable');
    const judged = reduceJeopardy(buzz.state, BOARD, { type: 'judge', correct: true }, HOST_CTX);
    if (!judged.ok) throw new Error('unreachable');
    state = judged.state;

    const repick = reduceJeopardy(
      state,
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      HOST_CTX,
    );
    expect(repick).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('buzz race', () => {
  function opened() {
    const result = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      HOST_CTX,
    );
    if (!result.ok) throw new Error('unreachable');
    return result.state;
  }

  it('the first buzz wins', () => {
    const result = reduceJeopardy(opened(), BOARD, { type: 'buzz' }, ctxFor('p1'));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.buzzedPlayerId).toBe('p1');
  });

  it('rejects a later buzz once someone is in', () => {
    const first = reduceJeopardy(opened(), BOARD, { type: 'buzz' }, ctxFor('p1'));
    if (!first.ok) throw new Error('unreachable');
    const second = reduceJeopardy(first.state, BOARD, { type: 'buzz' }, ctxFor('p2'));
    expect(second).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a buzz from someone locked out of this clue', () => {
    const state = { ...opened(), lockedOutPlayerIds: ['p1'] };
    const result = reduceJeopardy(state, BOARD, { type: 'buzz' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('judge (regular clue)', () => {
  function buzzedIn(playerId: string) {
    const pick = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      HOST_CTX,
    );
    if (!pick.ok) throw new Error('unreachable');
    const buzz = reduceJeopardy(pick.state, BOARD, { type: 'buzz' }, ctxFor(playerId));
    if (!buzz.ok) throw new Error('unreachable');
    return buzz.state;
  }

  it('rejects a non-host', () => {
    const result = reduceJeopardy(
      buzzedIn('p1'),
      BOARD,
      { type: 'judge', correct: true },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('scores the buzzed player on correct, reveals the clue, and hands them control', () => {
    const result = reduceJeopardy(
      buzzedIn('p1'),
      BOARD,
      { type: 'judge', correct: true },
      HOST_CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scoreDeltas).toEqual({ p1: 100 });
    expect(result.state.activeClue).toBeNull();
    expect(result.state.revealedClues).toEqual([{ categoryIndex: 0, clueIndex: 0 }]);
    expect(result.state.controllingPlayerId).toBe('p1');
  });

  it('deducts and locks out on incorrect, reopening the buzz', () => {
    const result = reduceJeopardy(
      buzzedIn('p1'),
      BOARD,
      { type: 'judge', correct: false },
      HOST_CTX,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scoreDeltas).toEqual({ p1: -100 });
    expect(result.state.buzzedPlayerId).toBeNull();
    expect(result.state.lockedOutPlayerIds).toEqual(['p1']);
    expect(result.state.activeClue).toEqual({ categoryIndex: 0, clueIndex: 0 });
  });

  it('auto-resolves the clue once every contestant is locked out', () => {
    const afterFirst = reduceJeopardy(
      buzzedIn('p1'),
      BOARD,
      { type: 'judge', correct: false },
      HOST_CTX,
    );
    if (!afterFirst.ok) throw new Error('unreachable');
    const p2Buzz = reduceJeopardy(afterFirst.state, BOARD, { type: 'buzz' }, ctxFor('p2'));
    if (!p2Buzz.ok) throw new Error('unreachable');
    const afterSecond = reduceJeopardy(
      p2Buzz.state,
      BOARD,
      { type: 'judge', correct: false },
      HOST_CTX,
    );
    expect(afterSecond.ok).toBe(true);
    if (!afterSecond.ok) throw new Error('unreachable');
    expect(afterSecond.state.activeClue).toBeNull();
    expect(afterSecond.state.revealedClues).toEqual([{ categoryIndex: 0, clueIndex: 0 }]);
  });
});

describe('Daily Double wager', () => {
  function ddPicked() {
    const result = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 1 },
      HOST_CTX,
    );
    if (!result.ok) throw new Error('unreachable');
    return result.state;
  }

  it('rejects a buzz on a Daily Double', () => {
    const result = reduceJeopardy(ddPicked(), BOARD, { type: 'buzz' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a wager from a non-controlling player', () => {
    const state = ddPicked();
    const other = CONTESTANT_IDS.find((id) => id !== state.controllingPlayerId);
    if (!other) throw new Error('unreachable');
    const result = reduceJeopardy(state, BOARD, { type: 'wager', amount: 500 }, ctxFor(other));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('accepts a wager from the controlling player and sets them up to answer', () => {
    const state = ddPicked();
    const controller = state.controllingPlayerId;
    if (!controller) throw new Error('unreachable');
    const result = reduceJeopardy(state, BOARD, { type: 'wager', amount: 500 }, ctxFor(controller));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.pendingWager).toBe(500);
    expect(result.state.buzzedPlayerId).toBe(controller);
  });

  it('does not reopen the clue when the Daily Double is answered incorrectly', () => {
    const state = ddPicked();
    const controller = state.controllingPlayerId;
    if (!controller) throw new Error('unreachable');
    const wagered = reduceJeopardy(
      state,
      BOARD,
      { type: 'wager', amount: 500 },
      ctxFor(controller),
    );
    if (!wagered.ok) throw new Error('unreachable');
    const judged = reduceJeopardy(
      wagered.state,
      BOARD,
      { type: 'judge', correct: false },
      HOST_CTX,
    );
    expect(judged.ok).toBe(true);
    if (!judged.ok) throw new Error('unreachable');
    expect(judged.scoreDeltas).toEqual({ [controller]: -500 });
    expect(judged.state.activeClue).toBeNull();
    expect(judged.state.revealedClues).toEqual([{ categoryIndex: 0, clueIndex: 1 }]);
  });
});

describe('skip-clue', () => {
  function opened() {
    const result = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      HOST_CTX,
    );
    if (!result.ok) throw new Error('unreachable');
    return result.state;
  }

  it('rejects a non-host', () => {
    const result = reduceJeopardy(opened(), BOARD, { type: 'skip-clue' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects skipping when no clue is active', () => {
    const result = reduceJeopardy(initialState(), BOARD, { type: 'skip-clue' }, HOST_CTX);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects skipping while someone is buzzed in', () => {
    const buzz = reduceJeopardy(opened(), BOARD, { type: 'buzz' }, ctxFor('p1'));
    if (!buzz.ok) throw new Error('unreachable');
    const result = reduceJeopardy(buzz.state, BOARD, { type: 'skip-clue' }, HOST_CTX);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('reveals the clue with no scoring and control unchanged', () => {
    const state = opened();
    const result = reduceJeopardy(state, BOARD, { type: 'skip-clue' }, HOST_CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scoreDeltas).toBeUndefined();
    expect(result.state.activeClue).toBeNull();
    expect(result.state.revealedClues).toEqual([{ categoryIndex: 0, clueIndex: 0 }]);
    expect(result.state.controllingPlayerId).toBe(state.controllingPlayerId);
  });

  it('clears lockouts from a partially-played clue', () => {
    const wrong = reduceJeopardy(opened(), BOARD, { type: 'buzz' }, ctxFor('p1'));
    if (!wrong.ok) throw new Error('unreachable');
    const judged = reduceJeopardy(wrong.state, BOARD, { type: 'judge', correct: false }, HOST_CTX);
    if (!judged.ok) throw new Error('unreachable');
    const result = reduceJeopardy(judged.state, BOARD, { type: 'skip-clue' }, HOST_CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.lockedOutPlayerIds).toEqual([]);
  });

  it('skips an unwagered Daily Double, clearing any pending state', () => {
    const dd = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 1 },
      HOST_CTX,
    );
    if (!dd.ok) throw new Error('unreachable');
    const result = reduceJeopardy(dd.state, BOARD, { type: 'skip-clue' }, HOST_CTX);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.revealedClues).toEqual([{ categoryIndex: 0, clueIndex: 1 }]);
    expect(result.state.pendingWager).toBeNull();
  });

  it('rejects skipping a Daily Double once a wager is placed', () => {
    const dd = reduceJeopardy(
      initialState(),
      BOARD,
      { type: 'pick-clue', categoryIndex: 0, clueIndex: 1 },
      HOST_CTX,
    );
    if (!dd.ok) throw new Error('unreachable');
    const controller = dd.state.controllingPlayerId;
    if (!controller) throw new Error('unreachable');
    const wagered = reduceJeopardy(
      dd.state,
      BOARD,
      { type: 'wager', amount: 500 },
      ctxFor(controller),
    );
    if (!wagered.ok) throw new Error('unreachable');
    const result = reduceJeopardy(wagered.state, BOARD, { type: 'skip-clue' }, HOST_CTX);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('isJeopardyComplete', () => {
  it('is false until every clue has been revealed', () => {
    const state = initialState();
    expect(isJeopardyComplete(state, BOARD)).toBe(false);
    expect(
      isJeopardyComplete({ ...state, revealedClues: [{ categoryIndex: 0, clueIndex: 0 }] }, BOARD),
    ).toBe(false);
  });

  it('is true once every clue has been revealed', () => {
    const state = {
      ...initialState(),
      revealedClues: [
        { categoryIndex: 0, clueIndex: 0 },
        { categoryIndex: 0, clueIndex: 1 },
        { categoryIndex: 1, clueIndex: 0 },
      ],
    };
    expect(isJeopardyComplete(state, BOARD)).toBe(true);
  });
});

describe('toJeopardyContestantView', () => {
  it('hides answers and unrevealed daily-double flags, reveals only the active clue', () => {
    const state = { ...initialState(), activeClue: { categoryIndex: 0, clueIndex: 1 } };
    const view = toJeopardyContestantView(state, RESOLVED_BOARD);
    expect(view.type).toBe('jeopardy');
    expect(view.categories[0]?.clues).toEqual([
      { value: 100, revealed: false },
      { value: 200, revealed: false },
    ]);
    expect(view.activeClue).toEqual({
      categoryIndex: 0,
      clueIndex: 1,
      clue: { text: 'a2' },
      isDailyDouble: true,
    });
  });
});

describe('resolveJeopardyMedia / listJeopardyMediaUrls', () => {
  const BOARD_WITH_MEDIA: JeopardyBoardData = {
    categories: [
      {
        name: 'A',
        clues: [
          {
            value: 100,
            clue: { text: 'a1', media: { kind: 'image', assetId: 'img-1' } },
            answer: { text: 'ans a1', media: { kind: 'audio', assetId: 'aud-1' } },
          },
          {
            value: 200,
            clue: { media: { kind: 'slideshow', assetIds: ['slide-1', 'slide-2'] } },
            answer: { text: 'ans a2' },
          },
        ],
      },
    ],
  };

  function resolveByAssetId(ref: MediaRef): ResolvedMediaRef {
    if (ref.kind === 'slideshow') {
      return { kind: 'slideshow', urls: ref.assetIds.map((id) => `https://media/${id}`) };
    }
    return { kind: ref.kind, url: `https://media/${ref.assetId}` };
  }

  it('rewrites every MediaRef to a ResolvedMediaRef, leaving text untouched', () => {
    const resolved = resolveJeopardyMedia(BOARD_WITH_MEDIA, resolveByAssetId);
    expect(resolved.categories[0]?.clues[0]?.clue).toEqual({
      text: 'a1',
      media: { kind: 'image', url: 'https://media/img-1' },
    });
    expect(resolved.categories[0]?.clues[0]?.answer).toEqual({
      text: 'ans a1',
      media: { kind: 'audio', url: 'https://media/aud-1' },
    });
    expect(resolved.categories[0]?.clues[1]?.clue).toEqual({
      media: { kind: 'slideshow', urls: ['https://media/slide-1', 'https://media/slide-2'] },
    });
  });

  it('lists every media URL across clues and answers', () => {
    const resolved = resolveJeopardyMedia(BOARD_WITH_MEDIA, resolveByAssetId);
    expect(listJeopardyMediaUrls(resolved)).toEqual([
      'https://media/img-1',
      'https://media/aud-1',
      'https://media/slide-1',
      'https://media/slide-2',
    ]);
  });

  it('lists no URLs for a media-free board', () => {
    expect(listJeopardyMediaUrls(RESOLVED_BOARD)).toEqual([]);
  });
});
