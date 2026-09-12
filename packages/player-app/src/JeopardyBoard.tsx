import { JeopardyBoardGrid } from '@gameshow/round-ui';
import type {
  ClientMessage,
  ContestantRoomView,
  HostRoomView,
  JeopardyBoardData,
  JeopardyContestantView,
  QueueEntryStatus,
  ResolvedClueContent,
} from '@gameshow/schema';
import { Button, InputField } from '@gameshow/ui';
import { useEffect, useRef, useState } from 'react';
import { ClueContentView, mediaUrlsFor } from './clue-content.js';
import { useRoomStore } from './room-store.js';

/**
 * `JeopardyBoardData` with every clue/answer's `MediaRef` rewritten to a
 * `ResolvedMediaRef` — mirrors party's `ResolvedJeopardyBoardData`
 * (packages/party/src/rounds/jeopardy.ts). Duplicated here rather than
 * imported since player-app has no dependency on party; both sides only
 * need to agree on the shape that crosses the wire as `resolvedData: unknown`.
 */
interface ResolvedJeopardyBoardData {
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

function jeopardyMediaUrls(data: ResolvedJeopardyBoardData): string[] {
  return data.categories.flatMap((category) =>
    category.clues.flatMap((clue) => [
      ...mediaUrlsFor(clue.clue.media),
      ...mediaUrlsFor(clue.answer.media),
    ]),
  );
}

function boardRowCount(data: JeopardyBoardData): number {
  return Math.max(...data.categories.map((category) => category.clues.length));
}

/**
 * Prefetches every media URL for a `'loading'` queue entry once, then reports
 * `round-media-ready` — guarded per `queueEntryId` so it fires exactly once,
 * even across the re-renders `mediaUrls`'s new array identity would otherwise
 * trigger.
 */
function useMediaReadyGate(
  queueEntryId: string | undefined,
  status: QueueEntryStatus | undefined,
  mediaUrls: string[],
  send: (message: ClientMessage) => void,
) {
  const reportedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!queueEntryId || status !== 'loading') return;
    if (reportedForRef.current === queueEntryId) return;
    reportedForRef.current = queueEntryId;

    Promise.all(mediaUrls.map((url) => fetch(url)))
      .catch(() => {
        // Report ready even on a failed prefetch — the round shouldn't hang
        // forever on one bad asset; the media element itself will show broken.
      })
      .then(() => send({ type: 'round-media-ready' }));
  }, [queueEntryId, status, mediaUrls, send]);
}

