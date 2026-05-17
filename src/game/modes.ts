/**
 * Mode capabilities registry.
 *
 * Every game mode declares the features it supports. Engine/UI code branches on
 * capability flags instead of mode identity (`mode === 'versus'`), so adding a
 * new mode is a one-row addition to MODE_CAPS rather than a hunt-and-patch
 * exercise across the codebase.
 *
 * Capability flags describe ENGINE/UX BEHAVIOUR, not arbitrary feature toggles.
 * If two modes happen to share a UI element today but might diverge later, give
 * them separate flags — that's the whole point of this registry.
 */

import type { GameMode } from './types';

export interface ModeCapabilities {
  // -------- Mechanics --------
  /** Uses the turn-based action API (Game.submitVersusAction).
   *  Modes where this is false use Game.submitSoloAction instead. */
  isTurnBased: boolean;
  /** Has AI-controlled opponents that SimulationController must schedule ticks for. */
  hasAIOpponents: boolean;
  /** Time-attack scoring: wall-clock timer, +2s penalties, best-time persistence. */
  isTimeAttack: boolean;
  /** Deck composition + starting hand size are user-configurable (Settings → Playground deck). */
  hasCustomDeck: boolean;

  // -------- Layout --------
  /** Single-seat layout: one hand fanned at the bottom centre, no opponent pills. */
  isSingleSeat: boolean;
  /** Two physical Left/Right base piles at the table centre. */
  usesSoloBases: boolean;
  /** Prompt-stack piles rendered in front of every seat. */
  usesPromptStacks: boolean;
}

export const MODE_CAPS: Record<GameMode, ModeCapabilities> = {
  solo: {
    isTurnBased: false,
    hasAIOpponents: false,
    isTimeAttack: true,
    hasCustomDeck: false,
    isSingleSeat: true,
    usesSoloBases: true,
    usesPromptStacks: false,
  },
  versus: {
    isTurnBased: true,
    hasAIOpponents: true,
    isTimeAttack: false,
    hasCustomDeck: false,
    isSingleSeat: false,
    usesSoloBases: false,
    usesPromptStacks: true,
  },
  playground: {
    isTurnBased: true,
    hasAIOpponents: true,
    isTimeAttack: false,
    hasCustomDeck: true,
    isSingleSeat: false,
    usesSoloBases: false,
    usesPromptStacks: true,
  },
};

/** Convenience accessor. `modeCaps(this.mode).isTurnBased`, etc. */
export function modeCaps(mode: GameMode): ModeCapabilities {
  return MODE_CAPS[mode];
}
