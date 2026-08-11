import { SCHEMA_PACKAGE_NAME } from '@gameshow/schema';
import { type Connection, Server, type WSMessage } from 'partyserver';
import type { Env } from '../env.js';

/**
 * One GameRoom Durable Object per live room. Round-type state machines
 * (Jeopardy board, Wheel of Fortune, ...) will dispatch through onMessage
 * once the wire protocol lands in @gameshow/schema.
 */
export class GameRoom extends Server<Env> {
  override onConnect(connection: Connection): void {
    console.log(`[${SCHEMA_PACKAGE_NAME}] ${connection.id} joined room ${this.name}`);
  }

  override onMessage(connection: Connection, message: WSMessage): void {
    this.broadcast(message, [connection.id]);
  }
}
