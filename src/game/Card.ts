import type { CardKind, ChantWord } from './types';

export class Card {
  readonly id: string;
  readonly kind: CardKind;
  readonly word: ChantWord;
  readonly isHaloHalo: boolean;

  constructor(params: { id: string; kind: CardKind; word: ChantWord; isHaloHalo?: boolean }) {
    this.id = params.id;
    this.kind = params.kind;
    this.word = params.word;
    this.isHaloHalo = params.isHaloHalo ?? false;
  }

  /** Path of the front-face PNG under /public/cards/. */
  get assetPath(): string {
    if (this.isHaloHalo) return '/cards/halohalo-chik.png';
    switch (this.kind) {
      case 'standard':  return `/cards/${this.word}.png`;
      case 'reverse':   return `/cards/${this.word}-reverse.png`;
      case 'decoy':     return `/cards/${this.word}-decoy.png`;
      case 'halo-halo': return '/cards/halohalo-chik.png';
    }
  }

  /** Whether this card can be slammed on a base of the given slot. */
  canBeSlammedOn(slot: ChantWord | 'main'): boolean {
    if (this.kind === 'decoy') return true;
    return slot === this.word || slot === 'main';
  }

  /** True for any chant card whose value matches the required word. */
  matchesBeat(beat: ChantWord): boolean {
    return this.word === beat;
  }

  /** A standard card or a Reverse / Decoy / Halo-Halo of the same word all satisfy that word's beat. */
  isSpecial(): boolean {
    return this.kind !== 'standard' || this.isHaloHalo;
  }
}
