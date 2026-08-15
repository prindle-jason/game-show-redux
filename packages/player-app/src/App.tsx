import { SCHEMA_PACKAGE_NAME } from '@gameshow/schema';
import { useState } from 'react';
import {
  createFinalJeopardyFixtureRound,
  createFixtureRound,
  createWheelFixtureRound,
  loadFinalJeopardyFixtureMediaAssets,
  loadFixtureMediaAssets,
} from './fixtures.js';
import { uploadRoundMedia } from './media-upload.js';
import { useRoomStore } from './room-store.js';
import { roundBoards } from './rounds/index.js';

function JoinForm() {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const join = useRoomStore((state) => state.join);
  const status = useRoomStore((state) => state.status);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!roomCode.trim() || !name.trim()) return;
        join(roomCode.trim(), name.trim());
      }}
    >
      <label>
        Room code
        <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} />
      </label>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button type="submit" disabled={status === 'connecting' || status === 'connected'}>
        Join
      </button>
    </form>
  );
}

function QueueEntryRow({
  entry,
  index,
  queueIds,
}: {
  entry: { queueEntryId: string; status: string; round?: { title: string } };
  index: number;
  queueIds: string[];
}) {
  const send = useRoomStore((state) => state.send);

  function moveBy(offset: number) {
    const target = index + offset;
    if (target < 0 || target >= queueIds.length) return;
    const reordered = [...queueIds];
    const [moved] = reordered.splice(index, 1);
    if (moved === undefined) return;
    reordered.splice(target, 0, moved);
    send({ type: 'reorder-queue', queueEntryIds: reordered });
  }

  return (
    <li>
      {entry.round ? entry.round.title : 'Upcoming round'} — {entry.status}
      <button type="button" onClick={() => moveBy(-1)}>
        Move up
      </button>
      <button type="button" onClick={() => moveBy(1)}>
        Move down
      </button>
      <button
        type="button"
        onClick={() => send({ type: 'remove-from-queue', queueEntryId: entry.queueEntryId })}
      >
        Remove
      </button>
    </li>
  );
}

function PlayerRow({
  player,
  canKick,
}: {
  player: { id: string; name: string; score: number; connected: boolean };
  canKick: boolean;
}) {
  const send = useRoomStore((state) => state.send);

  return (
    <li>
      {player.name} — {player.score} {player.connected ? '' : '(disconnected)'}
      {canKick && (
        <button type="button" onClick={() => send({ type: 'kick-player', playerId: player.id })}>
          Kick
        </button>
      )}
    </li>
  );
}

function HostControls({ phase, queueIds }: { phase: string; queueIds: string[] }) {
  const send = useRoomStore((state) => state.send);
  const requestMediaUploadTokens = useRoomStore((state) => state.requestMediaUploadTokens);
  const [uploading, setUploading] = useState(false);

  async function addFixtureRound() {
    const round = createFixtureRound();
    setUploading(true);
    try {
      const assets = await loadFixtureMediaAssets();
      await uploadRoundMedia(
        round,
        assets,
        requestMediaUploadTokens,
        import.meta.env.VITE_MEDIA_BASE_URL,
      );
      send({ type: 'add-round-to-queue', round });
    } finally {
      setUploading(false);
    }
  }

  async function addFinalJeopardyFixtureRound() {
    const round = createFinalJeopardyFixtureRound();
    setUploading(true);
    try {
      const assets = await loadFinalJeopardyFixtureMediaAssets();
      await uploadRoundMedia(
        round,
        assets,
        requestMediaUploadTokens,
        import.meta.env.VITE_MEDIA_BASE_URL,
      );
      send({ type: 'add-round-to-queue', round });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {phase === 'lobby' && (
        <>
          <button type="button" disabled={uploading} onClick={() => void addFixtureRound()}>
            {uploading ? 'Uploading…' : 'Add fixture round'}
          </button>
          <button
            type="button"
            disabled={uploading}
            onClick={() => void addFinalJeopardyFixtureRound()}
          >
            {uploading ? 'Uploading…' : 'Add Final Jeopardy fixture round'}
          </button>
          <button
            type="button"
            onClick={() => send({ type: 'add-round-to-queue', round: createWheelFixtureRound() })}
          >
            Add Wheel fixture round
          </button>
          <button
            type="button"
            disabled={queueIds.length === 0}
            onClick={() => send({ type: 'start-game' })}
          >
            Start game
          </button>
          <button type="button" onClick={() => send({ type: 'reset-scores' })}>
            Reset scores
          </button>
        </>
      )}
      {phase === 'playing' && (
        <button type="button" onClick={() => send({ type: 'advance-queue' })}>
          Advance queue
        </button>
      )}
      {phase === 'ended' && (
        <button type="button" onClick={() => send({ type: 'return-to-lobby' })}>
          Return to lobby
        </button>
      )}
    </div>
  );
}

function ConnectedRoom() {
  const roomCode = useRoomStore((state) => state.roomCode);
  const self = useRoomStore((state) => state.self);
  const view = useRoomStore((state) => state.view);
  const error = useRoomStore((state) => state.error);

  if (!view || !self) {
    return <p>Connecting…</p>;
  }

  const queueIds = view.queue.map((entry) => entry.queueEntryId);
  const Board = view.activeRoundState ? roundBoards[view.activeRoundState.type] : undefined;

  return (
    <div>
      <p>Room code: {roomCode}</p>
      <p>Phase: {view.phase}</p>
      {error && <p role="alert">{error}</p>}
      <h2>Players</h2>
      <ul aria-label="Players">
        {view.players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            canKick={self.isHost && view.phase === 'lobby' && player.id !== self.playerId}
          />
        ))}
      </ul>
      <h2>Queue</h2>
      <ul>
        {view.queue.map((entry, index) => (
          <QueueEntryRow key={entry.queueEntryId} entry={entry} index={index} queueIds={queueIds} />
        ))}
      </ul>
      {self.isHost && <HostControls phase={view.phase} queueIds={queueIds} />}
      {view.phase === 'playing' && view.roundComplete && <p>Round complete</p>}
      {Board ? (
        <Board view={view} playerId={self.playerId} isHost={self.isHost} />
      ) : (
        <>
          <h2>Raw state</h2>
          <pre>{JSON.stringify(view, null, 2)}</pre>
        </>
      )}
    </div>
  );
}

export function App() {
  const status = useRoomStore((state) => state.status);

  return (
    <main>
      <h1>Quiz Show</h1>
      <p>Minimal stub, wired against {SCHEMA_PACKAGE_NAME}.</p>
      {status === 'connected' ? <ConnectedRoom /> : <JoinForm />}
    </main>
  );
}
