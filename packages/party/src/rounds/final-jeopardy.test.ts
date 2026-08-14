import type { MediaRef, ResolvedMediaRef } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import {
  createInitialFinalJeopardyState,
  isFinalJeopardyComplete,
  listFinalJeopardyMediaUrls,
  reduceFinalJeopardy,
  resolveFinalJeopardyMedia,
  toFinalJeopardyContestantView,
} from './final-jeopardy.js';

const DATA = {
  category: 'History',
  clue: { text: 'Signed in 1776' },
  answer: { text: 'What is the Declaration of Independence?' },
};

function noopResolveMediaRef(ref: MediaRef): ResolvedMediaRef {
  throw new Error(`unexpected media resolution for ${JSON.stringify(ref)}`);
}

const RESOLVED_DATA = resolveFinalJeopardyMedia(DATA, noopResolveMediaRef);

const CONTESTANT_IDS = ['p1', 'p2', 'p3'];

function playersWithScores(scores: Record<string, number>) {
  return CONTESTANT_IDS.map((id) => ({ id, name: id, score: scores[id] ?? 0 }));
}

const HOST_CTX = (scores: Record<string, number> = {}) => ({
  requesterId: 'host',
  isHost: true,
  players: playersWithScores(scores),
});

function ctxFor(requesterId: string, scores: Record<string, number> = {}) {
  return { requesterId, isHost: false, players: playersWithScores(scores) };
}

function initialState() {
  return createInitialFinalJeopardyState('round-1', CONTESTANT_IDS);
}

