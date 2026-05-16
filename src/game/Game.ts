import { Card } from './Card';
import { Player } from './Player';
import { Chant } from './Chant';
import { buildSoloDeck, buildVersusDeck, shuffle } from './Deck';
import type {
  BaseSide,
  CardPrompt,
  ChantWord,
  GameEvent,
  GameMode,
  PlayerId,
  SoloAction,
  SoloActionResult,
  SoloPenaltyReason,
  VersusAction,
  VersusActionResult,
  VersusRejectReason,
} from './types';

type Listener = (e: GameEvent) => void;

const SOLO_PENALTY_MS = 2000;

/**
 * Pure rules engine. Has no concept of time or animation. The view layer subscribes via
 * `on()` and reacts to `GameEvent` emissions.
 *
 * Two modes:
 *  - Solo : single-player time-attack with two physical bases (Left, Right). Halo-Halo
 *           opens, chant beat gates play, +2s penalty for wrong-base / wrong-beat /
 *           unnecessary-draw. Win = empty hand + empty draw pile.
 *  - Versus: 3-6 players, turn-based with prompts (Right/Left/Free/Stop/Snap/Fetch),
 *           chain rule, no penalties. First to empty their hand wins.
 */
export class Game {
  readonly players: Player[] = [];
  readonly chant = new Chant();

  /** Cards waiting to be drawn. Shared by both modes. */
  drawPile: Card[] = [];
  /** Solo only — Left and Right discard stacks. */
  soloBases: { left: Card[]; right: Card[] } = { left: [], right: [] };

  mode: GameMode = 'solo';
  opened = false;
  haloHaloOwnerId: PlayerId | null = null;
  winnerId: PlayerId | null = null;

  // ----- Versus turn / chain state -----
  /** Seat index of the player whose turn it is to act. Versus only. */
  activeSeatIndex = -1;
  /** Seat index of the player whose card most recently caused activeSeat to act. If the
   *  active player is forced to draw, the chain source gets one bonus turn. Null when no
   *  chain is in progress (e.g. clockwise rotation, or after a chain has ended). */
  chainSourceSeatIndex: number | null = null;
  /** Flips true the first time the draw pile empties. Once true, all Stops convert to
   *  Left/Right (holder's choice) per the v1.0 rulebook. */
  stopConverted = false;
  /** Records who played each Fetch card so we know whose hand to drain when its recipient
   *  is forced to draw. Cleared on setup. */
  private fetchOwners: Map<string, number> = new Map();

