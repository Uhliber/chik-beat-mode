import type { CardPrompt, ChantWord, BaseSide } from './types';

/**
 * v1.1+: every card carries a numeric `count` (0–10) used only when the Chant Trigger
 * fires. v1.1 also introduced the Chant Chik variant (`isChantChik = true`) — visually
 * a Chik card, but when it CLOSES a chant sequence it fires the trigger. The Halo-Halo
 * Chik is a regular Free Chik with count 5 — it never has isChantChik.
 *
 * Art set: the v1.1 art under `/new/` encodes count + chant-chik distinction directly in
 * the filename, e.g. `right-chik-4.png`, `right-chant-chik-6.png`, `fetch-riki-7.png`.
 * The Halo-Halo uses a unique filename: `free-chik-halohalo-5.png`.
 */
export class Card {
  readonly id: string;
  readonly prompt: CardPrompt;
  readonly word: ChantWord;
  readonly isHaloHalo: boolean;
  readonly isChantChik: boolean;
  readonly count: number;

  constructor(params: { id: string; prompt: CardPrompt; word: ChantWord; isHaloHalo?: boolean; isChantChik?: boolean; count?: number }) {
    this.id = params.id;
    this.prompt = params.prompt;
    this.word = params.word;
    this.isHaloHalo = params.isHaloHalo ?? false;
    this.isChantChik = params.isChantChik ?? false;
    this.count = params.count ?? 0;
  }

  /** Path of the front-face PNG under /public/new/. */
  get assetPath(): string {
    if (this.isHaloHalo) return '/new/free-chik-halohalo-5.png';
    const wordPart = this.isChantChik ? 'chant-chik' : this.word;
    return `/new/${this.prompt}-${wordPart}-${this.count}.png`;
  }

  /** True iff this card's chant word matches the current chant beat. Chant Chik cards
   *  still match the Chik beat — they're a variant of Chik, not a separate word. */
  matchesBeat(beat: ChantWord): boolean {
    return this.word === beat;
  }

  /** Solo-only: which physical bases this card may be slammed onto. */
  legalSoloBases(): BaseSide[] {
    if (this.prompt === 'left') return ['left'];
    if (this.prompt === 'right') return ['right'];
    return ['left', 'right'];
  }
}
