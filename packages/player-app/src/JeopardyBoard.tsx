import type {
  ClueContent,
  ContestantRoomView,
  HostRoomView,
  JeopardyBoardData,
  JeopardyContestantView,
} from '@gameshow/schema';
import { useState } from 'react';
import { useRoomStore } from './room-store.js';

function clueLabel(content: ClueContent): string {
  return content.text ?? '[media]';
}

function boardRowCount(data: JeopardyBoardData): number {
  return Math.max(...data.categories.map((category) => category.clues.length));
}

function HostJeopardyBoard({ view }: { view: HostRoomView }) {
  const send = useRoomStore((state) => state.send);
  const activeEntry = view.queue.find((entry) => entry.status === 'active');
  const state = view.activeRoundState;
  if (activeEntry?.round.type !== 'jeopardy' || state?.type !== 'jeopardy') {
    return null;
  }

  const data = activeEntry.round.data as JeopardyBoardData;
  const activeClue =
    state.activeClue &&
    data.categories[state.activeClue.categoryIndex]?.clues[state.activeClue.clueIndex];
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
          <p>Clue: {clueLabel(activeClue.clue)}</p>
          <p>Answer: {clueLabel(activeClue.answer)}</p>
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
}: {
  roundState: JeopardyContestantView;
  playerId: string;
}) {
  const send = useRoomStore((state) => state.send);
  const [wagerAmount, setWagerAmount] = useState('');

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
          <p>Clue: {clueLabel(roundState.activeClue.clue)}</p>
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
  const roundState = (view as ContestantRoomView).activeRoundState;
  if (roundState?.type !== 'jeopardy') return null;
  return <ContestantJeopardyBoard roundState={roundState} playerId={playerId} />;
}
