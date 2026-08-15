import type {
  FinalJeopardyAction,
  FinalJeopardyContestantView,
  FinalJeopardyData,
  FinalJeopardyState,
  MediaRef,
  ResolvedClueContent,
  ResolvedMediaRef,
  RevealStage,
} from '@gameshow/schema';

/**
 * `FinalJeopardyData` with `clue`/`answer`'s `MediaRef` rewritten to a
 * `ResolvedMediaRef` — party-owned, produced once by `resolveFinalJeopardyMedia`
 * when a round is added to the queue (see room-logic.ts's `addRoundToQueue`).
 */
export interface ResolvedFinalJeopardyData {
  category: string;
  clue: ResolvedClueContent;
  answer: ResolvedClueContent;
}

function resolveClueContent(
  content: FinalJeopardyData['clue'],
  resolve: (ref: MediaRef) => ResolvedMediaRef,
): ResolvedClueContent {
  return {
    text: content.text,
    media: content.media ? resolve(content.media) : undefined,
  };
}

export function resolveFinalJeopardyMedia(
  data: FinalJeopardyData,
  resolve: (ref: MediaRef) => ResolvedMediaRef,
): ResolvedFinalJeopardyData {
  return {
    category: data.category,
    clue: resolveClueContent(data.clue, resolve),
    answer: resolveClueContent(data.answer, resolve),
  };
}

function mediaUrls(ref: ResolvedMediaRef | undefined): string[] {
  if (!ref) return [];
  return ref.kind === 'slideshow' ? ref.urls : [ref.url];
}

export function listFinalJeopardyMediaUrls(resolvedData: ResolvedFinalJeopardyData): string[] {
  return [...mediaUrls(resolvedData.clue.media), ...mediaUrls(resolvedData.answer.media)];
}

export type FinalJeopardyActionResult =
  | { ok: true; state: FinalJeopardyState; scoreDeltas?: Record<string, number> }
  | { ok: false; error: string };

export interface FinalJeopardyActionContext {
  requesterId: string;
  isHost: boolean;
  players: { id: string; name: string; score: number }[];
}

export function createInitialFinalJeopardyState(
  _roundId: string,
  contestantIds: string[],
): FinalJeopardyState {
  return {
    type: 'final-jeopardy',
    phase: 'category',
    contestantIds,
    wagers: {},
    answers: {},
    judgments: {},
    revealOrder: [],
    revealIndex: 0,
    revealStage: 'hidden',
    clueSlideIndex: 0,
  };
}

/** A contestant who submitted neither a wager nor an answer — auto-judged incorrect for 0. */
function isNoShow(state: FinalJeopardyState, playerId: string): boolean {
  return state.wagers[playerId] === undefined && state.answers[playerId] === undefined;
}

/**
 * Walks forward from `state.revealIndex`, auto-judging any contestant who
 * never wagered or answered so the host isn't forced to click through a
 * no-show's reveal steps. Flips to `summary` once it walks off the end.
 */
function autoSkipNoShows(state: FinalJeopardyState): FinalJeopardyState {
  let revealIndex = state.revealIndex;
  let judgments = state.judgments;
  while (revealIndex < state.revealOrder.length) {
    const playerId = state.revealOrder[revealIndex];
    if (!playerId || !isNoShow(state, playerId)) break;
    judgments = { ...judgments, [playerId]: false };
    revealIndex++;
  }
  return {
    ...state,
    revealIndex,
    judgments,
    revealStage: 'hidden',
    phase: revealIndex >= state.revealOrder.length ? 'summary' : state.phase,
  };
}

export function reduceFinalJeopardy(
  state: FinalJeopardyState,
  data: FinalJeopardyData,
  action: FinalJeopardyAction,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  switch (action.type) {
    case 'wager':
      return submitWager(state, action, context);
    case 'submit-answer':
      return submitAnswer(state, action, context);
    case 'advance':
      return advance(state, context);
    case 'reveal-answer':
      return revealAnswer(state, context);
    case 'reveal-wager':
      return revealWager(state, context);
    case 'judge':
      return judge(state, action, context);
    case 'set-slide':
      return setSlide(state, data, action, context);
  }
}

function submitWager(
  state: FinalJeopardyState,
  action: Extract<FinalJeopardyAction, { type: 'wager' }>,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (state.phase !== 'wagering') return { ok: false, error: 'Wagering is not open' };
  if (!state.contestantIds.includes(context.requesterId)) {
    return { ok: false, error: 'Only contestants in this round may wager' };
  }
  return {
    ok: true,
    state: { ...state, wagers: { ...state.wagers, [context.requesterId]: action.amount } },
  };
}

function submitAnswer(
  state: FinalJeopardyState,
  action: Extract<FinalJeopardyAction, { type: 'submit-answer' }>,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (state.phase !== 'answering') return { ok: false, error: 'Answering is not open' };
  if (!state.contestantIds.includes(context.requesterId)) {
    return { ok: false, error: 'Only contestants in this round may answer' };
  }
  return {
    ok: true,
    state: { ...state, answers: { ...state.answers, [context.requesterId]: action.answer } },
  };
}

