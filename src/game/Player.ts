import type { Card } from './Card';
import type { ChantWord, PlayerId } from './types';
import { CHANT_ORDER } from './types';

export class Player {
  readonly id: PlayerId;
  readonly seatIndex: number;
  hand: Card[] = [];
  ownedBaseWord: ChantWord | null = null;
  isAI: boolean = true;

  constructor(id: PlayerId, seatIndex: number) {
    this.id = id;
    this.seatIndex = seatIndex;
  }

  /** Sort hand in chant order so the AI / player can find the next play fast. */
  sortHand(): void {
    this.hand.sort((a, b) => {
      const ai = CHANT_ORDER.indexOf(a.word);
      const bi = CHANT_ORDER.indexOf(b.word);
      if (ai !== bi) return ai - bi;
      // Specials sort after standard within the same word
      const akind = a.kind === 'standard' && !a.isHaloHalo ? 0 : 1;
      const bkind = b.kind === 'standard' && !b.isHaloHalo ? 0 : 1;
      return akind - bkind;
    });
  }

  hasCardForBeat(beat: ChantWord): Card | null {
    return this.hand.find((c) => c.matchesBeat(beat)) ?? null;
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
