import { SolutionBoard, wedgeLabel } from '@gameshow/round-ui';
import type {
  ContestantRoomView,
  HostRoomView,
  WheelContestantView,
  WheelState,
  WheelWedge,
} from '@gameshow/schema';
import { Button } from '@gameshow/ui';
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
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-strong">Wheel of Fortune — {data.category}</h2>
      <SolutionBoard rows={data.solution} />
      <p className="text-muted">Guessed letters: {state.guessedLetters.join(', ') || '(none)'}</p>
      <p className="text-muted">Wedges: {data.wedges.map(wedgeLabel).join(', ')}</p>
      <p className="text-muted">Vowel cost: {data.vowelCost}</p>
      <p className="text-muted">Solve bonus: {data.solveBonus}</p>
      <p className="text-muted">
        Last spin: {state.lastSpinResult ? wedgeLabel(state.lastSpinResult) : '(none yet)'}
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-base text-strong">Round scores</h3>
        <RoundScores
          contestantIds={state.contestantIds}
          roundScores={state.roundScores}
          nameOf={(id) => nameFor(view, id)}
        />
      </div>

      {state.pendingSolve ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-strong">
            {nameFor(view, state.pendingSolve.playerId)} is attempting to solve.
          </p>
          <div className="flex gap-2">
            <Button
              disabled={roundEnded}
              onClick={() =>
                send({ type: 'round-action', action: { type: 'judge-solve', correct: true } })
              }
            >
              Correct
            </Button>
            <Button
              variant="danger"
              disabled={roundEnded}
              onClick={() =>
                send({ type: 'round-action', action: { type: 'judge-solve', correct: false } })
              }
            >
              Incorrect
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-strong">
            {state.activePlayerId
              ? `${nameFor(view, state.activePlayerId)}'s turn`
              : 'No active player'}
            {state.currentWedge &&
              ` — landed on ${wedgeLabel(state.currentWedge)}, awaiting a guess`}
          </p>
          <Button
            variant="secondary"
            disabled={roundEnded}
            className="self-start"
            onClick={() => send({ type: 'round-action', action: { type: 'skip-turn' } })}
          >
            Skip turn
          </Button>
        </div>
      )}

      <Button
        variant="danger"
        disabled={roundEnded}
        className="self-start"
        onClick={() => send({ type: 'round-action', action: { type: 'end-round' } })}
      >
        End round
      </Button>

      {state.solvedByPlayerId && (
        <p className="text-strong">{nameFor(view, state.solvedByPlayerId)} solved it!</p>
      )}
      {state.endedByHost && !state.solvedByPlayerId && (
        <p className="text-strong">Round ended by host.</p>
      )}
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
    <div className="flex flex-wrap gap-1">
      {letters.map((letter) => (
        <Button
          size="sm"
          variant="secondary"
          key={letter}
          disabled={disabled || guessedLetters.includes(letter)}
          onClick={() => onPick(letter)}
        >
          {letter}
        </Button>
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
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-lg text-strong">Wheel of Fortune — {roundState.category}</h2>
      <SolutionBoard rows={roundState.revealedSolution} />
      <p className="text-muted">
        Guessed letters: {roundState.guessedLetters.join(', ') || '(none)'}
      </p>
      <p className="text-muted">
        Last spin:{' '}
        {roundState.lastSpinResult ? wedgeLabel(roundState.lastSpinResult) : '(none yet)'}
      </p>

      <div className="flex flex-col gap-2">
        <h3 className="font-display text-base text-strong">Round scores</h3>
        <RoundScores
          contestantIds={Object.keys(roundState.roundScores)}
          roundScores={roundState.roundScores}
          nameOf={(id) => (id === playerId ? 'You' : id)}
        />
      </div>

      {roundState.pendingSolve && (
        <p className="text-muted">
          {roundState.pendingSolve.playerId === playerId ? 'You are' : 'Someone is'} attempting to
          solve — waiting on the host…
        </p>
      )}

      {roundState.solvedByPlayerId && <p className="text-strong">The puzzle was solved!</p>}
      {roundState.endedByHost && !roundState.solvedByPlayerId && (
        <p className="text-strong">Round ended by host.</p>
      )}

      {!roundState.pendingSolve && !roundState.solvedByPlayerId && !roundState.endedByHost && (
        <div className="flex flex-col gap-2">
          {!isActivePlayer && <p className="text-muted">Waiting for your turn…</p>}

          {isActivePlayer && !roundState.currentWedge && !buyingVowel && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!roundState.canSpin}
                onClick={() => send({ type: 'round-action', action: { type: 'spin' } })}
              >
                Spin
              </Button>

              <Button
                variant="secondary"
                disabled={!roundState.canBuyVowel || !canAffordVowel}
                onClick={() => setBuyingVowel(true)}
              >
                Buy a Vowel ({roundState.vowelCost})
              </Button>

              <Button
                variant="secondary"
                onClick={() => send({ type: 'round-action', action: { type: 'attempt-solve' } })}
              >
                Solve
              </Button>
            </div>
          )}

          {isActivePlayer && !roundState.currentWedge && buyingVowel && (
            <div className="flex flex-col gap-2">
              <p className="text-strong">Pick a vowel:</p>
              <LetterButtons
                letters={VOWELS}
                guessedLetters={roundState.guessedLetters}
                disabled={false}
                onPick={(letter) => {
                  setBuyingVowel(false);
                  send({ type: 'round-action', action: { type: 'buy-vowel', letter } });
                }}
              />
              <Button variant="ghost" className="self-start" onClick={() => setBuyingVowel(false)}>
                Cancel
              </Button>
            </div>
          )}

          {isActivePlayer && roundState.currentWedge && roundState.currentWedge.kind === 'cash' && (
            <div className="flex flex-col gap-2">
              <p className="text-strong">
                You landed on {wedgeLabel(roundState.currentWedge)} — guess a consonant:
              </p>
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
