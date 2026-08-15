import type {
  ContestantRoomView,
  HostRoomView,
  WheelContestantView,
  WheelState,
  WheelWedge,
} from '@gameshow/schema';
import { useState } from 'react';
import { useRoomStore } from './room-store.js';

/**
 * `WheelPuzzleData`, duplicated here rather than imported since player-app has
 * no dependency on party — mirrors party's `ResolvedWheelPuzzleData` (which is
 * just `WheelPuzzleData` verbatim, text-only puzzles carry no `MediaRef`s).
 */
interface WheelPuzzleData {
  category: string;
  solution: string[];
  wedges: WheelWedge[];
  vowelCost: number;
  solveBonus: number;
}

const VOWELS = ['A', 'E', 'I', 'O', 'U'];
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ'.split('');

function nameFor(view: HostRoomView, playerId: string): string {
  return view.players.find((player) => player.id === playerId)?.name ?? playerId;
}

function wedgeLabel(wedge: WheelWedge): string {
  switch (wedge.kind) {
    case 'cash':
      return `$${wedge.value}`;
    case 'bankrupt':
      return 'Bankrupt';
    case 'lose-turn':
      return 'Lose a turn';
  }
}

function SolutionBoard({ rows }: { rows: string[] }) {
  return (
    <ul>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder/insert/delete
        <li key={index}>{row || ' '}</li>
      ))}
    </ul>
  );
}

function RoundScores({
  contestantIds,
  roundScores,
  nameOf,
}: {
  contestantIds: string[];
  roundScores: Record<string, number>;
  nameOf: (id: string) => string;
}) {
  return (
    <ul>
      {contestantIds.map((id) => (
        <li key={id}>
          {nameOf(id)}: {roundScores[id] ?? 0}
        </li>
      ))}
    </ul>
  );
}

function HostWheelBoard({ view }: { view: HostRoomView }) {
  const send = useRoomStore((state) => state.send);
  const activeEntry = view.queue.find(
    (entry) => entry.status === 'active' || entry.status === 'loading',
  );
  const roundState = view.activeRoundState;
  const entry =
    activeEntry?.round.type === 'wheel-of-fortune' && roundState?.type === 'wheel-of-fortune'
      ? activeEntry
      : undefined;

  if (!entry || roundState?.type !== 'wheel-of-fortune') return null;
  const state: WheelState = roundState;
  const data = entry.resolvedData as WheelPuzzleData;
  const roundEnded = state.solvedByPlayerId !== null || state.endedByHost;

  return (
    <div>
      <h2>Wheel of Fortune — {data.category}</h2>
      <SolutionBoard rows={data.solution} />
      <p>Guessed letters: {state.guessedLetters.join(', ') || '(none)'}</p>
      <p>Wedges: {data.wedges.map(wedgeLabel).join(', ')}</p>
      <p>Vowel cost: {data.vowelCost}</p>
      <p>Solve bonus: {data.solveBonus}</p>
      <p>Last spin: {state.lastSpinResult ? wedgeLabel(state.lastSpinResult) : '(none yet)'}</p>

      <h3>Round scores</h3>
      <RoundScores
        contestantIds={state.contestantIds}
        roundScores={state.roundScores}
        nameOf={(id) => nameFor(view, id)}
      />

      {state.pendingSolve ? (
        <div>
          <p>{nameFor(view, state.pendingSolve.playerId)} is attempting to solve.</p>
          <button
            type="button"
            disabled={roundEnded}
            onClick={() =>
              send({ type: 'round-action', action: { type: 'judge-solve', correct: true } })
            }
          >
            Correct
          </button>
          <button
            type="button"
            disabled={roundEnded}
            onClick={() =>
              send({ type: 'round-action', action: { type: 'judge-solve', correct: false } })
            }
          >
            Incorrect
          </button>
        </div>
      ) : (
        <div>
          <p>
            {state.activePlayerId
              ? `${nameFor(view, state.activePlayerId)}'s turn`
              : 'No active player'}
            {state.currentWedge &&
              ` — landed on ${wedgeLabel(state.currentWedge)}, awaiting a guess`}
          </p>
          <button
            type="button"
            disabled={roundEnded}
            onClick={() => send({ type: 'round-action', action: { type: 'skip-turn' } })}
          >
            Skip turn
          </button>
        </div>
      )}

      <button
        type="button"
        disabled={roundEnded}
        onClick={() => send({ type: 'round-action', action: { type: 'end-round' } })}
      >
        End round
      </button>

      {state.solvedByPlayerId && <p>{nameFor(view, state.solvedByPlayerId)} solved it!</p>}
      {state.endedByHost && !state.solvedByPlayerId && <p>Round ended by host.</p>}
    </div>
  );
}

