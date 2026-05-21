/**
 * Tutorial scenario applier. Pins a `Game` instance into a known, reproducible state by
 * mutating it directly (the same pattern Vitest tests already use). This runs AFTER
 * `useGame.initGame()` so the engine's reactive `Card[]` proxies (drawPile, soloBases,
 * each player's hand + promptStack) are already in place, we mutate the wrapped arrays
 * in-place so Vue's tracking still fires.
 *
 * Cards are referenced by a compact `CardSpec` ({ word, prompt }), the applier locates
 * a real engine card matching the spec by pulling from any pool (deck, any hand, any
 * promptStack) so callers don't have to know where it lives. promptStack stubs are
 * built standalone since they don't need to be real engine-deck cards.
 *
 * Mutation contract: only state that's explicitly mentioned in the scenario is touched.
 * Seats not present in `hands` keep whatever cards `setupVersus()` dealt them.
 */

import type { Card } from '@/game/Card';
import type { Game } from '@/game/Game';
import type { BaseSide, CardPrompt, ChantWord } from '@/game/types';

/** Minimal card reference. The applier locates a real Card matching this spec, or builds
 *  a stub for promptStack inserts that don't need to be real deck cards. */
export interface CardSpec {
  word: ChantWord;
  prompt: CardPrompt;
  /** Route the engine's real Halo-Halo Chik to this slot (ignores word/prompt). */
  isHaloHalo?: boolean;
  /** Mark this card as a Chant Chik (visual + triggers the Chant Trigger if closing). */
  isChantChik?: boolean;
  /** Override the count on stubs built for `promptStacks`. The Chant Trigger sums
   *  `topPrompt.count` across all seats, orchestrated tutorial scenarios need
   *  specific counts so the recital lands on a known beat. Pulled cards keep
   *  their deck-assigned counts; this field only applies to stubs. */
  count?: number;
}

export interface PromptStackEntry {
  /** Seat index whose pile gets this card added on top. */
  seatIndex: number;
  card: CardSpec;
  /** If the prompt is Fetch, record the placer (engine's `fetchOwners` map). */
  fetchOwnerSeatIndex?: number;
}

export interface SoloScenario {
  /** Replace seat 0's hand with these cards (in order). */
  hand?: CardSpec[];
  /** Pin the chant beat. */
  beat?: ChantWord;
  /** Set the active prompt on either base. Engine's soloActive* fields are pinned to match. */
  activePrompt?: { side: BaseSide; card: CardSpec };
  /** Engine flag, pretend game has already opened, skipping the Halo-Halo gate. */
  opened?: boolean;
  /** Pin the top of the draw pile to a deterministic sequence. The FIRST entry
   *  in the array will be drawn FIRST (engine uses `drawPile.pop()` so we push
   *  these in reverse order onto the end). Used by the Solo tutorial to script
   *  exactly which cards come out of the deck on each draw. */
  deckTops?: CardSpec[];
}

export interface VersusScenario {
  /** Replace specific seats' hands. Seats not listed keep their `setupVersus` deal. */
  hands?: Record<number, CardSpec[]>;
  /** Additively add cards to specific seats' hands. Pulled from the DRAW PILE only -
   *  unlike `hands`, this never steals from other players. Used by tutorial setups to
   *  ensure a specific opponent has the card needed for an upcoming demo without
   *  disturbing existing hands. Silently skips a spec that isn't in the deck. */
  appendHands?: Record<number, CardSpec[]>;
  /** Pin the chant beat. */
  beat?: ChantWord;
  /** Whose turn it is right now. */
  activeSeatIndex?: number;
  /** Push cards onto specific players' promptStacks (last entry becomes the active prompt). */
  promptStacks?: PromptStackEntry[];
  /** Seat indices whose promptStacks should be RESET (emptied) before `promptStacks`
   *  entries are pushed. Use this to keep tutorial steps internally consistent, the
   *  applier is otherwise additive across steps. */
  clearPromptStacks?: number[];
  /** Pin the top of the draw pile (e.g. for a Snap-drawn demo). */
  deckTop?: CardSpec;
  /** Engine flag, pretend game has already opened. */
  opened?: boolean;
  /** Set chainSourceSeatIndex so a subsequent forced-draw bounces back here. */
  chainSourceSeatIndex?: number | null;
  /** Restart the beat-selection phase with this seat picking first. Used by the
   *  Versus tutorial so the player (seat 0) leads the picks, without this the
   *  original Halo-Halo holder (random) keeps the lead even after the tutorial
   *  re-seeds Halo-Halo to the human. Also clears any previously-claimed beats. */
  restartBeatSelectionFromSeat?: number;
  /** Auto-complete the beat-selection phase so play can begin immediately. Used
   *  by tutorial steps that come AFTER the beat-claim step, they need the
   *  setup to be `'play'` so the BeatPickerOverlay doesn't block interaction. */
  autoCompleteBeatSelection?: boolean;
}

// --------------------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------------------

/** Engine internals we deliberately poke. Bypasses Game's `private` modifier on
 *  `fetchOwners` the same way the engine tests do, direct field write through an
 *  unknown cast. Plain class fields, no proxies, so writes don't need triggerRef. */
