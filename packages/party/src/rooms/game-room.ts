import type { ClientMessage, RoomState, ServerMessage } from '@gameshow/schema';
import { clientMessageSchema } from '@gameshow/schema';
import { type Connection, Server, type WSMessage } from 'partyserver';
import type { Env } from '../env.js';
import {
  type ActionResult,
  addRoundToQueue,
  advanceQueue,
  applyDisconnect,
  applyJoin,
  createInitialRoomState,
  kickPlayer,
  removeFromQueue,
  reorderQueue,
  resetScores,
  returnToLobby,
  startGame,
  toContestantView,
} from './room-logic.js';

interface ConnectionState {
  playerId: string;
}

function send(connection: Connection, message: ServerMessage): void {
  connection.send(JSON.stringify(message));
}

/** One GameRoom Durable Object per live room; state is in-memory only for now. */
export class GameRoom extends Server<Env> {
  private state: RoomState = createInitialRoomState();

  override onMessage(connection: Connection<ConnectionState>, raw: WSMessage): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      send(connection, { type: 'error', message: 'Invalid message' });
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      send(connection, { type: 'error', message: 'Invalid message' });
      return;
    }

    this.handleMessage(connection, result.data);
  }

  private handleMessage(connection: Connection<ConnectionState>, message: ClientMessage): void {
    if (message.type === 'join') {
      const { state, playerId } = applyJoin(this.state, message.name);
      this.state = state;
      connection.setState({ playerId });
      send(connection, {
        type: 'joined',
        playerId,
        isHost: playerId === this.state.hostId,
      });
      this.broadcastViews();
      return;
    }

    const playerId = connection.state?.playerId;
    if (!playerId) {
      send(connection, { type: 'error', message: 'Join the room first' });
      return;
    }

    let actionResult: ActionResult;
    switch (message.type) {
      case 'round-action':
        send(connection, {
          type: 'error',
          message: 'Round gameplay is not implemented yet',
        });
        return;
      case 'add-round-to-queue':
        actionResult = addRoundToQueue(this.state, message.round, playerId);
        break;
      case 'remove-from-queue':
        actionResult = removeFromQueue(this.state, message.queueEntryId, playerId);
        break;
      case 'reorder-queue':
        actionResult = reorderQueue(this.state, message.queueEntryIds, playerId);
        break;
      case 'start-game':
        actionResult = startGame(this.state, playerId);
        break;
      case 'advance-queue':
        actionResult = advanceQueue(this.state, playerId);
        break;
      case 'return-to-lobby':
        actionResult = returnToLobby(this.state, playerId);
        break;
      case 'reset-scores':
        actionResult = resetScores(this.state, playerId);
        break;
      case 'kick-player':
        actionResult = kickPlayer(this.state, message.playerId, playerId);
        if (actionResult.ok) {
          const kickedConnection = [...this.getConnections<ConnectionState>()].find(
            (c) => c.state?.playerId === message.playerId,
          );
          if (kickedConnection) {
            send(kickedConnection, {
              type: 'kicked',
              reason: "I don't know, what did you do?",
            });
            kickedConnection.close();
          }
        }
        break;
    }

    if (!actionResult.ok) {
      send(connection, { type: 'error', message: actionResult.error });
      return;
    }

    this.state = actionResult.state;
    this.broadcastViews();
  }

  override onClose(connection: Connection<ConnectionState>): void {
    const playerId = connection.state?.playerId;
    if (!playerId) return;
    this.state = applyDisconnect(this.state, playerId);
    this.broadcastViews();
  }

  private broadcastViews(): void {
    for (const connection of this.getConnections<ConnectionState>()) {
      const playerId = connection.state?.playerId;
      if (!playerId) continue;
      const view = playerId === this.state.hostId ? this.state : toContestantView(this.state);
      send(connection, { type: 'room-state', view });
    }
  }
}
