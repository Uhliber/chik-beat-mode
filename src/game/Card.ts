import type { CardPrompt, ChantWord, BaseSide } from './types';

/**
 * Filename suffix used by the art set. Engine names follow the rulebook (`stop`, `fetch`);
 * the art set uses semantic aliases (`block` = Stop, `off-deck` = Fetch). Keep the engine
 * canonical and translate at the asset boundary.
 */
const PROMPT_TO_ART_SUFFIX: Record<CardPrompt, string> = {
  right: 'right',
  left: 'left',
  free: 'free',
  stop: 'block',
  snap: 'snap',
  fetch: 'off-deck',
};

export class Card {
  readonly id: string;
  readonly prompt: CardPrompt;
  readonly word: ChantWord;
  readonly isHaloHalo: boolean;

  constructor(params: { id: string; prompt: CardPrompt; word: ChantWord; isHaloHalo?: boolean }) {
    this.id = params.id;
    this.prompt = params.prompt;
    this.word = params.word;
    this.isHaloHalo = params.isHaloHalo ?? false;
  }

  /** Path of the front-face PNG under /public/cards/. */
  get assetPath(): string {
    if (this.isHaloHalo) return '/cards/halohalo-chik-free.png';
    const suffix = PROMPT_TO_ART_SUFFIX[this.prompt];
    return `/cards/${this.word}-${suffix}.png`;
  }

  /** True iff this card's chant word matches the current chant beat. */
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