interface GameInternals {
  soloActiveCardId: string | null;
  soloActivePrompt: CardPrompt | null;
  soloActiveBaseSide: BaseSide | null;
  fetchOwners: Map<string, number>;
  activeSeatIndex: number;
  opened: boolean;
  chainSourceSeatIndex: number | null;
}
function asInternals(game: Game): GameInternals {
  return game as unknown as GameInternals;
}

/** Find-and-pull a real Card matching the spec from anywhere it could plausibly live -
 *  deck, any hand, any promptStack. Halo-Halo routes through `pullHaloHalo`. */
function pullCardAnywhere(game: Game, spec: CardSpec): Card | null {
  if (spec.isHaloHalo) return pullHaloHalo(game);
  const match = (c: Card) => c.word === spec.word && c.prompt === spec.prompt && !c.isHaloHalo;

  const di = game.drawPile.findIndex(match);
  if (di >= 0) return game.drawPile.splice(di, 1)[0];

  for (const p of game.players) {
    const hi = p.hand.findIndex(match);
    if (hi >= 0) return p.hand.splice(hi, 1)[0];
    const si = p.promptStack.findIndex(match);
    if (si >= 0) return p.promptStack.splice(si, 1)[0];
  }
  return null;
}

/** Find-and-pull the real Halo-Halo Chik card from wherever it is. */
function pullHaloHalo(game: Game): Card | null {
  const di = game.drawPile.findIndex((c) => c.isHaloHalo);
  if (di >= 0) return game.drawPile.splice(di, 1)[0];
  for (const p of game.players) {
    const hi = p.hand.findIndex((c) => c.isHaloHalo);
    if (hi >= 0) return p.hand.splice(hi, 1)[0];
    const si = p.promptStack.findIndex((c) => c.isHaloHalo);
    if (si >= 0) return p.promptStack.splice(si, 1)[0];
  }
  return null;
}

/** Build a stub Card-shaped object for promptStack inserts when we don't need a real
 *  deck card (the engine reads only `id`, `word`, `prompt`, `isHaloHalo`, and the
 *  derived getters from promptStack entries). */
function buildStub(spec: CardSpec, suffix: string): Card {
  const stub = {
    id: `tutorial-${suffix}-${spec.word}-${spec.prompt}`,
    word: spec.word,
    prompt: spec.prompt,
    isHaloHalo: spec.isHaloHalo ?? false,
    isChantChik: spec.isChantChik ?? false,
    /** Count for Chant Trigger math. Defaults to 0, orchestrated steps must
     *  pin a value explicitly via `spec.count`. */
    count: spec.count ?? 0,
    matchesBeat(beat: ChantWord): boolean {
      return beat === spec.word;
    },
    get assetPath(): string {
      if (this.isHaloHalo) return '/cards/halohalo-chik-free.png';
      const artSuffix =
        spec.prompt === 'stop' ? 'block' : spec.prompt === 'fetch' ? 'off-deck' : spec.prompt;
      return `/cards/${spec.word}-${artSuffix}.png`;
    },
    legalSoloBases(): BaseSide[] {
      return spec.prompt === 'left' ? ['left'] : spec.prompt === 'right' ? ['right'] : ['left', 'right'];
    },
  };
  return stub as unknown as Card;
}

/** Empty a specific seat's hand back into the draw pile (so we can re-deal from a known
 *  pool without leaking the original deal). */
function returnHandToDeck(game: Game, seatIndex: number): void {
  const p = game.players[seatIndex];
  if (!p) return;
  while (p.hand.length > 0) game.drawPile.push(p.hand.pop()!);
}

// --------------------------------------------------------------------------------------
// Appliers
// --------------------------------------------------------------------------------------

export function applySoloScenario(game: Game, scenario: SoloScenario): void {
  const g = asInternals(game);

  if (scenario.beat !== undefined) {
    game.chant.current = scenario.beat;
  }

  if (scenario.hand) {
    returnHandToDeck(game, 0);
    for (const spec of scenario.hand) {
      const card = pullCardAnywhere(game, spec);
      if (card) game.players[0].hand.push(card);
    }
  }

  // Active prompt: clear both bases (Solo can only hold one stack of recent cards
  // anyway in tutorial setups), then place the active prompt card on the chosen side.
  if (scenario.activePrompt) {
    while (game.soloBases.left.length > 0) game.drawPile.push(game.soloBases.left.pop()!);
    while (game.soloBases.right.length > 0) game.drawPile.push(game.soloBases.right.pop()!);
    const card = pullCardAnywhere(game, scenario.activePrompt.card);
    if (card) {
      game.soloBases[scenario.activePrompt.side].push(card);
      g.soloActiveCardId = card.id;
      g.soloActivePrompt = card.prompt;
      g.soloActiveBaseSide = scenario.activePrompt.side;
    }
  }

  if (scenario.opened !== undefined) {
    g.opened = scenario.opened;
  }

  if (scenario.deckTops) {
    // First entry should be drawn first → push them in REVERSE onto the end of
    // drawPile (engine's `pop()` consumes the last element). Pull each card
    // from anywhere it currently lives so the seeding is robust against the
    // deal having scattered them across hands/bases already.
    for (let i = scenario.deckTops.length - 1; i >= 0; i--) {
      const card = pullCardAnywhere(game, scenario.deckTops[i]);
      if (card) game.drawPile.push(card);
    }
  }
}

