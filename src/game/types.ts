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

export type CardKind = 'standard' | 'reverse' | 'decoy' | 'halo-halo';

export type BaseSlot = ChantWord | 'main';

export type PlayerId = string;

export interface PlayResultBase {
  type: 'success' | 'tie' | 'miscall';
  playerId: PlayerId;
  cardId: string;
  targetBase: BaseSlot;
}

export interface SuccessResult extends PlayResultBase {
  type: 'success';
  reverseTriggered: boolean;
}

export interface TieResult extends PlayResultBase {
  type: 'tie';
  tiedWith: PlayerId[];
}

export interface MiscallResult extends PlayResultBase {
  type: 'miscall';
  reason: 'wrong-word' | 'wrong-base' | 'card-not-in-hand' | 'out-of-turn';
}

export type PlayResult = SuccessResult | TieResult | MiscallResult;

export type GameEvent =
  | { kind: 'setup'; playerCount: number }
  | { kind: 'dealt' }
  | { kind: 'gameOpened'; openerId: PlayerId }
  | { kind: 'slam'; playerId: PlayerId; cardId: string; targetBase: BaseSlot; shoutedWord: ChantWord; cardWord: ChantWord; cardKind: CardKind }
  | { kind: 'chantAdvanced'; from: ChantWord; to: ChantWord }
  | { kind: 'chantReversed'; from: ChantWord; to: ChantWord }
  | { kind: 'tie'; playerIds: PlayerId[]; cardIds: string[]; beat: ChantWord }
  | { kind: 'miscall'; playerId: PlayerId; reason: MiscallResult['reason']; beat: ChantWord; cardId: string; cardWord: ChantWord; cardKind: CardKind | null; targetBase: BaseSlot; shoutedWord: ChantWord }
  | { kind: 'penaltyTaken'; playerId: PlayerId; cardIds: string[]; fromBase: BaseSlot[] }
  | { kind: 'beatChanged'; seatIndex: number; playerId: PlayerId }
  | { kind: 'beatSkipped'; seatIndex: number; playerId: PlayerId; beat: ChantWord }
  | { kind: 'soloPenalty'; playerId: PlayerId; cardId: string; cardWord: ChantWord; expectedBeat: ChantWord; penaltyMs: number }
  | { kind: 'soloAutoFinish'; playerId: PlayerId; cardCount: number; totalPenaltyMs: number }
  | { kind: 'winner'; playerId: PlayerId };
