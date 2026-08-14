import type {
  JeopardyAction,
  JeopardyBoardData,
  JeopardyClue,
  JeopardyContestantView,
  JeopardyState,
  MediaRef,
  ResolvedClueContent,
  ResolvedMediaRef,
} from '@gameshow/schema';

/**
 * `JeopardyBoardData` with every clue/answer's `MediaRef` rewritten to a
 * `ResolvedMediaRef` — party-owned, produced once by `resolveJeopardyMedia`
 * when a round is added to the queue (see room-logic.ts's `addRoundToQueue`).
 */
export interface ResolvedJeopardyBoardData {
  categories: Array<{
    name: string;
    clues: Array<{
      value: number;
      clue: ResolvedClueContent;
      answer: ResolvedClueContent;
      isDailyDouble?: boolean;
    }>;
  }>;
}

function resolveClueContent(
  content: JeopardyBoardData['categories'][number]['clues'][number]['clue'],
  resolve: (ref: MediaRef) => ResolvedMediaRef,
): ResolvedClueContent {
  return {
    text: content.text,
    media: content.media ? resolve(content.media) : undefined,
  };
}

export function resolveJeopardyMedia(
  data: JeopardyBoardData,
  resolve: (ref: MediaRef) => ResolvedMediaRef,
): ResolvedJeopardyBoardData {
  return {
    categories: data.categories.map((category) => ({
      name: category.name,
      clues: category.clues.map((clue) => ({
        value: clue.value,
        isDailyDouble: clue.isDailyDouble,
        clue: resolveClueContent(clue.clue, resolve),
        answer: resolveClueContent(clue.answer, resolve),
      })),
    })),
  };
}

function mediaUrls(ref: ResolvedMediaRef | undefined): string[] {
  if (!ref) return [];
  return ref.kind === 'slideshow' ? ref.urls : [ref.url];
}

export function listJeopardyMediaUrls(resolvedData: ResolvedJeopardyBoardData): string[] {
  return resolvedData.categories.flatMap((category) =>
    category.clues.flatMap((clue) => [
      ...mediaUrls(clue.clue.media),
      ...mediaUrls(clue.answer.media),
    ]),
  );
}

export type JeopardyActionResult =
  | { ok: true; state: JeopardyState; scoreDeltas?: Record<string, number> }
  | { ok: false; error: string };

export interface JeopardyActionContext {
  requesterId: string;
  isHost: boolean;
  /** All players except the host — who's eligible to buzz/wager/be locked out. */
  contestantIds: string[];
}