  private listeners: Listener[] = [];
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  on(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  // ===========================================================================
  // SETUP
  // ===========================================================================

  setupSolo(): void {
    this.resetState();
    this.mode = 'solo';
    this.players.push(new Player('p1', 0));
    this.players[0].isAI = false;

    // Set aside Halo-Halo so it's guaranteed to be in the opening hand — otherwise the
    // player could be forced to draw blindly until they fish the opener out of the deck,
    // which is fiddly and not what Solo is meant to test.
    const fullDeck = buildSoloDeck();
    const halo = fullDeck.find((c) => c.isHaloHalo)!;
    const rest = shuffle(fullDeck.filter((c) => !c.isHaloHalo), this.rng);
    // Deal 6 random cards + 1 Halo-Halo = 7-card opening hand.
    for (let i = 0; i < 6; i++) {
      const card = rest.pop();
      if (card) this.players[0].hand.push(card);
    }
    this.players[0].hand.push(halo);
    this.drawPile = rest;
    this.haloHaloOwnerId = this.players[0].id;

    this.emit({ kind: 'setup', mode: 'solo', playerCount: 1 });
    this.emit({ kind: 'dealt' });
  }

  setupVersus(playerCount: number): void {
    if (playerCount < 3 || playerCount > 6) {
      throw new Error('Versus player count must be 3-6');
    }
    this.resetState();
    this.mode = 'versus';

    for (let i = 0; i < playerCount; i++) {
      this.players.push(new Player(`p${i + 1}`, i));
    }

    // v1.0 setup: set aside Halo-Halo + (N-1) standard Chiks. Shuffle remainder, deal 6.
    // Then shuffle the set-aside Chik pile and deal 1 to each player → 7 cards each.
    const fullDeck = buildVersusDeck();
    const halo = fullDeck.find((c) => c.isHaloHalo)!;
    // Set aside (N-1) standard Chiks (any prompt). Free Chiks excluded so we don't
    // double-dip into the Free prompt category beyond Halo-Halo.
    const chikPool = fullDeck.filter((c) => c.word === 'chik' && !c.isHaloHalo);
    const shuffledChikPool = shuffle(chikPool, this.rng);
    const setAsideChiks = shuffledChikPool.slice(0, playerCount - 1);
    const setAsideIds = new Set(setAsideChiks.map((c) => c.id));
    setAsideIds.add(halo.id);

    const remainder = fullDeck.filter((c) => !setAsideIds.has(c.id));
    const shuffledRemainder = shuffle(remainder, this.rng);

    // Deal 6 from the remainder to each player.
    for (let r = 0; r < 6; r++) {
      for (const p of this.players) {
        const card = shuffledRemainder.pop();
        if (card) p.hand.push(card);
      }
    }

    // Shuffle the set-aside Chik pile (incl. Halo-Halo) and deal 1 to each player.
    const openers = shuffle([halo, ...setAsideChiks], this.rng);
    for (let i = 0; i < playerCount; i++) {
      const card = openers.pop();
      if (card) this.players[i].hand.push(card);
    }

    // Sort all hands (Versus keeps hands sorted; players manually sort their own).
    for (const p of this.players) p.sortHand();

    // Remainder goes face-down as the draw pile.
    this.drawPile = shuffledRemainder;

    // Identify Halo-Halo holder.
    this.haloHaloOwnerId = this.players.find((p) =>
      p.hand.some((c) => c.isHaloHalo),
    )?.id ?? null;

    // The Halo-Halo holder takes the first turn.
    const haloSeat = this.players.findIndex((p) => p.id === this.haloHaloOwnerId);
    this.activeSeatIndex = haloSeat >= 0 ? haloSeat : 0;

    this.emit({ kind: 'setup', mode: 'versus', playerCount });
    this.emit({ kind: 'dealt' });
  }

  private resetState(): void {
    this.players.length = 0;
    this.chant.reset();
    this.drawPile = [];
    this.soloBases = { left: [], right: [] };
    this.opened = false;
    this.haloHaloOwnerId = null;
    this.winnerId = null;
    this.activeSeatIndex = -1;
    this.chainSourceSeatIndex = null;
    this.stopConverted = false;
    this.fetchOwners.clear();
  }

  // ===========================================================================
  // SOLO
  // ===========================================================================

  submitSoloAction(action: SoloAction): SoloActionResult {
    if (this.mode !== 'solo' || this.winnerId) {
      return { type: 'penalty', reason: 'wrong-beat', penaltyMs: 0 };
    }
    const player = this.players[0];
    const beat = this.chant.current;

    if (action.type === 'slam') {
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return { type: 'penalty', reason: 'wrong-beat', cardId: action.cardId, penaltyMs: 0 };

      // Opening gate: only Halo-Halo Chik may open the game.
      if (!this.opened) {
        if (!card.isHaloHalo) {
          return this.emitSoloPenalty('wrong-beat', card.id, action.baseSide);
        }
        // Halo-Halo must still go on a legal base (Free → either is fine).
        if (!card.legalSoloBases().includes(action.baseSide)) {
          return this.emitSoloPenalty('wrong-base', card.id, action.baseSide);
        }
        player.removeCard(card.id);
        this.soloBases[action.baseSide].push(card);
        this.opened = true;
        this.emit({ kind: 'gameOpened', openerId: player.id });
        this.emit({ kind: 'soloSlam', cardId: card.id, baseSide: action.baseSide, cardWord: card.word, cardPrompt: card.prompt });
        this.advanceChant();
        return { type: 'opened', cardId: card.id, baseSide: action.baseSide };
      }

      // Post-open: chant beat must match.
      if (!card.matchesBeat(beat)) {
        return this.emitSoloPenalty('wrong-beat', card.id, action.baseSide);
      }
      // Card prompt must allow this base.
      if (!card.legalSoloBases().includes(action.baseSide)) {
        return this.emitSoloPenalty('wrong-base', card.id, action.baseSide);
      }

      // Legal slam.
      player.removeCard(card.id);
      this.soloBases[action.baseSide].push(card);
      this.emit({ kind: 'soloSlam', cardId: card.id, baseSide: action.baseSide, cardWord: card.word, cardPrompt: card.prompt });
      this.advanceChant();

      // Win check.
      if (player.cardCount === 0 && this.drawPile.length === 0) {
        this.declareWinner(player.id);
        return { type: 'winner' };
      }
      return { type: 'success', cardId: card.id, baseSide: action.baseSide };
    }

    // action.type === 'draw'
    if (this.drawPile.length === 0) {
      // Drawing from an empty pile is harmless — just a no-op. Don't penalize.
      return { type: 'drew', cardId: null };
    }
    // Unnecessary-draw penalty: only AFTER the game has opened, and only if the player has
    // a card legally playable on the current beat (correct word AND a base that accepts it).
    if (this.opened) {
      const hasLegalPlay = player.hand.some(
        (c) => c.matchesBeat(beat) && c.legalSoloBases().length > 0,
      );
      if (hasLegalPlay) {
        return this.emitSoloPenalty('unnecessary-draw', undefined, undefined);
      }
    } else {
      // Pre-open: if the player is holding Halo-Halo, drawing is wasteful.
      if (player.hand.some((c) => c.isHaloHalo)) {
        return this.emitSoloPenalty('unnecessary-draw', undefined, undefined);
      }
    }

    const drawn = this.drawPile.pop();
    if (drawn) {
      player.hand.push(drawn);
      this.emit({ kind: 'soloDraw', cardId: drawn.id });
    }

    // Win check after draw (in case this was the last possible action — empty pile + empty hand).
    if (player.cardCount === 0 && this.drawPile.length === 0) {
      this.declareWinner(player.id);
      return { type: 'winner' };
    }
    return { type: 'drew', cardId: drawn?.id ?? null };
  }

  private emitSoloPenalty(reason: SoloPenaltyReason, cardId?: string, baseSide?: BaseSide): SoloActionResult {
    this.emit({ kind: 'soloPenalty', reason, cardId, baseSide, penaltyMs: SOLO_PENALTY_MS });
    return { type: 'penalty', reason, cardId, baseSide, penaltyMs: SOLO_PENALTY_MS };
  }

  // ===========================================================================
  // VERSUS
  // ===========================================================================

  submitVersusAction(playerId: PlayerId, action: VersusAction): VersusActionResult {
    if (this.mode !== 'versus' || this.winnerId) {
      return { type: 'rejected', reason: 'not-your-turn' };
    }
    const seatIdx = this.players.findIndex((p) => p.id === playerId);
    if (seatIdx === -1 || seatIdx !== this.activeSeatIndex) {
      return { type: 'rejected', reason: 'not-your-turn' };
    }
    const player = this.players[seatIdx];

    // Pre-open: the only legal action is the Halo-Halo holder playing the Halo-Halo Chik
    // in front of another player.
    if (!this.opened) {
      if (action.type !== 'play') return { type: 'rejected', reason: 'wrong-beat' };
      const card = player.hand.find((c) => c.id === action.cardId);
      if (!card) return { type: 'rejected', reason: 'card-not-in-hand' };
      if (!card.isHaloHalo) return { type: 'rejected', reason: 'wrong-beat' };
      return this.executeVersusPlay(seatIdx, card, action.targetSeatIndex);
    }

    if (action.type === 'play') {
      return this.versusPlay(seatIdx, action.cardId, action.targetSeatIndex);
    }
    return this.versusDraw(seatIdx);
  }

  private versusPlay(seatIdx: number, cardId: string, targetSeatIndex: number): VersusActionResult {
    const player = this.players[seatIdx];
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return { type: 'rejected', reason: 'card-not-in-hand' };

    // Beat must match.
    if (!card.matchesBeat(this.chant.current)) {
      return { type: 'rejected', reason: 'wrong-beat' };
    }

    // Prompt-dictated legality. For Snap/Fetch/converted-Stop the player picked their
    // direction by WHERE they dropped the card — targetSeatIndex is the choice.
    const reject = this.validateTarget(seatIdx, card, targetSeatIndex);
    if (reject) return { type: 'rejected', reason: reject };

    return this.executeVersusPlay(seatIdx, card, targetSeatIndex);
  }

  /**
   * Validate the target seat is legal given the player's current prompt.
   *
   * Direction rules:
   *  - Left / Right prompt -> only that neighbor.
   *  - Stop -> nothing legal (recipient must draw); once the pile drains, the Stop
   *    converts and the holder may play to EITHER neighbor.
   *  - Snap or Fetch as a prompt -> the holder PICKS left or right by where they drop
   *    the card. Both neighbors are legal targets; the chosen direction is implicit
   *    in targetSeatIndex.
   *  - Free or no prompt (Halo-Halo opener) -> any non-self seat is legal.
   */
  private validateTarget(seatIdx: number, card: Card, targetSeatIndex: number): VersusRejectReason | null {
    if (targetSeatIndex === seatIdx) return 'self-target';
    if (targetSeatIndex < 0 || targetSeatIndex >= this.players.length) return 'illegal-target';

    const player = this.players[seatIdx];
    const promptCard = player.topPrompt;
    const effective = this.effectivePromptDirection(promptCard);

    if (effective === 'stop') return 'stopped';

    if (effective === 'left') {
      if (targetSeatIndex !== this.neighborSeat(seatIdx, 'left')) return 'illegal-target';
    } else if (effective === 'right') {
      if (targetSeatIndex !== this.neighborSeat(seatIdx, 'right')) return 'illegal-target';
    } else if (effective === 'either-neighbor') {
      const isLeftNeighbor = targetSeatIndex === this.neighborSeat(seatIdx, 'left');
      const isRightNeighbor = targetSeatIndex === this.neighborSeat(seatIdx, 'right');
      if (!isLeftNeighbor && !isRightNeighbor) return 'illegal-target';
    }
    // 'free' or null -> any non-self seat is legal.
    return null;
  }

  /**
   * What kind of targeting is in effect for the player whose top prompt is `promptCard`.
   *  - 'left' / 'right' -> exactly that neighbor (directional prompt)
   *  - 'either-neighbor' -> Snap / Fetch prompt, or a Stop after the draw pile emptied;
   *    the holder picks by where they drop the card
   *  - 'stop' -> blocked, must draw
   *  - 'free' -> any non-self seat
   *  - null  -> no prompt yet (only the Halo-Halo opener; same as 'free')
   */
  private effectivePromptDirection(promptCard: Card | null): 'left' | 'right' | 'free' | 'stop' | 'either-neighbor' | null {
    if (!promptCard) return null;
    if (promptCard.prompt === 'snap' || promptCard.prompt === 'fetch') return 'either-neighbor';
    if (promptCard.prompt === 'stop') return this.stopConverted ? 'either-neighbor' : 'stop';
    return promptCard.prompt;
  }

  /**
   * The seat array advances CLOCKWISE around the table as viewed from above
   * (south -> west -> north -> east). But each player sitting AT their seat and
   * looking inward has their right hand pointing the OTHER way around the table
   * — counter-clockwise from above. So "to my right" at the table is the
   * PREVIOUS index in the seat array (mod n), and "to my left" is the next.
   */
  private neighborSeat(seatIdx: number, dir: 'left' | 'right'): number {
    const n = this.players.length;
    return dir === 'right' ? (seatIdx - 1 + n) % n : (seatIdx + 1) % n;
  }

  /** Move a card from hand to target's prompt stack; advance chant; rotate active player. */
  private executeVersusPlay(seatIdx: number, card: Card, targetSeatIndex: number): VersusActionResult {
    if (targetSeatIndex === seatIdx) {
      return { type: 'rejected', reason: 'self-target' };
    }
    if (targetSeatIndex < 0 || targetSeatIndex >= this.players.length) {
      return { type: 'rejected', reason: 'illegal-target' };
    }
    const player = this.players[seatIdx];
    const target = this.players[targetSeatIndex];

    player.removeCard(card.id);
    target.promptStack.push(card);
    if (card.prompt === 'fetch') this.fetchOwners.set(card.id, seatIdx);

    // Opening flip.
    if (!this.opened && card.isHaloHalo) {
      this.opened = true;
      this.emit({ kind: 'gameOpened', openerId: player.id });
    }

    this.emit({
      kind: 'versusPlay',
      playerId: player.id,
      cardId: card.id,
      targetSeatIndex,
      cardWord: card.word,
      cardPrompt: card.prompt,
    });

    this.advanceChant();

    // Win check.
    if (player.cardCount === 0) {
      this.declareWinner(player.id);
      return { type: 'winner', playerId: player.id };
    }

    // Chain bookkeeping: the player who just played is the new chain source. If target
    // is forced to draw on their turn, source gets a bonus turn.
    this.chainSourceSeatIndex = seatIdx;
    this.setActiveSeat(targetSeatIndex, /* viaChain */ false);

    return { type: 'played', cardId: card.id, targetSeatIndex, chainTriggered: false };
  }

  private versusDraw(seatIdx: number): VersusActionResult {
    const player = this.players[seatIdx];

    // Determine draw source: Fetch prompt → drain from owner's hand. Otherwise pile.
    const top = player.topPrompt;
    const isFetch = top?.prompt === 'fetch';
    const fetchOwnerSeat = isFetch ? this.findFetchOwnerSeat(top!) : -1;
    const fetchOwner = fetchOwnerSeat >= 0 ? this.players[fetchOwnerSeat] : null;

    let drawnCard: Card | null = null;
    let source: 'pile' | 'hand' = 'pile';

    // Add the drawn card to the recipient's hand BEFORE emitting the versusDraw event.
    // The animation layer (useGame.queueFlightForDraw) looks up the card in player.hand
    // to grab its assetPath and decide whether the recipient is human (-> reveal face
    // mid-flight). For Snap-when-drawn the card will be popped right back out by
    // executeVersusPlay below; the brief in-hand moment is harmless to the engine and
    // critical for the listener.
    let ownerWonByDrain = false;
    if (isFetch && fetchOwner && fetchOwner.cardCount > 0) {
      const idx = Math.floor(this.rng() * fetchOwner.hand.length);
      drawnCard = fetchOwner.hand.splice(idx, 1)[0];
      source = 'hand';
      ownerWonByDrain = fetchOwner.cardCount === 0;
      player.addCard(drawnCard);
      this.emit({ kind: 'versusDraw', playerId: player.id, cardId: drawnCard.id, from: 'hand', fromPlayerId: fetchOwner.id });
      if (ownerWonByDrain) {
        this.declareWinner(fetchOwner.id);
        return { type: 'winner', playerId: fetchOwner.id };
      }
    } else {
      // Pile draw.
      if (this.drawPile.length > 0) {
        drawnCard = this.drawPile.pop()!;
        player.addCard(drawnCard);
        this.emit({ kind: 'versusDraw', playerId: player.id, cardId: drawnCard.id, from: 'pile' });
        // If that drained the pile, convert Stops (one-shot).
        if (this.drawPile.length === 0 && !this.stopConverted) {
          this.stopConverted = true;
          this.emit({ kind: 'versusStopConverted' });
        }
      } else {
        // Empty pile — no draw. Ensure Stops are converted.
        if (!this.stopConverted) {
          this.stopConverted = true;
          this.emit({ kind: 'versusStopConverted' });
        }
        this.emit({ kind: 'versusDraw', playerId: player.id, cardId: null, from: 'pile' });
      }
    }

    // Snap-when-drawn override: if drawnCard is a Snap matching the current beat, play it
    // immediately. Overrides Stop, doesn't end the turn normally — instead resolves as a
    // play with the player choosing Left/Right. The card is already in hand from above,
    // so we just emit + executeVersusPlay (which pops it back out).
    let snapPlayedImmediately = false;
    if (drawnCard && drawnCard.prompt === 'snap' && drawnCard.matchesBeat(this.chant.current)) {
      const dir: 'left' | 'right' = 'right';
      const targetSeat = this.neighborSeat(seatIdx, dir);
      this.emit({ kind: 'versusSnapDrawnPlayed', playerId: player.id, cardId: drawnCard.id });
      const result = this.executeVersusPlay(seatIdx, drawnCard, targetSeat);
      snapPlayedImmediately = true;
      return result.type === 'winner'
        ? result
        : { type: 'drew', cardId: drawnCard.id, from: source, snapPlayedImmediately };
    }

    // Chain rule: if chainSource is set AND this draw was NOT Fetch-forced, bounce back to source.
    if (this.chainSourceSeatIndex !== null && !isFetch && this.chainSourceSeatIndex !== seatIdx) {
      const sourceSeat = this.chainSourceSeatIndex;
      this.emit({ kind: 'versusChainStarted', sourceSeatIndex: sourceSeat, targetSeatIndex: seatIdx });
      // chainSource takes the bonus turn next.
      this.setActiveSeat(sourceSeat, /* viaChain */ true);
      // chainSource STAYS the chain source — if their bonus play causes another draw, they bounce again.
      return { type: 'drew', cardId: drawnCard?.id ?? null, from: source, snapPlayedImmediately };
    }

    // Chain ends (or never started). Play passes clockwise from the player who drew —
    // unless the drawer IS the chain source (their own draw ends the chain; play passes
    // clockwise from THEIR seat).
    this.emit({ kind: 'versusChainEnded', reason: 'source-drew' });
    this.chainSourceSeatIndex = null;
    const next = this.nextClockwiseWithCards(seatIdx);
    if (next === -1) {
      this.declareWinner(player.id); // shouldn't really happen, but fall through
      return { type: 'winner', playerId: player.id };
    }
    this.setActiveSeat(next, /* viaChain */ false);
    return { type: 'drew', cardId: drawnCard?.id ?? null, from: source, snapPlayedImmediately };
  }

  /** Find the seat that played the Fetch card currently in front of `seatIdx`. */
  private findFetchOwnerSeat(fetchCard: Card): number {
    return this.fetchOwners.get(fetchCard.id) ?? -1;
  }

  /** Move the active seat marker and emit. */
  private setActiveSeat(seatIdx: number, viaChain: boolean): void {
    this.activeSeatIndex = seatIdx;
    const player = this.players[seatIdx];
    if (!player) return;
    this.emit({ kind: 'versusTurnChanged', playerId: player.id, seatIndex: seatIdx, viaChain });
  }

  /** Seat clockwise of `from` that still has cards. -1 if none. */
  private nextClockwiseWithCards(from: number): number {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (this.players[idx].cardCount > 0) return idx;
    }
    return -1;
  }

