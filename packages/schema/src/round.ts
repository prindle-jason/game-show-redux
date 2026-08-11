import { z } from 'zod';
import type {
  FinalJeopardyContestantView,
  FinalJeopardyState,
} from './round-types/final-jeopardy.js';
import {
  finalJeopardyActionSchema,
  finalJeopardyDataSchema,
} from './round-types/final-jeopardy.js';
import type { JeopardyContestantView, JeopardyState } from './round-types/jeopardy.js';
import { jeopardyActionSchema, jeopardyBoardDataSchema } from './round-types/jeopardy.js';
import type { WheelContestantView, WheelState } from './round-types/wheel-of-fortune.js';
import { wheelActionSchema, wheelPuzzleDataSchema } from './round-types/wheel-of-fortune.js';

export const CURRENT_ROUND_SCHEMA_VERSION = 1;

const roundBaseSchema = z.object({
  schemaVersion: z.literal(CURRENT_ROUND_SCHEMA_VERSION),
  roundId: z.string().min(1),
  title: z.string().min(1),
});

/**
 * The authored/exported file format — `round.json` inside a round's zip
 * bundle. One round type instance per file; the queue (a room-runtime
 * concept, see room.ts) is what sequences multiple rounds together.
 */
export const roundSchema = z.discriminatedUnion('type', [
  roundBaseSchema.extend({ type: z.literal('jeopardy'), data: jeopardyBoardDataSchema }),
  roundBaseSchema.extend({ type: z.literal('final-jeopardy'), data: finalJeopardyDataSchema }),
  roundBaseSchema.extend({ type: z.literal('wheel-of-fortune'), data: wheelPuzzleDataSchema }),
]);

export type Round = z.infer<typeof roundSchema>;
export type RoundType = Round['type'];

/**
 * `schema` defines each round type's data/action contract; `party` implements
 * the actual behavior (initial state, reduce, completion, contestant view)
 * against these schemas. Adding a round type means adding an entry here plus
 * a matching behavior module in `party` — not touching existing ones.
 */
export interface RoundTypeDefinition<TData = unknown, TAction = unknown> {
  type: RoundType;
  dataSchema: z.ZodType<TData>;
  actionSchema: z.ZodType<TAction>;
}

export const roundTypeDefinitions: Record<RoundType, RoundTypeDefinition> = {
  jeopardy: {
    type: 'jeopardy',
    dataSchema: jeopardyBoardDataSchema,
    actionSchema: jeopardyActionSchema,
  },
  'final-jeopardy': {
    type: 'final-jeopardy',
    dataSchema: finalJeopardyDataSchema,
    actionSchema: finalJeopardyActionSchema,
  },
  'wheel-of-fortune': {
    type: 'wheel-of-fortune',
    dataSchema: wheelPuzzleDataSchema,
    actionSchema: wheelActionSchema,
  },
};

/**
 * Runtime state for whichever queue entry is `active`, discriminated by
 * `type` — shaped by that round type's own module (party constructs it,
 * schema just publishes the shape so `party` and the apps share one type).
 */
export type RoundState = JeopardyState | FinalJeopardyState | WheelState;

/** The contestant-filtered counterpart to `RoundState` — see room.ts. */
export type RoundContestantView =
  | JeopardyContestantView
  | FinalJeopardyContestantView
  | WheelContestantView;
