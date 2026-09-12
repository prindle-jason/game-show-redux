import { SCHEMA_PACKAGE_NAME } from '@gameshow/schema';
import { Button, InputField } from '@gameshow/ui';
import { useState } from 'react';
import { createRoom } from './create-room.js';
import {
  createFinalJeopardyFixtureRound,
  createFixtureRound,
  createWheelFixtureRound,
  loadFinalJeopardyFixtureMediaAssets,
  loadFixtureMediaAssets,
} from './fixtures.js';
import { uploadRoundMedia } from './media-upload.js';
import { useRoomStore } from './room-store.js';
import { importRoundZip } from './round-import.js';
import { roundBoards } from './rounds/index.js';

/** Read once per mount; the link-join flow never needs the param to change underneath it. */
function useRoomCodeParam(): string | null {
  const [roomCodeParam] = useState(() => new URLSearchParams(window.location.search).get('room'));
  return roomCodeParam;
}

function LinkJoinForm({ roomCode }: { roomCode: string }) {
  const [name, setName] = useState('');
  const join = useRoomStore((state) => state.join);
  const status = useRoomStore((state) => state.status);

  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        join(roomCode, name.trim());
      }}
    >
      <p className="text-muted">Room code: {roomCode}</p>
      <InputField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <Button type="submit" disabled={status === 'connecting' || status === 'connected'}>
        Join
      </Button>
    </form>
  );
}

function CreateOrJoinForm() {
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const join = useRoomStore((state) => state.join);
  const status = useRoomStore((state) => state.status);
  const busy = status === 'connecting' || status === 'connected';

  async function handleCreateRoom() {
    setCreateError(null);
    setCreating(true);
    try {
      const { roomId, hostToken } = await createRoom();
      join(roomId, name.trim() || 'Host', hostToken);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create room');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 rounded-lg border border-border bg-surface-1 p-6">
      <InputField label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <Button disabled={busy || creating} onClick={() => void handleCreateRoom()}>
        {creating ? 'Creating…' : 'Create room'}
      </Button>
      {createError && (
        <p role="alert" className="text-sm text-danger">
          {createError}
        </p>
      )}
      <form
        className="flex flex-col gap-4 border-t border-border pt-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!roomCode.trim() || !name.trim()) return;
          join(roomCode.trim(), name.trim());
        }}
      >
        <InputField
          label="Room code"
          value={roomCode}
          onChange={(event) => setRoomCode(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          Join room
        </Button>
      </form>
    </div>
  );
}

function JoinForm() {
  const roomCodeParam = useRoomCodeParam();
  return roomCodeParam ? <LinkJoinForm roomCode={roomCodeParam} /> : <CreateOrJoinForm />;
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
    <li className="flex items-center justify-between gap-2 border-b border-border py-2">
      <span>
        {entry.round ? entry.round.title : 'Upcoming round'} — {entry.status}
      </span>
      <span className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => moveBy(-1)}>
          Move up
        </Button>
        <Button variant="ghost" size="sm" onClick={() => moveBy(1)}>
          Move down
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => send({ type: 'remove-from-queue', queueEntryId: entry.queueEntryId })}
        >
          Remove
        </Button>
      </span>
    </li>
  );
}

function PlayerRow({
  player,
  canKick,
  canMakeHost,
}: {
  player: { id: string; name: string; score: number; connected: boolean };
  canKick: boolean;
  canMakeHost: boolean;
}) {
  const send = useRoomStore((state) => state.send);

  return (
    <li className="flex items-center justify-between gap-2 border-b border-border py-2">
      <span>
        {player.name} — {player.score} {player.connected ? '' : '(disconnected)'}
      </span>
      <span className="flex gap-1">
        {canMakeHost && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => send({ type: 'make-host', playerId: player.id })}
          >
            Make host
          </Button>
        )}
        {canKick && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => send({ type: 'kick-player', playerId: player.id })}
          >
            Kick
          </Button>
        )}
      </span>
    </li>
  );
}

