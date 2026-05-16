import type { Card } from './Card';
import type { CardPrompt, ChantWord, PlayerId } from './types';
import { CHANT_ORDER, CARD_PROMPTS } from './types';

export class Player {
  readonly id: PlayerId;
  readonly seatIndex: number;
  hand: Card[] = [];
  /**
   * Versus only — cards played in front of this player. Older cards stay stacked underneath
   * but are inert; only the top card acts as the active prompt.
   */
  promptStack: Card[] = [];
  isAI: boolean = true;

  constructor(id: PlayerId, seatIndex: number) {
    this.id = id;
    this.seatIndex = seatIndex;
  }

  /** Sort hand in chant order, then by prompt order within each word. */
  sortHand(): void {
    this.hand.sort((a, b) => {
      const ai = CHANT_ORDER.indexOf(a.word);
      const bi = CHANT_ORDER.indexOf(b.word);
      if (ai !== bi) return ai - bi;
      const ap = CARD_PROMPTS.indexOf(a.prompt);
      const bp = CARD_PROMPTS.indexOf(b.prompt);
      return ap - bp;
    });
  }

  hasCardForBeat(beat: ChantWord): Card | null {
    return this.hand.find((c) => c.matchesBeat(beat)) ?? null;
  }

  /** Versus only — the card currently sitting face-up in front of this player. */
  get topPrompt(): Card | null {
    return this.promptStack.length > 0 ? this.promptStack[this.promptStack.length - 1] : null;
  }

  /** Versus only — what prompt is currently dictating this player's next play. */
  get effectivePrompt(): CardPrompt | null {
    return this.topPrompt?.prompt ?? null;
  }

  removeCard(cardId: string): Card | null {
    const idx = this.hand.findIndex((c) => c.id === cardId);
    if (idx === -1) return null;
    return this.hand.splice(idx, 1)[0];
  }

  addCard(card: Card): void {
    this.hand.push(card);
    this.sortHand();
  }

  get cardCount(): number {
    return this.hand.length;
  }
}