describe('phase progression', () => {
  it('walks category -> wagering -> answering -> revealing on advance', () => {
    const state = initialState();
    expect(state.phase).toBe('category');

    const toWagering = reduceFinalJeopardy(state, DATA, { type: 'advance' }, HOST_CTX());
    if (!toWagering.ok) throw new Error('unreachable');
    expect(toWagering.state.phase).toBe('wagering');

    const wagered = reduceFinalJeopardy(
      toWagering.state,
      DATA,
      { type: 'wager', amount: 100 },
      ctxFor('p1'),
    );
    if (!wagered.ok) throw new Error('unreachable');

    const toAnswering = reduceFinalJeopardy(wagered.state, DATA, { type: 'advance' }, HOST_CTX());
    if (!toAnswering.ok) throw new Error('unreachable');
    expect(toAnswering.state.phase).toBe('answering');

    const answered = reduceFinalJeopardy(
      toAnswering.state,
      DATA,
      { type: 'submit-answer', answer: 'a1' },
      ctxFor('p1'),
    );
    if (!answered.ok) throw new Error('unreachable');

    const toRevealing = reduceFinalJeopardy(answered.state, DATA, { type: 'advance' }, HOST_CTX());
    if (!toRevealing.ok) throw new Error('unreachable');
    expect(toRevealing.state.phase).toBe('revealing');
  });

  it('rejects advance from a non-host', () => {
    const result = reduceFinalJeopardy(initialState(), DATA, { type: 'advance' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('orders the reveal walk ascending by score, and completes immediately with no contestants', () => {
    const noOneCtx = { requesterId: 'host', isHost: true, players: [] };
    const empty = createInitialFinalJeopardyState('round-1', []);
    const wagering = reduceFinalJeopardy(empty, DATA, { type: 'advance' }, noOneCtx);
    if (!wagering.ok) throw new Error('unreachable');
    const answering = reduceFinalJeopardy(wagering.state, DATA, { type: 'advance' }, noOneCtx);
    if (!answering.ok) throw new Error('unreachable');
    const revealing = reduceFinalJeopardy(answering.state, DATA, { type: 'advance' }, noOneCtx);
    if (!revealing.ok) throw new Error('unreachable');
    expect(revealing.state.phase).toBe('summary');
  });
});

describe('wager / submit-answer', () => {
  function inWagering() {
    const wagering = reduceFinalJeopardy(initialState(), DATA, { type: 'advance' }, HOST_CTX());
    if (!wagering.ok) throw new Error('unreachable');
    return wagering.state;
  }

  it('rejects a wager outside the wagering phase', () => {
    const result = reduceFinalJeopardy(
      initialState(),
      DATA,
      { type: 'wager', amount: 100 },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('records a wager for a contestant', () => {
    const result = reduceFinalJeopardy(
      inWagering(),
      DATA,
      { type: 'wager', amount: 100 },
      ctxFor('p1'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.wagers).toEqual({ p1: 100 });
  });

  it('rejects a wager from someone not in the round', () => {
    const result = reduceFinalJeopardy(
      inWagering(),
      DATA,
      { type: 'wager', amount: 100 },
      ctxFor('ghost'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('records an answer during the answering phase', () => {
    const wagered = reduceFinalJeopardy(
      inWagering(),
      DATA,
      { type: 'wager', amount: 100 },
      ctxFor('p1'),
    );
    if (!wagered.ok) throw new Error('unreachable');
    const answering = reduceFinalJeopardy(wagered.state, DATA, { type: 'advance' }, HOST_CTX());
    if (!answering.ok) throw new Error('unreachable');
    const result = reduceFinalJeopardy(
      answering.state,
      DATA,
      { type: 'submit-answer', answer: 'What is 1776?' },
      ctxFor('p1'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.answers).toEqual({ p1: 'What is 1776?' });
  });
});

describe('reveal walk', () => {
  function inRevealing(scores: Record<string, number> = {}) {
    let state = initialState();
    const wagers = { p1: 500, p2: 1000 };
    for (const step of ['advance'] as const) {
      const r = reduceFinalJeopardy(state, DATA, { type: step }, HOST_CTX(scores));
      if (!r.ok) throw new Error('unreachable');
      state = r.state;
    }
    for (const [playerId, amount] of Object.entries(wagers)) {
      const r = reduceFinalJeopardy(state, DATA, { type: 'wager', amount }, ctxFor(playerId));
      if (!r.ok) throw new Error('unreachable');
      state = r.state;
    }
    const answering = reduceFinalJeopardy(state, DATA, { type: 'advance' }, HOST_CTX(scores));
    if (!answering.ok) throw new Error('unreachable');
    state = answering.state;
    for (const [playerId, answer] of Object.entries({ p1: 'a1', p2: 'a2' })) {
      const r = reduceFinalJeopardy(
        state,
        DATA,
        { type: 'submit-answer', answer },
        ctxFor(playerId),
      );
      if (!r.ok) throw new Error('unreachable');
      state = r.state;
    }
    const revealing = reduceFinalJeopardy(state, DATA, { type: 'advance' }, HOST_CTX(scores));
    if (!revealing.ok) throw new Error('unreachable');
    return revealing.state;
  }

  it('auto-skips the no-show contestant once the reveal walk reaches them', () => {
    let state = inRevealing({ p1: 100, p2: 200, p3: 300 });
    expect(state.revealOrder).toEqual(['p1', 'p2', 'p3']);
    expect(state.judgments.p3).toBeUndefined();

    for (const playerId of ['p1', 'p2']) {
      const answerRevealed = reduceFinalJeopardy(
        state,
        DATA,
        { type: 'reveal-answer' },
        HOST_CTX(),
      );
      if (!answerRevealed.ok) throw new Error('unreachable');
      const wagerRevealed = reduceFinalJeopardy(
        answerRevealed.state,
        DATA,
        { type: 'reveal-wager' },
        HOST_CTX(),
      );
      if (!wagerRevealed.ok) throw new Error('unreachable');
      const judged = reduceFinalJeopardy(
        wagerRevealed.state,
        DATA,
        { type: 'judge', playerId, correct: true },
        HOST_CTX(),
      );
      if (!judged.ok) throw new Error('unreachable');
      state = judged.state;
    }

    expect(state.judgments.p3).toBe(false);
    expect(state.phase).toBe('summary');
  });

  it('walks reveal-answer -> reveal-wager -> judge for the current contestant', () => {
    const state = inRevealing({ p1: 100, p2: 200, p3: 300 });
    const current = state.revealOrder[state.revealIndex];
    if (!current) throw new Error('unreachable');

    const answerRevealed = reduceFinalJeopardy(state, DATA, { type: 'reveal-answer' }, HOST_CTX());
    expect(answerRevealed.ok).toBe(true);
    if (!answerRevealed.ok) throw new Error('unreachable');
    expect(answerRevealed.state.revealStage).toBe('answer');

    const wagerRevealed = reduceFinalJeopardy(
      answerRevealed.state,
      DATA,
      { type: 'reveal-wager' },
      HOST_CTX(),
    );
    expect(wagerRevealed.ok).toBe(true);
    if (!wagerRevealed.ok) throw new Error('unreachable');
    expect(wagerRevealed.state.revealStage).toBe('wager');

    const judged = reduceFinalJeopardy(
      wagerRevealed.state,
      DATA,
      { type: 'judge', playerId: current, correct: true },
      HOST_CTX(),
    );
    expect(judged.ok).toBe(true);
    if (!judged.ok) throw new Error('unreachable');
    expect(judged.scoreDeltas).toEqual({ [current]: current === 'p1' ? 500 : 1000 });
    expect(judged.state.judgments[current]).toBe(true);
  });

  it('rejects judging out of order', () => {
    const state = inRevealing({ p1: 100, p2: 200, p3: 300 });
    const notCurrent = CONTESTANT_IDS.find((id) => id !== state.revealOrder[state.revealIndex]);
    if (!notCurrent) throw new Error('unreachable');
    const answerRevealed = reduceFinalJeopardy(state, DATA, { type: 'reveal-answer' }, HOST_CTX());
    if (!answerRevealed.ok) throw new Error('unreachable');
    const wagerRevealed = reduceFinalJeopardy(
      answerRevealed.state,
      DATA,
      { type: 'reveal-wager' },
      HOST_CTX(),
    );
    if (!wagerRevealed.ok) throw new Error('unreachable');
    const result = reduceFinalJeopardy(
      wagerRevealed.state,
      DATA,
      { type: 'judge', playerId: notCurrent, correct: true },
      HOST_CTX(),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('completes the round once every contestant is judged', () => {
    let state = inRevealing({ p1: 100, p2: 200, p3: 300 });
    while (state.phase === 'revealing') {
      const current = state.revealOrder[state.revealIndex];
      if (!current) break;
      const answerRevealed = reduceFinalJeopardy(
        state,
        DATA,
        { type: 'reveal-answer' },
        HOST_CTX(),
      );
      if (!answerRevealed.ok) throw new Error('unreachable');
      const wagerRevealed = reduceFinalJeopardy(
        answerRevealed.state,
        DATA,
        { type: 'reveal-wager' },
        HOST_CTX(),
      );
      if (!wagerRevealed.ok) throw new Error('unreachable');
      const judged = reduceFinalJeopardy(
        wagerRevealed.state,
        DATA,
        { type: 'judge', playerId: current, correct: true },
        HOST_CTX(),
      );
      if (!judged.ok) throw new Error('unreachable');
      state = judged.state;
    }
    expect(isFinalJeopardyComplete(state)).toBe(true);
  });
});

describe('toFinalJeopardyContestantView', () => {
  it('withholds the clue until wagering is over', () => {
    const category = initialState();
    expect(toFinalJeopardyContestantView(category, RESOLVED_DATA, 'p1').clue).toBeNull();

    const wagering = reduceFinalJeopardy(category, DATA, { type: 'advance' }, HOST_CTX());
    if (!wagering.ok) throw new Error('unreachable');
    expect(toFinalJeopardyContestantView(wagering.state, RESOLVED_DATA, 'p1').clue).toBeNull();

    const answering = reduceFinalJeopardy(wagering.state, DATA, { type: 'advance' }, HOST_CTX());
    if (!answering.ok) throw new Error('unreachable');
    expect(toFinalJeopardyContestantView(answering.state, RESOLVED_DATA, 'p1').clue).toEqual(
      RESOLVED_DATA.clue,
    );
  });

  it('reports hasWagered/hasAnswered only for the viewer', () => {
    const wagering = reduceFinalJeopardy(initialState(), DATA, { type: 'advance' }, HOST_CTX());
    if (!wagering.ok) throw new Error('unreachable');
    const wagered = reduceFinalJeopardy(
      wagering.state,
      DATA,
      { type: 'wager', amount: 100 },
      ctxFor('p1'),
    );
    if (!wagered.ok) throw new Error('unreachable');
    expect(toFinalJeopardyContestantView(wagered.state, RESOLVED_DATA, 'p1').hasWagered).toBe(true);
    expect(toFinalJeopardyContestantView(wagered.state, RESOLVED_DATA, 'p2').hasWagered).toBe(
      false,
    );
  });
});

describe('resolveFinalJeopardyMedia / listFinalJeopardyMediaUrls', () => {
  function resolveByAssetId(ref: MediaRef): ResolvedMediaRef {
    if (ref.kind === 'slideshow') {
      return { kind: 'slideshow', urls: ref.assetIds.map((id) => `https://media/${id}`) };
    }
    return { kind: ref.kind, url: `https://media/${ref.assetId}` };
  }

  it('rewrites clue/answer media and lists every URL', () => {
    const withMedia = {
      category: 'A',
      clue: { text: 'q', media: { kind: 'image' as const, assetId: 'img-1' } },
      answer: { text: 'a', media: { kind: 'audio' as const, assetId: 'aud-1' } },
    };
    const resolved = resolveFinalJeopardyMedia(withMedia, resolveByAssetId);
    expect(resolved.clue.media).toEqual({ kind: 'image', url: 'https://media/img-1' });
    expect(listFinalJeopardyMediaUrls(resolved)).toEqual([
      'https://media/img-1',
      'https://media/aud-1',
    ]);
  });

  it('lists no URLs for a media-free round', () => {
    expect(listFinalJeopardyMediaUrls(RESOLVED_DATA)).toEqual([]);
  });
});