function LetterButtons({
  letters,
  guessedLetters,
  disabled,
  onPick,
}: {
  letters: string[];
  guessedLetters: string[];
  disabled: boolean;
  onPick: (letter: string) => void;
}) {
  return (
    <div>
      {letters.map((letter) => (
        <button
          type="button"
          key={letter}
          disabled={disabled || guessedLetters.includes(letter)}
          onClick={() => onPick(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function ContestantWheelBoard({
  roundState,
  playerId,
}: {
  roundState: WheelContestantView;
  playerId: string;
}) {
  const send = useRoomStore((state) => state.send);
  const [buyingVowel, setBuyingVowel] = useState(false);

  const isActivePlayer = roundState.activePlayerId === playerId;
  const balance = roundState.roundScores[playerId] ?? 0;
  const canAffordVowel = balance >= roundState.vowelCost;

  return (
    <div>
      <h2>Wheel of Fortune — {roundState.category}</h2>
      <SolutionBoard rows={roundState.revealedSolution} />
      <p>Guessed letters: {roundState.guessedLetters.join(', ') || '(none)'}</p>
      <p>
        Last spin:{' '}
        {roundState.lastSpinResult ? wedgeLabel(roundState.lastSpinResult) : '(none yet)'}
      </p>

      <h3>Round scores</h3>
      <RoundScores
        contestantIds={Object.keys(roundState.roundScores)}
        roundScores={roundState.roundScores}
        nameOf={(id) => (id === playerId ? 'You' : id)}
      />

      {roundState.pendingSolve && (
        <p>
          {roundState.pendingSolve.playerId === playerId ? 'You are' : 'Someone is'} attempting to
          solve — waiting on the host…
        </p>
      )}

      {roundState.solvedByPlayerId && <p>The puzzle was solved!</p>}
      {roundState.endedByHost && !roundState.solvedByPlayerId && <p>Round ended by host.</p>}

      {!roundState.pendingSolve && !roundState.solvedByPlayerId && !roundState.endedByHost && (
        <div>
          {!isActivePlayer && <p>Waiting for your turn…</p>}

          {isActivePlayer && !roundState.currentWedge && !buyingVowel && (
            <div>
              <button
                type="button"
                disabled={!roundState.canSpin}
                onClick={() => send({ type: 'round-action', action: { type: 'spin' } })}
              >
                Spin
              </button>

              <button
                type="button"
                disabled={!roundState.canBuyVowel || !canAffordVowel}
                onClick={() => setBuyingVowel(true)}
              >
                Buy a Vowel ({roundState.vowelCost})
              </button>

              <button
                type="button"
                onClick={() => send({ type: 'round-action', action: { type: 'attempt-solve' } })}
              >
                Solve
              </button>
            </div>
          )}

          {isActivePlayer && !roundState.currentWedge && buyingVowel && (
            <div>
              <p>Pick a vowel:</p>
              <LetterButtons
                letters={VOWELS}
                guessedLetters={roundState.guessedLetters}
                disabled={false}
                onPick={(letter) => {
                  setBuyingVowel(false);
                  send({ type: 'round-action', action: { type: 'buy-vowel', letter } });
                }}
              />
              <button type="button" onClick={() => setBuyingVowel(false)}>
                Cancel
              </button>
            </div>
          )}

          {isActivePlayer && roundState.currentWedge && roundState.currentWedge.kind === 'cash' && (
            <div>
              <p>You landed on {wedgeLabel(roundState.currentWedge)} — guess a consonant:</p>
              <LetterButtons
                letters={CONSONANTS}
                guessedLetters={roundState.guessedLetters}
                disabled={false}
                onPick={(letter) =>
                  send({ type: 'round-action', action: { type: 'guess-consonant', letter } })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WheelBoard({
  view,
  playerId,
  isHost,
}: {
  view: HostRoomView | ContestantRoomView;
  playerId: string;
  isHost: boolean;
}) {
  if (isHost) {
    return <HostWheelBoard view={view as HostRoomView} />;
  }
  const contestantView = view as ContestantRoomView;
  const roundState = contestantView.activeRoundState;
  if (roundState?.type !== 'wheel-of-fortune') return null;
  return <ContestantWheelBoard roundState={roundState} playerId={playerId} />;
}