function advance(
  state: FinalJeopardyState,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can advance the round' };

  if (state.phase === 'category') {
    return { ok: true, state: { ...state, phase: 'wagering' } };
  }
  if (state.phase === 'wagering') {
    return { ok: true, state: { ...state, phase: 'answering', clueSlideIndex: 0 } };
  }
  if (state.phase === 'answering') {
    const revealOrder = [...state.contestantIds].sort((a, b) => {
      const scoreA = context.players.find((p) => p.id === a)?.score ?? 0;
      const scoreB = context.players.find((p) => p.id === b)?.score ?? 0;
      return scoreA - scoreB;
    });
    const revealing: FinalJeopardyState = {
      ...state,
      phase: 'revealing',
      revealOrder,
      revealIndex: 0,
      revealStage: 'hidden',
    };
    return { ok: true, state: autoSkipNoShows(revealing) };
  }
  return { ok: false, error: 'Nothing left to advance — end the round from the queue' };
}

function currentRevealPlayerId(state: FinalJeopardyState): string | null {
  return state.revealOrder[state.revealIndex] ?? null;
}

function revealAnswer(
  state: FinalJeopardyState,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can reveal' };
  if (state.phase !== 'revealing') return { ok: false, error: 'Not in the reveal phase' };
  if (!currentRevealPlayerId(state)) return { ok: false, error: 'Nobody left to reveal' };
  if (state.revealStage !== 'hidden') return { ok: false, error: 'Answer already revealed' };
  return { ok: true, state: { ...state, revealStage: 'answer' } };
}

function revealWager(
  state: FinalJeopardyState,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can reveal' };
  if (state.phase !== 'revealing') return { ok: false, error: 'Not in the reveal phase' };
  if (!currentRevealPlayerId(state)) return { ok: false, error: 'Nobody left to reveal' };
  if (state.revealStage !== 'answer') return { ok: false, error: 'Reveal the answer first' };
  return { ok: true, state: { ...state, revealStage: 'wager' } };
}

function judge(
  state: FinalJeopardyState,
  action: Extract<FinalJeopardyAction, { type: 'judge' }>,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can judge' };
  if (state.phase !== 'revealing') return { ok: false, error: 'Not in the reveal phase' };
  const playerId = currentRevealPlayerId(state);
  if (!playerId) return { ok: false, error: 'Nobody left to judge' };
  if (playerId !== action.playerId) return { ok: false, error: 'That contestant is not up next' };
  if (state.revealStage !== 'wager') return { ok: false, error: 'Reveal the wager first' };

  const wagerAmount = state.wagers[playerId] ?? 0;
  const judged: FinalJeopardyState = {
    ...state,
    judgments: { ...state.judgments, [playerId]: action.correct },
    revealIndex: state.revealIndex + 1,
    revealStage: 'hidden',
  };
  return {
    ok: true,
    scoreDeltas: { [playerId]: action.correct ? wagerAmount : -wagerAmount },
    state: autoSkipNoShows(judged),
  };
}

export function isFinalJeopardyComplete(state: FinalJeopardyState): boolean {
  return state.phase === 'summary';
}

function setSlide(
  state: FinalJeopardyState,
  data: FinalJeopardyData,
  action: Extract<FinalJeopardyAction, { type: 'set-slide' }>,
  context: FinalJeopardyActionContext,
): FinalJeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can control the slideshow' };
  if (state.phase === 'category' || state.phase === 'wagering') {
    return { ok: false, error: 'The clue is not visible yet' };
  }
  if (data.clue.media?.kind !== 'slideshow')
    return { ok: false, error: 'The clue has no slideshow' };
  if (action.index >= data.clue.media.assetIds.length) {
    return { ok: false, error: 'Slide index out of range' };
  }
  return { ok: true, state: { ...state, clueSlideIndex: action.index } };
}

export function toFinalJeopardyContestantView(
  state: FinalJeopardyState,
  resolvedData: ResolvedFinalJeopardyData,
  viewerId: string,
): FinalJeopardyContestantView {
  const revealed: FinalJeopardyContestantView['revealed'] = [];
  for (let i = 0; i < state.revealIndex; i++) {
    const playerId = state.revealOrder[i];
    if (!playerId) continue;
    revealed.push({
      playerId,
      wager: state.wagers[playerId] ?? 0,
      answer: state.answers[playerId] ?? '',
      correct: state.judgments[playerId] ?? false,
    });
  }
  const currentPlayerId = currentRevealPlayerId(state);
  if (currentPlayerId && state.revealStage !== 'hidden') {
    const stage: RevealStage = state.revealStage;
    revealed.push({
      playerId: currentPlayerId,
      answer:
        stage === 'answer' || stage === 'wager'
          ? (state.answers[currentPlayerId] ?? '')
          : undefined,
      wager: stage === 'wager' ? (state.wagers[currentPlayerId] ?? 0) : undefined,
    });
  }

  return {
    type: 'final-jeopardy',
    phase: state.phase,
    category: resolvedData.category,
    clue: state.phase === 'category' || state.phase === 'wagering' ? null : resolvedData.clue,
    clueSlideIndex: state.clueSlideIndex,
    hasWagered: state.wagers[viewerId] !== undefined,
    hasAnswered: state.answers[viewerId] !== undefined,
    current: currentPlayerId ? { playerId: currentPlayerId, stage: state.revealStage } : null,
    revealed,
  };
}