function HostControls({ phase, queueIds }: { phase: string; queueIds: string[] }) {
  const send = useRoomStore((state) => state.send);
  const requestMediaUploadTokens = useRoomStore((state) => state.requestMediaUploadTokens);
  const [uploading, setUploading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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

  async function importRoundFile(file: File) {
    setImportError(null);
    setUploading(true);
    try {
      const { round, assets } = await importRoundZip(file);
      await uploadRoundMedia(
        round,
        assets,
        requestMediaUploadTokens,
        import.meta.env.VITE_MEDIA_BASE_URL,
      );
      send({ type: 'add-round-to-queue', round });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to import round');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4">
      {phase === 'lobby' && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={uploading} onClick={() => void addFixtureRound()}>
              {uploading ? 'Uploading…' : 'Add fixture round'}
            </Button>
            <Button
              variant="secondary"
              disabled={uploading}
              onClick={() => void addFinalJeopardyFixtureRound()}
            >
              {uploading ? 'Uploading…' : 'Add Final Jeopardy fixture round'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => send({ type: 'add-round-to-queue', round: createWheelFixtureRound() })}
            >
              Add Wheel fixture round
            </Button>
          </div>
          <InputField
            label="Import round"
            type="file"
            accept=".zip"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importRoundFile(file);
            }}
          />
          {importError && (
            <p role="alert" className="text-sm text-danger">
              {importError}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={queueIds.length === 0} onClick={() => send({ type: 'start-game' })}>
              Start game
            </Button>
            <Button variant="danger" onClick={() => send({ type: 'reset-scores' })}>
              Reset scores
            </Button>
          </div>
        </>
      )}
      {phase === 'playing' && (
        <Button onClick={() => send({ type: 'advance-queue' })}>Advance queue</Button>
      )}
      {phase === 'ended' && (
        <Button onClick={() => send({ type: 'return-to-lobby' })}>Return to lobby</Button>
      )}
    </div>
  );
}

function ConnectedRoom() {
  const roomCode = useRoomStore((state) => state.roomCode);
  const self = useRoomStore((state) => state.self);
  const view = useRoomStore((state) => state.view);
  const error = useRoomStore((state) => state.error);
  const [linkCopied, setLinkCopied] = useState(false);

  if (!view || !self) {
    return <p className="text-muted">Connecting…</p>;
  }

  const isHost = view.hostId === self.playerId;
  const queueIds = view.queue.map((entry) => entry.queueEntryId);
  const Board = view.activeRoundState ? roundBoards[view.activeRoundState.type] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-muted">Room code: {roomCode}</p>
          <p className="text-muted">Phase: {view.phase}</p>
        </div>
        {isHost && (
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${window.location.origin}?room=${roomCode}`)
                .then(() => setLinkCopied(true));
            }}
          >
            {linkCopied ? 'Copied!' : 'Copy join link'}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <h2 className="font-display text-lg text-strong">Players</h2>
        <ul aria-label="Players">
          {view.players.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              canKick={isHost && view.phase === 'lobby' && player.id !== self.playerId}
              canMakeHost={isHost && view.phase === 'lobby' && player.id !== self.playerId}
            />
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-display text-lg text-strong">Queue</h2>
        <ul>
          {view.queue.map((entry, index) => (
            <QueueEntryRow
              key={entry.queueEntryId}
              entry={entry}
              index={index}
              queueIds={queueIds}
            />
          ))}
        </ul>
      </div>
      {isHost && <HostControls phase={view.phase} queueIds={queueIds} />}
      {view.phase === 'playing' && view.roundComplete && (
        <p className="text-muted">Round complete</p>
      )}
      {Board ? (
        <Board view={view} playerId={self.playerId} isHost={isHost} />
      ) : (
        <>
          <h2 className="font-display text-lg text-strong">Raw state</h2>
          <pre className="overflow-auto rounded-lg border border-border bg-surface-1 p-3 text-xs">
            {JSON.stringify(view, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

export function App() {
  const status = useRoomStore((state) => state.status);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl text-glow text-primary">Quiz Show</h1>
      <p className="mb-6 text-muted">Minimal stub, wired against {SCHEMA_PACKAGE_NAME}.</p>
      {status === 'connected' ? <ConnectedRoom /> : <JoinForm />}
    </main>
  );
}