export function applyVersusScenario(game: Game, scenario: VersusScenario): void {
  const g = asInternals(game);

  if (scenario.beat !== undefined) {
    game.chant.current = scenario.beat;
  }

  if (scenario.hands) {
    for (const [seatStr, specs] of Object.entries(scenario.hands)) {
      const seat = Number(seatStr);
      const player = game.players[seat];
      if (!player) continue;
      returnHandToDeck(game, seat);
      for (const spec of specs) {
        const card = pullCardAnywhere(game, spec);
        if (card) player.hand.push(card);
      }
    }
  }

  if (scenario.appendHands) {
    for (const [seatStr, specs] of Object.entries(scenario.appendHands)) {
      const seat = Number(seatStr);
      const player = game.players[seat];
      if (!player) continue;
      for (const spec of specs) {
        // Prefer the draw pile so we don't disturb existing hands. If the deck doesn't
        // have the card (e.g. it was dealt out during setupVersus), fall back to other
        // seats' hands, but never the target's own hand. This guarantees the tutorial
        // demo can find the card it needs, at the cost of occasionally moving a card
        // from one AI to another (invisible to the player).
        const matches = (c: { word: string; prompt: string; isHaloHalo: boolean }) =>
          c.word === spec.word && c.prompt === spec.prompt && !c.isHaloHalo;
        const di = game.drawPile.findIndex(matches);
        if (di >= 0) {
          player.hand.push(game.drawPile.splice(di, 1)[0]);
          continue;
        }
        let pulled: Card | null = null;
        for (let s = 0; s < game.players.length; s++) {
          if (s === seat) continue;
          const other = game.players[s];
          const hi = other.hand.findIndex(matches);
          if (hi >= 0) {
            pulled = other.hand.splice(hi, 1)[0];
            break;
          }
        }
        if (pulled) player.hand.push(pulled);
      }
    }
  }

  if (scenario.clearPromptStacks) {
    for (const seat of scenario.clearPromptStacks) {
      const player = game.players[seat];
      if (!player) continue;
      while (player.promptStack.length > 0) player.promptStack.pop();
    }
  }

  if (scenario.promptStacks) {
    for (const entry of scenario.promptStacks) {
      const player = game.players[entry.seatIndex];
      if (!player) continue;
      const stub = buildStub(entry.card, `prompt-s${entry.seatIndex}`);
      player.promptStack.push(stub);
      if (entry.card.prompt === 'fetch' && entry.fetchOwnerSeatIndex !== undefined) {
        g.fetchOwners.set(stub.id, entry.fetchOwnerSeatIndex);
      }
    }
  }

  if (scenario.deckTop) {
    // Pull a match from anywhere and push it onto the END of the draw pile. `pop()` is
    // what `versusDraw` calls to draw from the top, so the last array entry is the top.
    const card = pullCardAnywhere(game, scenario.deckTop);
    if (card) game.drawPile.push(card);
  }

  if (scenario.activeSeatIndex !== undefined) {
    // setActiveSeat updates the engine field AND emits a versusTurnChanged event so
    // any Vue ref that mirrors active seat (useGame.activeSeatIndex) re-syncs. Direct
    // field assignment wouldn't fire the event and the UI's "whose pill is highlighted"
    // would stay on the last turn-change.
    const setActive = (game as unknown as {
      setActiveSeat: (idx: number, viaChain: boolean) => void;
    }).setActiveSeat;
    setActive.call(game, scenario.activeSeatIndex, false);
  }

  if (scenario.opened !== undefined) {
    g.opened = scenario.opened;
  }

  if (scenario.chainSourceSeatIndex !== undefined) {
    g.chainSourceSeatIndex = scenario.chainSourceSeatIndex;
  }

  if (scenario.restartBeatSelectionFromSeat !== undefined) {
    // Re-init beat selection with the specified seat as the first picker. Emit
    // the picker-changed event so useGame's `currentBeatPickerSeat` ref re-syncs
    // (otherwise the BeatPickerOverlay would stay on whoever was picking before).
    // `emit` and `beatPickOrder` are private on Game; cast pattern matches the
    // other internals here.
    const gPrivate = game as unknown as {
      emit: (e: import('@/game/types').GameEvent) => void;
      beatPickOrder: number[];
    };
    game.initBeatSelection(scenario.restartBeatSelectionFromSeat, game.players.length);
    gPrivate.emit({
      kind: 'versusBeatPickerChanged',
      seatIndex: gPrivate.beatPickOrder[0] ?? null,
    });
  }

  if (scenario.autoCompleteBeatSelection) {
    if (game.setupPhase === 'beat-selection') {
      game.autoCompleteBeatSelection();
      // setupPhase flipped to 'play' inside that call; useGame listens for
      // `versusSetupCompleted` (which claimBeat already fires on the final pick)
      // so the overlay clears organically.
    }
  }
}
