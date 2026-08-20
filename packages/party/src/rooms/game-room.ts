import type {
  ClientMessage,
  MediaRef,
  ResolvedMediaRef,
  RoomState,
  ServerMessage,
} from '@gameshow/schema';
import { clientMessageSchema, MEDIA_LIMITS, roundTypeDefinitions } from '@gameshow/schema';
import { type Connection, Server, type WSMessage } from 'partyserver';
import type { Env } from '../env.js';
import { mediaKey, signUploadToken } from '../media.js';
import { roundModules } from '../rounds/index.js';
import {
  type ActionResult,
  addRoundToQueue,
  advanceQueue,
  applyDisconnect,
  applyJoin,
  applyMediaReady,
  applyScoreDeltas,
  createInitialRoomState,
  kickPlayer,
  makeHost,
  removeFromQueue,
  reorderQueue,
  resetScores,
  returnToLobby,
  revealMediaAnyway,
  startGame,
  toContestantView,
} from './room-logic.js';

interface ConnectionState {
  playerId: string;
}

/** How long a `'loading'` entry waits for every connected player before the host can be nudged. */
const MEDIA_READY_TIMEOUT_MS = 12_000;
/** Upload tokens are single-asset and single-use in practice; keep the signed window short. */
const UPLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

function send(connection: Connection, message: ServerMessage): void {
  connection.send(JSON.stringify(message));
}

/** One GameRoom Durable Object per live room; state is in-memory only for now. */
export class GameRoom extends Server<Env> {
  private state: RoomState = createInitialRoomState();
  private mediaTimeout: { queueEntryId: string; handle: ReturnType<typeof setTimeout> } | null =
    null;
  /** Set once by `tryReserveHost()` at mint time; only a `join` presenting this exact value may become host. */
  private hostClaimToken: string | null = null;
  /**
   * Token -> playerId, minted on each new player's first join and never
   * broadcast — presenting a valid entry on a later `join` reconnects into
   * that player's existing record instead of matching by (collidable) name.
   */
  private sessionTokens = new Map<string, string>();

  /**
   * Atomic check-and-claim, called via DO RPC from `create-room.ts`'s mint
   * route. Returns `null` if this room was already reserved (the mint route
   * treats that as a collision and retries a different code), otherwise
   * mints and stores the token a subsequent `join` must present to be host.
   */
  tryReserveHost(): string | null {
    if (this.hostClaimToken !== null) return null;
    this.hostClaimToken = crypto.randomUUID();
    return this.hostClaimToken;
  }

  override async onMessage(connection: Connection<ConnectionState>, raw: WSMessage): Promise<void> {
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

    await this.handleMessage(connection, result.data);
  }

  private async handleMessage(
    connection: Connection<ConnectionState>,
    message: ClientMessage,
  ): Promise<void> {
    if (message.type === 'join') {
      const hasReservation = this.hostClaimToken !== null;
      const claimsHost =
        this.state.hostId === '' &&
        (hasReservation
          ? message.hostToken === this.hostClaimToken
          : this.state.players.length === 0);

      const claimedPlayerId = message.sessionToken
        ? (this.sessionTokens.get(message.sessionToken) ?? null)
        : null;
      const { state, playerId } = applyJoin(this.state, message.name, claimsHost, claimedPlayerId);
      this.state = state;

      const presentedToken = message.sessionToken ?? null;
      const reconnected = presentedToken !== null && playerId === claimedPlayerId;
      const sessionToken = reconnected && presentedToken ? presentedToken : crypto.randomUUID();
      if (!reconnected) this.sessionTokens.set(sessionToken, playerId);

      connection.setState({ playerId });
      send(connection, {
        type: 'joined',
        playerId,
        isHost: playerId === this.state.hostId,
        sessionToken,
      });
      this.broadcastViews();
      return;
    }

    const playerId = connection.state?.playerId;
    if (!playerId) {
      send(connection, { type: 'error', message: 'Join the room first' });
      return;
    }

    if (message.type === 'round-action') {
      this.handleRoundAction(connection, playerId, message.action);
      return;
    }

    if (message.type === 'round-media-ready') {
      this.state = applyMediaReady(this.state, playerId);
      this.syncMediaTimeout();
      this.broadcastViews();
      return;
    }

    if (message.type === 'request-media-upload-tokens') {
      await this.handleUploadTokenRequest(connection, playerId, message);
      return;
    }

    let actionResult: ActionResult;
    switch (message.type) {
      case 'add-round-to-queue': {
        const round = message.round;
        actionResult = addRoundToQueue(this.state, round, playerId, (ref) =>
          this.resolveMediaRef(round.roundId, ref),
        );
        break;
      }
      case 'remove-from-queue': {
        const removedEntry = this.state.queue.find(
          (entry) => entry.queueEntryId === message.queueEntryId,
        );
        actionResult = removeFromQueue(this.state, message.queueEntryId, playerId);
        if (actionResult.ok && removedEntry) {
          await this.deleteRoundMedia(removedEntry.round.roundId);
        }
        break;
      }
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
      case 'reveal-media-anyway':
        actionResult = revealMediaAnyway(this.state, playerId);
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
      case 'make-host':
        actionResult = makeHost(this.state, message.playerId, playerId);
        break;
    }

    if (!actionResult.ok) {
      send(connection, { type: 'error', message: actionResult.error });
      return;
    }

    this.state = actionResult.state;
    this.syncMediaTimeout();
    this.broadcastViews();
  }