  // ===========================================================================
  // SHARED
  // ===========================================================================

  private advanceChant(): void {
    const from = this.chant.current;
    this.chant.advance();
    this.emit({ kind: 'chantAdvanced', from, to: this.chant.current });
  }

  private declareWinner(playerId: PlayerId): void {
    this.winnerId = playerId;
    this.emit({ kind: 'winner', playerId });
  }

  // ===========================================================================
  // Convenience
  // ===========================================================================

  getRequiredBeat(): ChantWord {
    return this.chant.current;
  }

  /** Versus convenience: which seats can the human at `seatIdx` legally target right now? */
  legalTargetSeats(seatIdx: number, card: Card): number[] {
    if (seatIdx < 0 || seatIdx >= this.players.length) return [];
    // Pre-open Halo-Halo opening: any non-self seat is legal.
    if (!this.opened) {
      if (!card.isHaloHalo) return [];
      const out: number[] = [];
      for (let i = 0; i < this.players.length; i++) if (i !== seatIdx) out.push(i);
      return out;
    }
    if (!card.matchesBeat(this.chant.current)) return [];
    const all: number[] = [];
    for (let i = 0; i < this.players.length; i++) {
      if (i === seatIdx) continue;
      const reject = this.validateTarget(seatIdx, card, i);
      if (!reject) all.push(i);
    }
    return all;
  }
}
