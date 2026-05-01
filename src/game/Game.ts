import { Card } from './Card';
import { Player } from './Player';
import { Chant } from './Chant';
import { buildBaseDeck, shuffle } from './Deck';
import {
  CHANT_ORDER,
  type BaseSlot,
  type ChantWord,
  type GameEvent,
  type MiscallResult,
  type PlayResult,
  type PlayerId,
} from './types';

export interface BasePile {
  slot: BaseSlot;
  pile: Card[];
  ownerId: PlayerId | null;
}

export interface PendingSlam {
  playerId: PlayerId;
  cardId: string;
  targetBase: BaseSlot;
  shoutedWord: ChantWord;
}

type Listener = (e: GameEvent) => void;

/**
 * Pure rules engine. Has no concept of time or animation.
 * Emits GameEvents that the view layer subscribes to.
 */
export class Game {
  readonly players: Player[] = [];
  readonly bases: Map<BaseSlot, BasePile> = new Map();
  readonly chant = new Chant();

  /** True once the Halo-Halo Chik has been opened. */
  opened = false;
  haloHaloOwnerId: PlayerId | null = null;
  winnerId: PlayerId | null = null;
  /**
   * If non-null, only this player may slam — slams from anyone else are recorded as an
   * 'out-of-turn' miscall. Set by the controller in Play (BEAT) mode; null in Simulation mode.
   */
  activeBeatPlayerId: PlayerId | null = null;

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

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  setup(playerCount: number): void {
    if (playerCount < 2 || playerCount > 6) {
      throw new Error('Player count must be between 2 and 6');
    }

    // Reset state
    this.players.length = 0;
    this.bases.clear();
    this.chant.current = 'chik';
    this.opened = false;
    this.haloHaloOwnerId = null;
    this.winnerId = null;
    this.activeBeatPlayerId = null;

    // Place main base
    this.bases.set('main', { slot: 'main', pile: [], ownerId: null });

    // Create players (seat 0 youngest by convention) and claim word bases clockwise.
    // The first 6 (or fewer) seats claim their bases in chant order.
    for (let i = 0; i < playerCount; i++) {
      const p = new Player(`p${i + 1}`, i);
      this.players.push(p);
    }

    // Randomize which word each player claims this round.
    const shuffledWords = shuffle(CHANT_ORDER.slice(), this.rng);
    for (let i = 0; i < playerCount; i++) {
      const word = shuffledWords[i];
      this.players[i].ownedBaseWord = word;
      this.bases.set(word, { slot: word, pile: [], ownerId: this.players[i].id });
    }
    for (let i = playerCount; i < shuffledWords.length; i++) {
      const word = shuffledWords[i];
      this.bases.set(word, { slot: word, pile: [], ownerId: null });
    }

    // Build, shuffle, and deal the deck.
    const deck = shuffle(buildBaseDeck(), this.rng);
    this.dealAll(deck);

    // Find Halo-Halo owner.
    this.haloHaloOwnerId = this.players.find((p) =>
      p.hand.some((c) => c.isHaloHalo),
    )?.id ?? null;

    this.emit({ kind: 'setup', playerCount });
    this.emit({ kind: 'dealt' });
  }

  private dealAll(deck: Card[]): void {
    // Deal round-robin starting from player 0. (Rulebook's first-recipient lookup is not
    // visually important for the simulation — random shuffle already randomizes who gets cards.)
    let idx = 0;
    for (const card of deck) {
      this.players[idx % this.players.length].hand.push(card);
      idx++;
    }
    for (const p of this.players) p.sortHand();
  }

  // ---------------------------------------------------------------------------
  // Opening
  // ---------------------------------------------------------------------------

