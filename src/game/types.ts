/**
 * Chik! v1.0 core types.
 *
 * Two play modes share the engine:
 *  - SOLO   : single player vs. the clock, 2 bases (Left, Right), Left/Right/Free prompts only.
 *  - VERSUS : 3-6 players, turn-based, full v1.0 ruleset with all six prompts.
 *
 * The engine is framework-agnostic — no Vue, no Capacitor.
 */

export const CHANT_ORDER = ['chik', 'wally', 'hindo', 'pop', 'tambo', 'riki'] as const;
export type ChantWord = typeof CHANT_ORDER[number];

export const CHANT_POINTS: Record<ChantWord, number> = {
  chik: 1,
  wally: 2,
  hindo: 3,
  pop: 4,
  tambo: 5,
  riki: 6,
};

/**
 * Prompt — what the card does when it sits in front of a player (Versus) or which base
 * it can be slammed on (Solo, where only `right`, `left`, `free` appear in the deck).
 */
export type CardPrompt = 'right' | 'left' | 'free' | 'stop' | 'snap' | 'fetch';

export const CARD_PROMPTS: readonly CardPrompt[] = ['right', 'left', 'free', 'stop', 'snap', 'fetch'] as const;

/** Solo physical-base side. Versus has no center bases — prompts attach to seats instead. */
export type BaseSide = 'left' | 'right';

export type GameMode = 'solo' | 'versus';

export type PlayerId = string;

// ============================================================================
// Solo action / result
// ============================================================================

export type SoloAction =
  | { type: 'slam'; cardId: string; baseSide: BaseSide }
  | { type: 'draw' };

export type SoloPenaltyReason = 'wrong-base' | 'wrong-beat' | 'unnecessary-draw';

export type SoloActionResult =
  | { type: 'opened'; cardId: string; baseSide: BaseSide }
  | { type: 'success'; cardId: string; baseSide: BaseSide }
  | { type: 'drew'; cardId: string | null }
  | { type: 'penalty'; reason: SoloPenaltyReason; cardId?: string; baseSide?: BaseSide; penaltyMs: number }
  | { type: 'winner' };

// ============================================================================
// Versus action / result
// ============================================================================

export type VersusAction =
  | { type: 'play'; cardId: string; targetSeatIndex: number }
  | { type: 'draw' };

export type VersusRejectReason =
  | 'not-your-turn'
  | 'card-not-in-hand'
  | 'wrong-beat'
  | 'illegal-target'
  | 'stopped'
  | 'self-target';

export type VersusActionResult =
  | { type: 'played'; cardId: string; targetSeatIndex: number; chainTriggered: boolean }
  | { type: 'drew'; cardId: string | null; from: 'pile' | 'hand'; snapPlayedImmediately: boolean }
  | { type: 'rejected'; reason: VersusRejectReason }
  | { type: 'winner'; playerId: PlayerId };

// ============================================================================
// Events emitted by the engine (subscribed by Vue layer)
// ============================================================================

export type GameEvent =
  | { kind: 'setup'; mode: GameMode; playerCount: number }
  | { kind: 'dealt' }
  | { kind: 'gameOpened'; openerId: PlayerId }
  // Solo events
  | { kind: 'soloSlam'; cardId: string; baseSide: BaseSide; cardWord: ChantWord; cardPrompt: CardPrompt }
  | { kind: 'soloDraw'; cardId: string }
  | { kind: 'soloPenalty'; reason: SoloPenaltyReason; cardId?: string; baseSide?: BaseSide; penaltyMs: number }
  // Versus events
  | { kind: 'versusPlay'; playerId: PlayerId; cardId: string; targetSeatIndex: number; cardWord: ChantWord; cardPrompt: CardPrompt }
  | { kind: 'versusDraw'; playerId: PlayerId; cardId: string | null; from: 'pile' | 'hand'; fromPlayerId?: PlayerId }
  | { kind: 'versusSnapDrawnPlayed'; playerId: PlayerId; cardId: string }
  | { kind: 'versusTurnChanged'; playerId: PlayerId; seatIndex: number; viaChain: boolean }
  | { kind: 'versusChainStarted'; sourceSeatIndex: number; targetSeatIndex: number }
  | { kind: 'versusChainEnded'; reason: 'target-played' | 'source-drew' }
  | { kind: 'versusStopConverted' }   // draw pile emptied — Stops become Left/Right
  // Shared
  | { kind: 'chantAdvanced'; from: ChantWord; to: ChantWord }
  | { kind: 'winner'; playerId: PlayerId };
