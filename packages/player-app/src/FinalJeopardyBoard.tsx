import type {
  ClientMessage,
  ContestantRoomView,
  FinalJeopardyContestantView,
  FinalJeopardyState,
  HostRoomView,
  QueueEntryStatus,
  ResolvedClueContent,
  ResolvedMediaRef,
} from '@gameshow/schema';
import { useEffect, useRef, useState } from 'react';
import { useRoomStore } from './room-store.js';

/**
 * `FinalJeopardyData` with `clue`/`answer`'s `MediaRef` rewritten to a
 * `ResolvedMediaRef` — mirrors party's `ResolvedFinalJeopardyData`
 * (packages/party/src/rounds/final-jeopardy.ts). Duplicated here rather than
 * imported since player-app has no dependency on party.
 */
interface ResolvedFinalJeopardyData {
  category: string;
  clue: ResolvedClueContent;
  answer: ResolvedClueContent;
}

function mediaUrlsFor(ref: ResolvedMediaRef | undefined): string[] {
  if (!ref) return [];
  return ref.kind === 'slideshow' ? ref.urls : [ref.url];
}

function finalJeopardyMediaUrls(data: ResolvedFinalJeopardyData): string[] {
  return [...mediaUrlsFor(data.clue.media), ...mediaUrlsFor(data.answer.media)];
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

/** Same prefetch-then-report pattern as `JeopardyBoard`'s `useMediaReadyGate`. */
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
        // Report ready even on a failed prefetch — see JeopardyBoard's note.
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

function nameFor(view: HostRoomView, playerId: string): string {
  return view.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function HostFinalJeopardyBoard({ view }: { view: HostRoomView }) {
  const send = useRoomStore((state) => state.send);
  const activeEntry = view.queue.find(
    (entry) => entry.status === 'active' || entry.status === 'loading',
  );
  const roundState = view.activeRoundState;
  const entry =
    activeEntry?.round.type === 'final-jeopardy' && roundState?.type === 'final-jeopardy'
      ? activeEntry
      : undefined;
  const resolvedData = entry ? (entry.resolvedData as ResolvedFinalJeopardyData) : undefined;

  useMediaReadyGate(
    entry?.queueEntryId,
    entry?.status,
    resolvedData ? finalJeopardyMediaUrls(resolvedData) : [],
    send,
  );

  if (!entry || !resolvedData || roundState?.type !== 'final-jeopardy') return null;
  const state: FinalJeopardyState = roundState;

  if (entry.status === 'loading') {
    return <MediaWaitingPanel view={view} />;
  }

  const advance = () => send({ type: 'round-action', action: { type: 'advance' } });

  return (
    <div>
      <h2>Final Jeopardy — {resolvedData.category}</h2>

      {state.phase === 'category' && (
        <button type="button" onClick={advance}>
          Start wagering
        </button>
      )}

      {state.phase === 'wagering' && (
        <div>
          <p>Wagering…</p>
          <ul>
            {state.contestantIds.map((id) => (
              <li key={id}>
                {nameFor(view, id)}: {state.wagers[id] !== undefined ? 'wagered' : 'waiting'}
              </li>
            ))}
          </ul>
          <button type="button" onClick={advance}>
            Reveal clue
          </button>
        </div>
      )}

      {state.phase === 'answering' && (
        <div>
          <p>
            Clue: <ClueContentView content={resolvedData.clue} />
          </p>
          <p>
            Correct answer: <ClueContentView content={resolvedData.answer} />
          </p>
          <ul>
            {state.contestantIds.map((id) => (
              <li key={id}>
                {nameFor(view, id)}: {state.answers[id] !== undefined ? 'answered' : 'waiting'}
              </li>
            ))}
          </ul>
          <button type="button" onClick={advance}>
            Start reveal
          </button>
        </div>
      )}

      {state.phase === 'revealing' && (
        <HostRevealPanel view={view} state={state} resolvedData={resolvedData} />
      )}

      {state.phase === 'summary' && <SummaryPanel view={view} state={state} />}
    </div>
  );
}

function HostRevealPanel({
  view,
  state,
  resolvedData,
}: {
  view: HostRoomView;
  state: FinalJeopardyState;
  resolvedData: ResolvedFinalJeopardyData;
}) {
  const send = useRoomStore((store) => store.send);
  const currentId = state.revealOrder[state.revealIndex];

  return (
    <div>
      <p>
        Correct answer: <ClueContentView content={resolvedData.answer} />
      </p>
      {currentId && (
        <div>
          <p>Revealing: {nameFor(view, currentId)}</p>
          {state.revealStage === 'hidden' && (
            <button
              type="button"
              onClick={() => send({ type: 'round-action', action: { type: 'reveal-answer' } })}
            >
              Reveal answer
            </button>
          )}
          {state.revealStage === 'answer' && (
            <div>
              <p>Answer: {state.answers[currentId] || '(no answer)'}</p>
              <button
                type="button"
                onClick={() => send({ type: 'round-action', action: { type: 'reveal-wager' } })}
              >
                Reveal wager
              </button>
            </div>
          )}
          {state.revealStage === 'wager' && (
            <div>
              <p>Wager: {state.wagers[currentId] ?? 0}</p>
              <button
                type="button"
                onClick={() =>
                  send({
                    type: 'round-action',
                    action: { type: 'judge', playerId: currentId, correct: true },
                  })
                }
              >
                Correct
              </button>
              <button
                type="button"
                onClick={() =>
                  send({
                    type: 'round-action',
                    action: { type: 'judge', playerId: currentId, correct: false },
                  })
                }
              >
                Incorrect
              </button>
            </div>
          )}
        </div>
      )}
      <SummaryPanel view={view} state={state} />
    </div>
  );
}

function SummaryPanel({ view, state }: { view: HostRoomView; state: FinalJeopardyState }) {
  return (
    <ul>
      {state.revealOrder.slice(0, state.revealIndex).map((id) => (
        <li key={id}>
          {nameFor(view, id)}: wagered {state.wagers[id] ?? 0}, answered "
          {state.answers[id] || '(no answer)'}", {state.judgments[id] ? 'correct' : 'incorrect'}
        </li>
      ))}
    </ul>
  );
}

function ContestantFinalJeopardyBoard({
  roundState,
  playerId,
  queueEntryId,
  status,
  mediaUrls,
}: {
  roundState: FinalJeopardyContestantView;
  playerId: string;
  queueEntryId: string | undefined;
  status: QueueEntryStatus | undefined;
  mediaUrls: string[];
}) {
  const send = useRoomStore((state) => state.send);
  const [wagerAmount, setWagerAmount] = useState('');
  const [answerText, setAnswerText] = useState('');

  useMediaReadyGate(queueEntryId, status, mediaUrls, send);

  if (status === 'loading') {
    return (
      <div>
        <h2>Final Jeopardy</h2>
        <p>Loading media…</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Final Jeopardy — {roundState.category}</h2>

      {roundState.phase === 'category' && <p>Get ready to wager!</p>}

      {roundState.phase === 'wagering' &&
        (roundState.hasWagered ? (
          <p>Wager submitted. Waiting for other contestants…</p>
        ) : (
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
              <input value={wagerAmount} onChange={(event) => setWagerAmount(event.target.value)} />
            </label>
            <button type="submit">Submit wager</button>
          </form>
        ))}

      {roundState.phase === 'answering' && roundState.clue && (
        <div>
          <p>
            Clue: <ClueContentView content={roundState.clue} />
          </p>
          {roundState.hasAnswered ? (
            <p>Answer submitted. Waiting for other contestants…</p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send({
                  type: 'round-action',
                  action: { type: 'submit-answer', answer: answerText },
                });
              }}
            >
              <label>
                Answer
                <input value={answerText} onChange={(event) => setAnswerText(event.target.value)} />
              </label>
              <button type="submit">Submit answer</button>
            </form>
          )}
        </div>
      )}

      {(roundState.phase === 'revealing' || roundState.phase === 'summary') && (
        <ul>
          {roundState.revealed.map((entry) => (
            <li key={entry.playerId}>
              {entry.playerId === playerId ? 'You' : entry.playerId}
              {entry.answer !== undefined && ` — answer: "${entry.answer}"`}
              {entry.wager !== undefined && ` — wager: ${entry.wager}`}
              {entry.correct !== undefined && ` — ${entry.correct ? 'correct' : 'incorrect'}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FinalJeopardyBoard({
  view,
  playerId,
  isHost,
}: {
  view: HostRoomView | ContestantRoomView;
  playerId: string;
  isHost: boolean;
}) {
  if (isHost) {
    return <HostFinalJeopardyBoard view={view as HostRoomView} />;
  }
  const contestantView = view as ContestantRoomView;
  const roundState = contestantView.activeRoundState;
  if (roundState?.type !== 'final-jeopardy') return null;
  const entry = contestantView.queue.find(
    (queueEntry) => queueEntry.status === 'active' || queueEntry.status === 'loading',
  );
  return (
    <ContestantFinalJeopardyBoard
      roundState={roundState}
      playerId={playerId}
      queueEntryId={entry?.queueEntryId}
      status={entry?.status}
      mediaUrls={entry?.mediaUrls ?? []}
    />
  );
}
