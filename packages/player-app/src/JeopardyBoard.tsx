import type {
  ClientMessage,
  ContestantRoomView,
  HostRoomView,
  JeopardyBoardData,
  JeopardyContestantView,
  QueueEntryStatus,
  ResolvedClueContent,
  ResolvedMediaRef,
} from '@gameshow/schema';
import { useEffect, useRef, useState } from 'react';
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

function mediaUrlsFor(ref: ResolvedMediaRef | undefined): string[] {
  if (!ref) return [];
  return ref.kind === 'slideshow' ? ref.urls : [ref.url];
}

function jeopardyMediaUrls(data: ResolvedJeopardyBoardData): string[] {
  return data.categories.flatMap((category) =>
    category.clues.flatMap((clue) => [
      ...mediaUrlsFor(clue.clue.media),
      ...mediaUrlsFor(clue.answer.media),
    ]),
  );
}

function Slideshow({ urls }: { urls: string[] }) {
  const [index, setIndex] = useState(0);
  const url = urls[index];

  return (
    <div>
      {url && <img src={url} alt="" />}
      <button type="button" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
        Previous
      </button>
      <button
        type="button"
        disabled={index === urls.length - 1}
        onClick={() => setIndex((i) => i + 1)}
      >
        Next
      </button>
    </div>
  );
}

function MediaRenderer({ media }: { media: ResolvedMediaRef }) {
  switch (media.kind) {
    case 'image':
      return <img src={media.url} alt="" />;
    case 'audio':
      // biome-ignore lint/a11y/useMediaCaption: uploaded media has no caption track
      return <audio controls src={media.url} />;
    case 'video':
      // biome-ignore lint/a11y/useMediaCaption: uploaded media has no caption track
      return <video controls src={media.url} />;
    case 'slideshow':
      return <Slideshow urls={media.urls} />;
  }
}

function ClueContentView({ content }: { content: ResolvedClueContent }) {
  return (
    <>
      {content.text && <span>{content.text}</span>}
      {content.media && <MediaRenderer media={content.media} />}
    </>
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
    <div>
      <p>Waiting for players to finish loading media…</p>
      <ul>
        {waitingOn.map((player) => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>
      <button type="button" onClick={() => send({ type: 'reveal-media-anyway' })}>
        Reveal anyway
      </button>
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
    <div>
      <h2>Jeopardy board (host)</h2>
      <table>
        <thead>
          <tr>
            {data.categories.map((category) => (
              <th key={category.name}>{category.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, clueIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond position
            <tr key={`row-${clueIndex}`}>
              {data.categories.map((category, categoryIndex) => {
                const clue = category.clues[clueIndex];
                if (!clue) return <td key={category.name} />;
                const revealed = state.revealedClues.some(
                  (r) => r.categoryIndex === categoryIndex && r.clueIndex === clueIndex,
                );
                return (
                  <td key={category.name}>
                    {revealed ? (
                      '—'
                    ) : (
                      <button
                        type="button"
                        disabled={state.activeClue !== null}
                        onClick={() =>
                          send({
                            type: 'round-action',
                            action: { type: 'pick-clue', categoryIndex, clueIndex },
                          })
                        }
                      >
                        {clue.value}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {activeClue && state.activeClue && (
        <div>
          <p>
            Clue: <ClueContentView content={activeClue.clue} />
          </p>
          <p>
            Answer: <ClueContentView content={activeClue.answer} />
          </p>
          {activeClue.isDailyDouble && (
            <p>
              Daily Double —{' '}
              {state.pendingWager !== null ? `wager: ${state.pendingWager}` : 'awaiting wager'}
            </p>
          )}
          {!state.buzzedPlayerId && (
            <button
              type="button"
              onClick={() => send({ type: 'round-action', action: { type: 'skip-clue' } })}
            >
              Skip clue
            </button>
          )}
          {state.buzzedPlayerId && (
            <div>
              <p>Answering: {state.buzzedPlayerId}</p>
              <button
                type="button"
                onClick={() =>
                  send({ type: 'round-action', action: { type: 'judge', correct: true } })
                }
              >
                Correct
              </button>
              <button
                type="button"
                onClick={() =>
                  send({ type: 'round-action', action: { type: 'judge', correct: false } })
                }
              >
                Incorrect
              </button>
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
      <div>
        <h2>Jeopardy board</h2>
        <p>Loading media…</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Jeopardy board</h2>
      <table>
        <thead>
          <tr>
            {roundState.categories.map((category) => (
              <th key={category.name}>{category.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, clueIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond position
            <tr key={`row-${clueIndex}`}>
              {roundState.categories.map((category) => {
                const clue = category.clues[clueIndex];
                return <td key={category.name}>{clue && !clue.revealed ? clue.value : '—'}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {roundState.activeClue && (
        <div>
          <p>
            Clue: <ClueContentView content={roundState.activeClue.clue} />
          </p>
          {isLockedOut && <p>You're locked out of this clue.</p>}
          {canBuzz && (
            <button
              type="button"
              onClick={() => send({ type: 'round-action', action: { type: 'buzz' } })}
            >
              Buzz
            </button>
          )}
          {canWager && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const amount = Number(wagerAmount);
                if (!Number.isInteger(amount) || amount < 0) return;
                send({ type: 'round-action', action: { type: 'wager', amount } });
              }}
            >
              <label>
                Wager
                <input
                  value={wagerAmount}
                  onChange={(event) => setWagerAmount(event.target.value)}
                />
              </label>
              <button type="submit">Submit wager</button>
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
