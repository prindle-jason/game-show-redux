import type {
  ClientMessage,
  ContestantRoomView,
  FinalJeopardyContestantView,
  FinalJeopardyState,
  HostRoomView,
  QueueEntryStatus,
  ResolvedClueContent,
} from '@gameshow/schema';
import { Button, InputField } from '@gameshow/ui';
import { useEffect, useRef, useState } from 'react';
import { ClueContentView, mediaUrlsFor } from './clue-content.js';
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

function finalJeopardyMediaUrls(data: ResolvedFinalJeopardyData): string[] {
  return [...mediaUrlsFor(data.clue.media), ...mediaUrlsFor(data.answer.media)];
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
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-strong">Final Jeopardy — {resolvedData.category}</h2>

      {state.phase === 'category' && (
        <Button className="self-start" onClick={advance}>
          Start wagering
        </Button>
      )}

      {state.phase === 'wagering' && (
        <div className="flex flex-col gap-2">
          <p className="text-muted">Wagering…</p>
          <ul>
            {state.contestantIds.map((id) => (
              <li key={id}>
                {nameFor(view, id)}: {state.wagers[id] !== undefined ? 'wagered' : 'waiting'}
              </li>
            ))}
          </ul>
          <Button className="self-start" onClick={advance}>
            Reveal clue
          </Button>
        </div>
      )}

      {state.phase === 'answering' && (
        <div className="flex flex-col gap-2">
          <p className="text-strong">
            Clue:{' '}
            <ClueContentView
              content={resolvedData.clue}
              slideIndex={state.clueSlideIndex}
              onSlideNavigate={(index) =>
                send({ type: 'round-action', action: { type: 'set-slide', index } })
              }
            />
          </p>
          <p className="text-strong">
            Correct answer: <ClueContentView content={resolvedData.answer} />
          </p>
          <ul>
            {state.contestantIds.map((id) => (
              <li key={id}>
                {nameFor(view, id)}: {state.answers[id] !== undefined ? 'answered' : 'waiting'}
              </li>
            ))}
          </ul>
          <Button className="self-start" onClick={advance}>
            Start reveal
          </Button>
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
    <div className="flex flex-col gap-2">
      <p className="text-strong">
        Correct answer: <ClueContentView content={resolvedData.answer} />
      </p>
      {currentId && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-strong">Revealing: {nameFor(view, currentId)}</p>
          {state.revealStage === 'hidden' && (
            <Button
              className="self-start"
              onClick={() => send({ type: 'round-action', action: { type: 'reveal-answer' } })}
            >
              Reveal answer
            </Button>
          )}
          {state.revealStage === 'answer' && (
            <div className="flex flex-col gap-2">
              <p className="text-strong">Answer: {state.answers[currentId] || '(no answer)'}</p>
              <Button
                className="self-start"
                onClick={() => send({ type: 'round-action', action: { type: 'reveal-wager' } })}
              >
                Reveal wager
              </Button>
            </div>
          )}
          {state.revealStage === 'wager' && (
            <div className="flex flex-col gap-2">
              <p className="text-strong">Wager: {state.wagers[currentId] ?? 0}</p>
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    send({
                      type: 'round-action',
                      action: { type: 'judge', playerId: currentId, correct: true },
                    })
                  }
                >
                  Correct
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    send({
                      type: 'round-action',
                      action: { type: 'judge', playerId: currentId, correct: false },
                    })
                  }
                >
                  Incorrect
                </Button>
              </div>
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
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg text-strong">Final Jeopardy</h2>
        <p className="text-muted">Loading media…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-strong">Final Jeopardy — {roundState.category}</h2>

      {roundState.phase === 'category' && <p className="text-muted">Get ready to wager!</p>}

      {roundState.phase === 'wagering' &&
        (roundState.hasWagered ? (
          <p className="text-muted">Wager submitted. Waiting for other contestants…</p>
        ) : (
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
        ))}

      {roundState.phase === 'answering' && roundState.clue && (
        <div className="flex flex-col gap-2">
          <p className="text-strong">
            Clue:{' '}
            <ClueContentView content={roundState.clue} slideIndex={roundState.clueSlideIndex} />
          </p>
          {roundState.hasAnswered ? (
            <p className="text-muted">Answer submitted. Waiting for other contestants…</p>
          ) : (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                send({
                  type: 'round-action',
                  action: { type: 'submit-answer', answer: answerText },
                });
              }}
            >
              <InputField
                label="Answer"
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
              />
              <Button type="submit">Submit answer</Button>
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