/** Deterministic string hash so the starting controller is reproducible per round. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function createInitialJeopardyState(
  roundId: string,
  contestantIds: string[],
): JeopardyState {
  return {
    type: 'jeopardy',
    revealedClues: [],
    activeClue: null,
    buzzedPlayerId: null,
    lockedOutPlayerIds: [],
    pendingWager: null,
    controllingPlayerId:
      contestantIds.length > 0
        ? (contestantIds[hashString(roundId) % contestantIds.length] ?? null)
        : null,
  };
}

function findClue(
  data: JeopardyBoardData,
  categoryIndex: number,
  clueIndex: number,
): JeopardyClue | undefined {
  return data.categories[categoryIndex]?.clues[clueIndex];
}

function isRevealed(state: JeopardyState, categoryIndex: number, clueIndex: number): boolean {
  return state.revealedClues.some(
    (revealed) => revealed.categoryIndex === categoryIndex && revealed.clueIndex === clueIndex,
  );
}

export function reduceJeopardy(
  state: JeopardyState,
  data: JeopardyBoardData,
  action: JeopardyAction,
  context: JeopardyActionContext,
): JeopardyActionResult {
  switch (action.type) {
    case 'pick-clue':
      return pickClue(state, data, action, context);
    case 'wager':
      return wager(state, data, action, context);
    case 'buzz':
      return buzz(state, data, context);
    case 'judge':
      return judge(state, data, action, context);
    case 'skip-clue':
      return skipClue(state, context);
  }
}

function pickClue(
  state: JeopardyState,
  data: JeopardyBoardData,
  action: Extract<JeopardyAction, { type: 'pick-clue' }>,
  context: JeopardyActionContext,
): JeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can pick a clue' };
  if (state.activeClue) return { ok: false, error: 'A clue is already active' };

  const clue = findClue(data, action.categoryIndex, action.clueIndex);
  if (!clue) return { ok: false, error: 'No such clue' };
  if (isRevealed(state, action.categoryIndex, action.clueIndex)) {
    return { ok: false, error: 'That clue has already been played' };
  }

  const activeClue = { categoryIndex: action.categoryIndex, clueIndex: action.clueIndex };
  if (clue.isDailyDouble) {
    return { ok: true, state: { ...state, activeClue } };
  }
  return {
    ok: true,
    state: { ...state, activeClue, buzzedPlayerId: null, lockedOutPlayerIds: [] },
  };
}

function wager(
  state: JeopardyState,
  data: JeopardyBoardData,
  action: Extract<JeopardyAction, { type: 'wager' }>,
  context: JeopardyActionContext,
): JeopardyActionResult {
  if (!state.activeClue) return { ok: false, error: 'No active clue' };
  const clue = findClue(data, state.activeClue.categoryIndex, state.activeClue.clueIndex);
  if (!clue?.isDailyDouble) return { ok: false, error: 'The active clue is not a Daily Double' };
  if (state.pendingWager !== null) return { ok: false, error: 'A wager has already been placed' };
  if (context.requesterId !== state.controllingPlayerId) {
    return { ok: false, error: 'Only the controlling player may wager' };
  }

  return {
    ok: true,
    state: { ...state, pendingWager: action.amount, buzzedPlayerId: context.requesterId },
  };
}

function buzz(
  state: JeopardyState,
  data: JeopardyBoardData,
  context: JeopardyActionContext,
): JeopardyActionResult {
  if (!state.activeClue) return { ok: false, error: 'No active clue' };
  const clue = findClue(data, state.activeClue.categoryIndex, state.activeClue.clueIndex);
  if (clue?.isDailyDouble) return { ok: false, error: 'Daily Doubles are not buzzed for' };
  if (state.buzzedPlayerId !== null) return { ok: false, error: 'Someone already buzzed in' };
  if (state.lockedOutPlayerIds.includes(context.requesterId)) {
    return { ok: false, error: 'You are locked out of this clue' };
  }

  return { ok: true, state: { ...state, buzzedPlayerId: context.requesterId } };
}

function judge(
  state: JeopardyState,
  data: JeopardyBoardData,
  action: Extract<JeopardyAction, { type: 'judge' }>,
  context: JeopardyActionContext,
): JeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can judge' };
  if (!state.activeClue) return { ok: false, error: 'No active clue' };
  const buzzedPlayerId = state.buzzedPlayerId;
  if (!buzzedPlayerId) return { ok: false, error: 'No one has buzzed in' };
  const clue = findClue(data, state.activeClue.categoryIndex, state.activeClue.clueIndex);
  if (!clue) return { ok: false, error: 'No such clue' };

  const amount = clue.isDailyDouble ? (state.pendingWager ?? 0) : clue.value;
  const revealedClues = [...state.revealedClues, state.activeClue];

  if (action.correct) {
    return {
      ok: true,
      scoreDeltas: { [buzzedPlayerId]: amount },
      state: {
        ...state,
        revealedClues,
        activeClue: null,
        buzzedPlayerId: null,
        pendingWager: null,
        lockedOutPlayerIds: [],
        controllingPlayerId: buzzedPlayerId,
      },
    };
  }

  if (clue.isDailyDouble) {
    return {
      ok: true,
      scoreDeltas: { [buzzedPlayerId]: -amount },
      state: {
        ...state,
        revealedClues,
        activeClue: null,
        buzzedPlayerId: null,
        pendingWager: null,
      },
    };
  }

  const lockedOutPlayerIds = [...state.lockedOutPlayerIds, buzzedPlayerId];
  const stillEligible = context.contestantIds.some((id) => !lockedOutPlayerIds.includes(id));
  if (!stillEligible) {
    return {
      ok: true,
      scoreDeltas: { [buzzedPlayerId]: -amount },
      state: {
        ...state,
        revealedClues,
        activeClue: null,
        buzzedPlayerId: null,
        lockedOutPlayerIds: [],
      },
    };
  }

  return {
    ok: true,
    scoreDeltas: { [buzzedPlayerId]: -amount },
    state: { ...state, buzzedPlayerId: null, lockedOutPlayerIds },
  };
}

/**
 * Host bails out of a clue nobody will answer: revealed with no scoring and
 * control unchanged. Rejected while someone is buzzed in (judge instead) —
 * and since a Daily Double wager sets `buzzedPlayerId`, a wagered DD must be
 * judged, while an unwagered one (e.g. no controlling player) can be skipped.
 */
function skipClue(state: JeopardyState, context: JeopardyActionContext): JeopardyActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can skip a clue' };
  if (!state.activeClue) return { ok: false, error: 'No active clue' };
  if (state.buzzedPlayerId !== null) {
    return { ok: false, error: 'Someone has buzzed in — judge their answer instead' };
  }

  return {
    ok: true,
    state: {
      ...state,
      revealedClues: [...state.revealedClues, state.activeClue],
      activeClue: null,
      pendingWager: null,
      lockedOutPlayerIds: [],
    },
  };
}

export function isJeopardyComplete(state: JeopardyState, data: JeopardyBoardData): boolean {
  const total = data.categories.reduce((sum, category) => sum + category.clues.length, 0);
  return state.revealedClues.length >= total;
}

export function toJeopardyContestantView(
  state: JeopardyState,
  resolvedData: ResolvedJeopardyBoardData,
): JeopardyContestantView {
  const activeClue = projectActiveClue(state, resolvedData);

  return {
    type: 'jeopardy',
    categories: resolvedData.categories.map((category, categoryIndex) => ({
      name: category.name,
      clues: category.clues.map((clue, clueIndex) => ({
        value: clue.value,
        revealed: isRevealed(state, categoryIndex, clueIndex),
      })),
    })),
    activeClue,
    buzzedPlayerId: state.buzzedPlayerId,
    lockedOutPlayerIds: state.lockedOutPlayerIds,
    pendingWager: state.pendingWager,
    controllingPlayerId: state.controllingPlayerId,
  };
}

function projectActiveClue(
  state: JeopardyState,
  resolvedData: ResolvedJeopardyBoardData,
): JeopardyContestantView['activeClue'] {
  if (!state.activeClue) return null;
  const { categoryIndex, clueIndex } = state.activeClue;
  const clue = resolvedData.categories[categoryIndex]?.clues[clueIndex];
  if (!clue) return null;

  return {
    categoryIndex,
    clueIndex,
    clue: clue.clue,
    isDailyDouble: clue.isDailyDouble ?? false,
  };
}