  openGame(): void {
    if (!this.haloHaloOwnerId) return;
    const opener = this.players.find((p) => p.id === this.haloHaloOwnerId)!;
    const halo = opener.hand.find((c) => c.isHaloHalo);
    if (!halo) return;

    const targetSlot: BaseSlot = this.bases.get('chik')!.ownerId ? 'chik' : 'main';
    // Move the Halo-Halo onto the target base.
    opener.removeCard(halo.id);
    this.bases.get(targetSlot)!.pile.push(halo);
    this.opened = true;

    this.emit({ kind: 'gameOpened', openerId: opener.id });
    this.emit({
      kind: 'slam',
      playerId: opener.id,
      cardId: halo.id,
      targetBase: targetSlot,
      shoutedWord: 'chik',
      cardWord: halo.word,
      cardKind: halo.kind,
    });

    // After Halo-Halo Chik is played, chant advances (Chik → Wally).
    const from = this.chant.current;
    this.chant.advance();
    this.emit({ kind: 'chantAdvanced', from, to: this.chant.current });

    if (opener.cardCount === 0) {
      this.declareWinner(opener.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Plays & resolutions
  // ---------------------------------------------------------------------------

  /**
   * Resolve simultaneous slams from one or more players in a single beat.
   * Returns the list of PlayResults, in arrival order.
   */
  resolveSlams(slams: PendingSlam[]): PlayResult[] {
    if (slams.length === 0) return [];
    const beat = this.chant.current;

    // Normalize: unowned word bases live in the center as display-only references — any card
    // aimed at one is redirected to the Main base before validation. This keeps the rule
    // "cards going to the center pile on Main" consistent for both decoys and non-decoys.
    for (const slam of slams) {
      if (slam.targetBase === 'main') continue;
      const base = this.bases.get(slam.targetBase);
      if (base && !base.ownerId) {
        slam.targetBase = 'main';
      }
    }

    // OPENING SPECIAL CASE (Play / BEAT mode): until the Halo-Halo Chik has been played,
    // the only valid slam is THE Halo-Halo card on its legal target (Chik base if owned,
    // else Main). Anything else is silently dropped — NO penalty during the opening.
    if (!this.opened && this.activeBeatPlayerId !== null) {
      const legalTarget: BaseSlot = this.bases.get('chik')?.ownerId ? 'chik' : 'main';
      const validHaloOpening = slams.filter((slam) => {
        const player = this.players.find((p) => p.id === slam.playerId);
        const card = player?.hand.find((c) => c.id === slam.cardId);
        return !!card && card.isHaloHalo && slam.targetBase === legalTarget;
      });
      if (validHaloOpening.length === 0) return [];
      slams = validHaloOpening;
    }

    // Each slam is first validated independently (miscall vs. correct).
    const valid: { slam: PendingSlam; card: Card }[] = [];
    const miscalls: MiscallResult[] = [];

    for (const slam of slams) {
      const player = this.players.find((p) => p.id === slam.playerId);
      const card = player?.hand.find((c) => c.id === slam.cardId);
      if (!player || !card) {
        miscalls.push({
          type: 'miscall',
          playerId: slam.playerId,
          cardId: slam.cardId,
          targetBase: slam.targetBase,
          reason: 'card-not-in-hand',
        });
        continue;
      }
      // BEAT (Play) mode: only the active-beat player may slam. Anyone else gets an
      // 'out-of-turn' miscall (penalty cards, chant doesn't advance).
      if (this.activeBeatPlayerId !== null && slam.playerId !== this.activeBeatPlayerId) {
        miscalls.push({
          type: 'miscall',
          playerId: slam.playerId,
          cardId: slam.cardId,
          targetBase: slam.targetBase,
          reason: 'out-of-turn',
        });
        continue;
      }
      // Word must match shout, shout must match beat.
      if (slam.shoutedWord !== beat || !card.matchesBeat(beat)) {
        miscalls.push({
          type: 'miscall',
          playerId: slam.playerId,
          cardId: slam.cardId,
          targetBase: slam.targetBase,
          reason: 'wrong-word',
        });
        continue;
      }
      // Base must be valid given the table state:
      //  - Decoys can be slammed on any base.
      //  - Non-decoys: legal target = the matching word base if it's owned, else Main.
      //    Slamming anywhere else (including Main when the matching base is owned, or
      //    an unowned word base when it should go to Main) is a wrong-base miscall.
      if (card.kind !== 'decoy') {
        const legalTarget = this.resolveTargetBase(card.word);
        if (slam.targetBase !== legalTarget) {
          miscalls.push({
            type: 'miscall',
            playerId: slam.playerId,
            cardId: slam.cardId,
            targetBase: slam.targetBase,
            reason: 'wrong-base',
          });
          continue;
        }
      }
      valid.push({ slam, card });
    }

    const results: PlayResult[] = [...miscalls];

    // Per Penalty Hierarchy: miscalls always penalize individually. If at least one valid
    // slam exists alongside miscalls, the valid play(s) are not in tie with the miscallers.
    const validPlayerIds = valid.map((v) => v.slam.playerId);

    if (valid.length === 0) {
      // Only miscalls happened. Apply miscall penalties; chant does not advance.
      for (const m of miscalls) this.applyMiscall(m, beat);
      return results;
    }

    if (valid.length === 1 && miscalls.length === 0) {
      // Clean solo play.
      const v = valid[0];
      this.applySuccess(v.slam, v.card);
      results.push({
        type: 'success',
        playerId: v.slam.playerId,
        cardId: v.card.id,
        targetBase: v.slam.targetBase,
        reverseTriggered: v.card.kind === 'reverse',
      });
      return results;
    }

    if (valid.length === 1 && miscalls.length > 0) {
      // Solo valid + one or more miscallers. Valid play stands; chant advances.
      const v = valid[0];
      this.applySuccess(v.slam, v.card);
      results.push({
        type: 'success',
        playerId: v.slam.playerId,
        cardId: v.card.id,
        targetBase: v.slam.targetBase,
        reverseTriggered: v.card.kind === 'reverse',
      });
      for (const m of miscalls) this.applyMiscall(m, beat);
      return results;
    }

    // valid.length >= 2 — there's a tie.
    if (miscalls.length > 0) {
      // Per Scenario 2: miscall cancels tie for non-miscallers; their cards return to hand,
      // chant does NOT advance. Only miscallers are penalized.
      this.emit({ kind: 'tie', playerIds: validPlayerIds, cardIds: valid.map((v) => v.card.id), beat });
      for (const v of valid) {
        results.push({
          type: 'tie',
          playerId: v.slam.playerId,
          cardId: v.card.id,
          targetBase: v.slam.targetBase,
          tiedWith: validPlayerIds.filter((id) => id !== v.slam.playerId),
        });
      }
      for (const m of miscalls) this.applyMiscall(m, beat);
      return results;
    }

    // Pure tie among valid plays.
    this.emit({ kind: 'tie', playerIds: validPlayerIds, cardIds: valid.map((v) => v.card.id), beat });
    const tiedPlayers = validPlayerIds
      .map((id) => this.players.find((p) => p.id === id)!)
      .filter(Boolean);
    this.applyTiePenalties(tiedPlayers, beat);
    for (const v of valid) {
      results.push({
        type: 'tie',
        playerId: v.slam.playerId,
        cardId: v.card.id,
        targetBase: v.slam.targetBase,
        tiedWith: validPlayerIds.filter((id) => id !== v.slam.playerId),
      });
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Effect application
  // ---------------------------------------------------------------------------

  private applySuccess(slam: PendingSlam, card: Card): void {
    const player = this.players.find((p) => p.id === slam.playerId)!;
    player.removeCard(card.id);

    const base = this.bases.get(slam.targetBase)!;
    base.pile.push(card);

    // The Halo-Halo Chik played via this normal slam path opens the game (Play mode flow).
    if (card.isHaloHalo && !this.opened) {
      this.opened = true;
      this.emit({ kind: 'gameOpened', openerId: slam.playerId });
    }

    this.emit({
      kind: 'slam',
      playerId: slam.playerId,
      cardId: card.id,
      targetBase: slam.targetBase,
      shoutedWord: slam.shoutedWord,
      cardWord: card.word,
      cardKind: card.kind,
    });

    if (player.cardCount === 0) {
      this.declareWinner(player.id);
      return;
    }

    if (card.kind === 'reverse') {
      const from = this.chant.current;
      this.chant.reverseStep();
      this.emit({ kind: 'chantReversed', from, to: this.chant.current });
    } else {
      const from = this.chant.current;
      this.chant.advance();
      this.emit({ kind: 'chantAdvanced', from, to: this.chant.current });
    }
  }

  private applyMiscall(m: MiscallResult, beat: ChantWord): void {
    // Look up the card the player tried to play (may be null if 'card-not-in-hand').
    const player = this.players.find((p) => p.id === m.playerId);
    const card = player?.hand.find((c) => c.id === m.cardId) ?? null;
    this.emit({
      kind: 'miscall',
      playerId: m.playerId,
      reason: m.reason,
      beat,
      cardId: m.cardId,
      cardWord: card ? card.word : beat,
      cardKind: card ? card.kind : null,
      targetBase: m.targetBase,
      shoutedWord: beat,
    });
    // The miscalled card stays in the player's hand. Apply 2-card penalty.
    this.applyPenaltyCards(m.playerId, 2, beat);
  }

  private applyTiePenalties(players: Player[], beat: ChantWord): void {
    // Return the slammed cards back to hands first.
    // Note: tied cards were not yet placed on bases (we never called applySuccess for them).
    const ordered = this.computePenaltyOrder(beat, players.map((p) => p.id));
    for (const pid of ordered) {
      this.applyPenaltyCards(pid, 1, beat);
    }
  }

  private applyPenaltyCards(playerId: PlayerId, count: number, _beat: ChantWord): void {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    const taken: { cardId: string; from: BaseSlot }[] = [];

    for (let i = 0; i < count; i++) {
      const pick = this.pickPenaltyCard();
      if (!pick) break;
      taken.push({ cardId: pick.card.id, from: pick.slot });
      player.addCard(pick.card);
    }

    if (taken.length > 0) {
      this.emit({
        kind: 'penaltyTaken',
        playerId,
        cardIds: taken.map((t) => t.cardId),
        fromBase: taken.map((t) => t.from),
      });
    }
  }

  /**
   * Pick a single penalty card from the top of any pile, normal-card priority.
   * Returns null if all piles are empty.
   */
  private pickPenaltyCard(): { card: Card; slot: BaseSlot } | null {
    const piles = Array.from(this.bases.values()).filter((b) => b.pile.length > 0);
    if (piles.length === 0) return null;

    // Prefer non-special tops; fall back to any top.
    const normalTops = piles.filter((b) => {
      const top = b.pile[b.pile.length - 1];
      return !top.isSpecial();
    });
    const choices = normalTops.length > 0 ? normalTops : piles;
    const pick = choices[Math.floor(this.rng() * choices.length)];
    const card = pick.pile.pop()!;
    return { card, slot: pick.slot };
  }

  /**
   * Compute selection order: count forward in chant from word AFTER `currentBeat`,
   * the penalized player whose owned base appears earliest selects first.
   */
  computePenaltyOrder(currentBeat: ChantWord, playerIds: PlayerId[]): PlayerId[] {
    const startIdx = (CHANT_ORDER.indexOf(currentBeat) + 1) % CHANT_ORDER.length;
    const order: PlayerId[] = [];
    const remaining = new Set(playerIds);

    for (let step = 0; step < CHANT_ORDER.length && remaining.size > 0; step++) {
      const word = CHANT_ORDER[(startIdx + step) % CHANT_ORDER.length];
      for (const pid of remaining) {
        const p = this.players.find((x) => x.id === pid)!;
        if (p.ownedBaseWord === word) {
          order.push(pid);
          remaining.delete(pid);
          break;
        }
      }
    }

    // Anyone with no base — append them (treat as "next unclaimed word") in original order.
    for (const pid of remaining) order.push(pid);
    return order;
  }

  private declareWinner(playerId: PlayerId): void {
    this.winnerId = playerId;
    this.emit({ kind: 'winner', playerId });
  }

  // ---------------------------------------------------------------------------
  // Convenience
  // ---------------------------------------------------------------------------

  getRequiredBeat(): ChantWord {
    return this.chant.current;
  }

  getBase(slot: BaseSlot): BasePile {
    return this.bases.get(slot)!;
  }

  /** Where a card matching `word` should be played (owned base or main). */
  resolveTargetBase(word: ChantWord): BaseSlot {
    const wordBase = this.bases.get(word);
    if (wordBase && wordBase.ownerId) return word;
    return 'main';
  }
}