  private handleRoundAction(
    connection: Connection<ConnectionState>,
    playerId: string,
    action: unknown,
  ): void {
    const activeEntry = this.state.queue.find((entry) => entry.status === 'active');
    const activeRoundState = this.state.activeRoundState;
    if (!activeEntry || !activeRoundState) {
      send(connection, { type: 'error', message: 'No round is in progress' });
      return;
    }

    const module = roundModules[activeEntry.round.type];
    if (!module) {
      send(connection, { type: 'error', message: 'Round gameplay is not implemented yet' });
      return;
    }

    const parsedAction =
      roundTypeDefinitions[activeEntry.round.type].actionSchema.safeParse(action);
    if (!parsedAction.success) {
      send(connection, { type: 'error', message: 'Invalid round action' });
      return;
    }

    const players = this.state.players
      .filter((player) => player.id !== this.state.hostId)
      .map((player) => ({ id: player.id, name: player.name, score: player.score }));

    const extraContext = module.prepareActionContext?.(
      activeRoundState,
      activeEntry.round.data,
      parsedAction.data,
    );

    const result = module.reduce(activeRoundState, activeEntry.round.data, parsedAction.data, {
      requesterId: playerId,
      isHost: playerId === this.state.hostId,
      players,
      ...extraContext,
    });

    if (!result.ok) {
      send(connection, { type: 'error', message: result.error });
      return;
    }

    this.state = {
      ...this.state,
      activeRoundState: result.state,
      roundComplete: module.isComplete(result.state, activeEntry.round.data),
      players: applyScoreDeltas(this.state.players, result.scoreDeltas),
    };
    this.broadcastViews();
  }

  private async handleUploadTokenRequest(
    connection: Connection<ConnectionState>,
    playerId: string,
    message: Extract<ClientMessage, { type: 'request-media-upload-tokens' }>,
  ): Promise<void> {
    if (playerId !== this.state.hostId) {
      send(connection, { type: 'error', message: 'Only the host can upload media' });
      return;
    }
    if (this.state.phase !== 'lobby') {
      send(connection, { type: 'error', message: 'Media can only be uploaded in the lobby' });
      return;
    }

    for (const asset of message.assets) {
      const limits = MEDIA_LIMITS[asset.kind];
      if (!limits.contentTypes.includes(asset.contentType) || asset.size > limits.maxBytes) {
        send(connection, {
          type: 'error',
          message: `Asset ${asset.assetId} failed content-type/size validation`,
        });
        return;
      }
    }

    const exp = Date.now() + UPLOAD_TOKEN_TTL_MS;
    const tokens = await Promise.all(
      message.assets.map(async (asset) => ({
        assetId: asset.assetId,
        token: await signUploadToken(this.env.MEDIA_UPLOAD_SECRET, {
          roomId: this.name,
          roundId: message.roundId,
          assetId: asset.assetId,
          contentType: asset.contentType,
          maxBytes: MEDIA_LIMITS[asset.kind].maxBytes,
          exp,
        }),
      })),
    );

    send(connection, { type: 'media-upload-tokens', tokens });
  }

  private resolveMediaRef(roundId: string, ref: MediaRef): ResolvedMediaRef {
    const buildUrl = (assetId: string) =>
      `${this.env.MEDIA_BASE_URL}/media/${mediaKey(this.name, roundId, assetId)}`;
    if (ref.kind === 'slideshow') {
      return { kind: 'slideshow', urls: ref.assetIds.map(buildUrl) };
    }
    return { kind: ref.kind, url: buildUrl(ref.assetId) };
  }

  private async deleteRoundMedia(roundId: string): Promise<void> {
    const prefix = `rooms/${this.name}/${roundId}/`;
    const listed = await this.env.MEDIA.list({ prefix });
    await Promise.all(listed.objects.map((object) => this.env.MEDIA.delete(object.key)));
  }

  /**
   * Keeps at most one timer alive, tracking whichever entry is currently
   * `'loading'` — reconciled after every state change so a stale timer from
   * an earlier round can never fire against a different entry.
   */
  private syncMediaTimeout(): void {
    const loadingEntry = this.state.queue.find((entry) => entry.status === 'loading');
    if (!loadingEntry) {
      this.clearMediaTimeout();
      return;
    }
    if (this.mediaTimeout?.queueEntryId === loadingEntry.queueEntryId) return;

    this.clearMediaTimeout();
    const queueEntryId = loadingEntry.queueEntryId;
    const handle = setTimeout(() => {
      this.mediaTimeout = null;
      const current = this.state.queue.find((entry) => entry.queueEntryId === queueEntryId);
      if (current?.status !== 'loading') return;
      const result = revealMediaAnyway(this.state, this.state.hostId);
      if (result.ok) {
        this.state = result.state;
        this.broadcastViews();
      }
    }, MEDIA_READY_TIMEOUT_MS);
    this.mediaTimeout = { queueEntryId, handle };
  }

  private clearMediaTimeout(): void {
    if (this.mediaTimeout) {
      clearTimeout(this.mediaTimeout.handle);
      this.mediaTimeout = null;
    }
  }

  override onClose(connection: Connection<ConnectionState>): void {
    const playerId = connection.state?.playerId;
    if (!playerId) return;
    this.state = applyDisconnect(this.state, playerId);
    this.syncMediaTimeout();
    this.broadcastViews();
  }

  private broadcastViews(): void {
    for (const connection of this.getConnections<ConnectionState>()) {
      const playerId = connection.state?.playerId;
      if (!playerId) continue;
      const view =
        playerId === this.state.hostId ? this.state : toContestantView(this.state, playerId);
      send(connection, { type: 'room-state', view });
    }
  }
}