function MediaWaitingPanel({ view }: { view: HostRoomView }) {
  const send = useRoomStore((state) => state.send);
  const waitingOn = view.players.filter(
    (player) => player.connected && !view.mediaReadyPlayerIds.includes(player.id),
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted">Waiting for players to finish loading media…</p>
      <ul>
        {waitingOn.map((player) => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>
      <Button variant="secondary" onClick={() => send({ type: 'reveal-media-anyway' })}>
        Reveal anyway
      </Button>
    </div>
  );
}

function HostJeopardyBoard({ view }: { view: HostRoomView }) {
  const send = useRoomStore((state) => state.send);
  const activeEntry = view.queue.find(
    (entry) => entry.status === 'active' || entry.status === 'loading',
  );
  const roundState = view.activeRoundState;
  const jeopardyEntry =
    activeEntry?.round.type === 'jeopardy' && roundState?.type === 'jeopardy'
      ? activeEntry
      : undefined;
  const resolvedData = jeopardyEntry
    ? (jeopardyEntry.resolvedData as ResolvedJeopardyBoardData)
    : undefined;

  useMediaReadyGate(
    jeopardyEntry?.queueEntryId,
    jeopardyEntry?.status,
    resolvedData ? jeopardyMediaUrls(resolvedData) : [],
    send,
  );

  if (!jeopardyEntry || !resolvedData || roundState?.type !== 'jeopardy') return null;
  const state = roundState;

  if (jeopardyEntry.status === 'loading') {
    return <MediaWaitingPanel view={view} />;
  }

  const data = jeopardyEntry.round.data as JeopardyBoardData;
  const activeClue =
    state.activeClue &&
    resolvedData.categories[state.activeClue.categoryIndex]?.clues[state.activeClue.clueIndex];
  const rows = boardRowCount(data);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-strong">Jeopardy board (host)</h2>
      <JeopardyBoardGrid
        categoryNames={data.categories.map((category) => category.name)}
        rowCount={rows}
        renderCell={(categoryIndex, clueIndex) => {
          const clue = data.categories[categoryIndex]?.clues[clueIndex];
          if (!clue) return null;
          const revealed = state.revealedClues.some(
            (r) => r.categoryIndex === categoryIndex && r.clueIndex === clueIndex,
          );
          if (revealed) return '—';
          return (
            <Button
              variant="ghost"
              className="w-full"
              disabled={state.activeClue !== null}
              onClick={() =>
                send({
                  type: 'round-action',
                  action: { type: 'pick-clue', categoryIndex, clueIndex },
                })
              }
            >
              {clue.value}
            </Button>
          );
        }}
      />

      {activeClue && state.activeClue && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-strong">
            Clue:{' '}
            <ClueContentView
              content={activeClue.clue}
              slideIndex={state.clueSlideIndex}
              onSlideNavigate={(index) =>
                send({ type: 'round-action', action: { type: 'set-slide', index } })
              }
            />
          </p>
          <p className="text-strong">
            Answer: <ClueContentView content={activeClue.answer} />
          </p>
          {activeClue.isDailyDouble && (
            <p className="text-accent">
              Daily Double —{' '}
              {state.pendingWager !== null ? `wager: ${state.pendingWager}` : 'awaiting wager'}
            </p>
          )}
          {!state.buzzedPlayerId && (
            <Button
              variant="secondary"
              onClick={() => send({ type: 'round-action', action: { type: 'skip-clue' } })}
            >
              Skip clue
            </Button>
          )}
          {state.buzzedPlayerId && (
            <div className="flex flex-col gap-2">
              <p className="text-muted">Answering: {state.buzzedPlayerId}</p>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    send({ type: 'round-action', action: { type: 'judge', correct: true } })
                  }
                >
                  Correct
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    send({ type: 'round-action', action: { type: 'judge', correct: false } })
                  }
                >
                  Incorrect
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ContestantJeopardyBoard({
  roundState,
  playerId,
  queueEntryId,
  status,
  mediaUrls,
}: {
  roundState: JeopardyContestantView;
  playerId: string;
  queueEntryId: string | undefined;
  status: QueueEntryStatus | undefined;
  mediaUrls: string[];
}) {
  const send = useRoomStore((state) => state.send);
  const [wagerAmount, setWagerAmount] = useState('');

  useMediaReadyGate(queueEntryId, status, mediaUrls, send);

  const isLockedOut = roundState.lockedOutPlayerIds.includes(playerId);
  const canBuzz =
    roundState.activeClue !== null &&
    !roundState.activeClue.isDailyDouble &&
    roundState.buzzedPlayerId === null &&
    !isLockedOut;
  const canWager =
    roundState.activeClue?.isDailyDouble === true &&
    roundState.pendingWager === null &&
    roundState.controllingPlayerId === playerId;
  const rows = Math.max(...roundState.categories.map((category) => category.clues.length));

  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg text-strong">Jeopardy board</h2>
        <p className="text-muted">Loading media…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-strong">Jeopardy board</h2>
      <JeopardyBoardGrid
        categoryNames={roundState.categories.map((category) => category.name)}
        rowCount={rows}
        renderCell={(categoryIndex, clueIndex) => {
          const clue = roundState.categories[categoryIndex]?.clues[clueIndex];
          return clue && !clue.revealed ? clue.value : '—';
        }}
      />

      {roundState.activeClue && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-strong">
            Clue:{' '}
            <ClueContentView
              content={roundState.activeClue.clue}
              slideIndex={roundState.activeClue.clueSlideIndex}
            />
          </p>
          {isLockedOut && <p className="text-muted">You're locked out of this clue.</p>}
          {canBuzz && (
            <Button
              size="lg"
              onClick={() => send({ type: 'round-action', action: { type: 'buzz' } })}
            >
              Buzz
            </Button>
          )}
          {canWager && (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const amount = Number(wagerAmount);
                if (!Number.isInteger(amount) || amount < 0) return;
                send({ type: 'round-action', action: { type: 'wager', amount } });
              }}
            >
              <InputField
                label="Wager"
                value={wagerAmount}
                onChange={(event) => setWagerAmount(event.target.value)}
              />
              <Button type="submit">Submit wager</Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function JeopardyBoard({
  view,
  playerId,
  isHost,
}: {
  view: HostRoomView | ContestantRoomView;
  playerId: string;
  isHost: boolean;
}) {
  if (isHost) {
    return <HostJeopardyBoard view={view as HostRoomView} />;
  }
  const contestantView = view as ContestantRoomView;
  const roundState = contestantView.activeRoundState;
  if (roundState?.type !== 'jeopardy') return null;
  const entry = contestantView.queue.find(
    (queueEntry) => queueEntry.status === 'active' || queueEntry.status === 'loading',
  );
  return (
    <ContestantJeopardyBoard
      roundState={roundState}
      playerId={playerId}
      queueEntryId={entry?.queueEntryId}
      status={entry?.status}
      mediaUrls={entry?.mediaUrls ?? []}
    />
  );
}
