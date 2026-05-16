import { gsap } from 'gsap';

/**
 * The flight clone is always rendered at a fixed PORTRAIT size, regardless of how
 * the source/destination elements are visually rotated. This keeps the card art's
 * aspect ratio correct even when slamming onto a base in a rotated seat.
 */
const FLIGHT_CARD_W = 80;
const FLIGHT_CARD_H = Math.round(FLIGHT_CARD_W * 1.4); // 5:7 portrait ratio

export interface SlamFlightParams {
  cardId: string;
  fromEl: HTMLElement;
  toEl: HTMLElement;
  /** Optional pre-captured rects — wins over fromEl/toEl when provided. Use these when the
   *  source element will re-layout (e.g. hand-fan re-centres) before the animation starts. */
  fromRect?: DOMRect;
  toRect?: DOMRect;
  faceUrl: string;
  backUrl: string;
  /** 1 = full speed; multiplier applied to all durations */
  speed: number;
  onComplete?: () => void;
}

/** Center coords of an element's AABB. */
function center(el: HTMLElement): { cx: number; cy: number } {
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function rectCenter(r: DOMRect): { cx: number; cy: number } {
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/**
 * z-index 150 keeps in-flight cards ABOVE table content (seats up to z-35, confetti, etc.)
 * but BELOW modal/sheet overlays (z-200+) so opening the Event Log or Controls sheet
 * mid-simulation never shows a card flying across the modal.
 */
const FLIGHT_Z = 150;

/** Build a portrait flight card stage in <body>. Returns { stage, inner }. */
function buildStage(faceUrl: string, backUrl: string, startCx: number, startCy: number) {
  const stage = document.createElement('div');
  stage.style.cssText = `
    position: fixed;
    left: ${startCx - FLIGHT_CARD_W / 2}px;
    top: ${startCy - FLIGHT_CARD_H / 2}px;
    width: ${FLIGHT_CARD_W}px;
    height: ${FLIGHT_CARD_H}px;
    z-index: ${FLIGHT_Z};
    pointer-events: none;
    perspective: 1000px;
    will-change: transform;
  `;
  const inner = document.createElement('div');
  inner.style.cssText = `
    position: absolute;
    inset: 0;
    transform-style: preserve-3d;
    will-change: transform;
  `;
  const back = document.createElement('div');
  back.style.cssText = `
    position: absolute;
    inset: 0;
    background-image: url('${backUrl}');
    background-size: cover;
    background-position: center;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
  `;
  const face = document.createElement('div');
  face.style.cssText = `
    position: absolute;
    inset: 0;
    background-image: url('${faceUrl}');
    background-size: cover;
    background-position: center;
    border-radius: 8px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.25);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transform: rotateY(180deg);
  `;
  inner.appendChild(back);
  inner.appendChild(face);
  stage.appendChild(inner);
  document.body.appendChild(stage);
  return { stage, inner };
}

/**
 * Fly a card from source to target. Larger clone + slower arc + bigger apex than the
 * v0.7 default — v1.0 has more cross-table travel and the prior 0.55s/64px clone was
 * easy to miss against a busy table.
 *
 * Optional `fromRect`/`toRect` let callers pin the geometry at event-emission time so
 * a mid-frame DOM re-layout (hand fan re-centres as a card is removed) doesn't shift
 * the flight's start/end after the fact.
 */
export function flyCardSlam({ fromEl, toEl, fromRect, toRect, faceUrl, backUrl, speed, onComplete }: SlamFlightParams): void {
  const from = fromRect ? rectCenter(fromRect) : center(fromEl);
  const to = toRect ? rectCenter(toRect) : center(toEl);

  const { stage, inner } = buildStage(faceUrl, backUrl, from.cx, from.cy);

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dur = 0.75 / Math.max(0.1, speed);

  const tl = gsap.timeline({
    onComplete: () => {
      stage.remove();
      onComplete?.();
    },
  });
  // Arc: rise (with a slight "throw" tilt) then fall (un-tilt).
  tl.to(stage, { x: dx, y: dy - 110, rotate: -8, duration: dur * 0.55, ease: 'power2.out' }, 0);
  tl.to(stage, { y: dy, rotate: 0, duration: dur * 0.45, ease: 'power2.in' }, dur * 0.55);
  // Mid-flight flip from back to face.
  tl.to(inner, { rotateY: 180, duration: dur * 0.85, ease: 'power1.inOut' }, dur * 0.05);
  // Impact squash.
  tl.to(stage, { scale: 0.94, duration: 0.07, yoyo: true, repeat: 1, ease: 'power2.out' }, dur);
}

export interface PenaltyFlightParams {
  fromEl: HTMLElement;
  toEl: HTMLElement;
  faceUrl: string;
  backUrl: string;
  speed: number;
  onComplete?: () => void;
}

/** Card from a base back into a player's hand (penalty). Stays portrait, flips face → back. */
export function flyCardPenalty({ fromEl, toEl, faceUrl, backUrl, speed, onComplete }: PenaltyFlightParams): void {
  const from = center(fromEl);
  const to = center(toEl);

  const { stage, inner } = buildStage(faceUrl, backUrl, from.cx, from.cy);
  // Start face-up (rotate 180) since the card is leaving a face-up pile.
  inner.style.transform = 'rotateY(180deg)';

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dur = 0.6 / Math.max(0.1, speed);

  const tl = gsap.timeline({
    onComplete: () => {
      stage.remove();
      onComplete?.();
    },
  });
  tl.to(stage, { x: dx, y: dy, duration: dur, ease: 'power2.inOut' }, 0);
  tl.to(inner, { rotateY: 0, duration: dur * 0.8, ease: 'power1.inOut' }, 0);
}

export interface DrawFlightParams {
  fromEl: HTMLElement;
  toEl: HTMLElement;
  fromRect?: DOMRect;
  toRect?: DOMRect;
  /** Face art shown if revealFace=true (human's own draw). For AI/Fetch this is unused. */
  faceUrl?: string;
  backUrl: string;
  speed: number;
  /** True when the drawer should see what they drew — flips back→face mid-flight.
   *  False for AI draws and for Fetch-from-hand (peek would spoil opponent's hand). */
  revealFace?: boolean;
  onComplete?: () => void;
}

/**
 * Deck → recipient seat. Lighter than a slam: flat curve, no apex, no impact squash.
 * Stays back-up unless `revealFace` (the human's own pile draw) which flips to face
 * mid-flight so the player sees what they pulled.
 */
export function flyCardDraw({ fromEl, toEl, fromRect, toRect, faceUrl, backUrl, speed, revealFace, onComplete }: DrawFlightParams): void {
  const from = fromRect ? rectCenter(fromRect) : center(fromEl);
  const to = toRect ? rectCenter(toRect) : center(toEl);
  const { stage, inner } = buildStage(faceUrl ?? backUrl, backUrl, from.cx, from.cy);

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dur = 0.45 / Math.max(0.1, speed);

  const tl = gsap.timeline({
    onComplete: () => {
      stage.remove();
      onComplete?.();
    },
  });
  tl.to(stage, { x: dx, y: dy, duration: dur, ease: 'power2.inOut' }, 0);
  if (revealFace && faceUrl) {
    tl.to(inner, { rotateY: 180, duration: dur * 0.7, ease: 'power1.inOut' }, dur * 0.15);
  }
}

/**
 * Solo-mode wrong-card feedback: tug the card a third of the way toward the target,
 * shake briefly, then pull back to its resting place. Animates the actual mounted card
 * element in place (no portal) since the card stays in the halo. Call cleanup() to
 * snap back if the card unmounts (e.g. game restart) mid-animation.
 */
export function bounceBackInPlace(el: HTMLElement, towardEl: HTMLElement, speed: number): () => void {
  const from = center(el);
  const to = center(towardEl);
  const dx = (to.cx - from.cx) * 0.3;
  const dy = (to.cy - from.cy) * 0.3;
  const dur = 0.55 / Math.max(0.1, speed);
  const tl = gsap.timeline();
  tl.to(el, { x: dx, y: dy, duration: dur * 0.32, ease: 'power2.out' }, 0);
  tl.to(el, { x: dx + 6, duration: 0.05, ease: 'none' }, dur * 0.32);
  tl.to(el, { x: dx - 6, duration: 0.06, yoyo: true, repeat: 3, ease: 'none' }, '>');
  tl.to(el, { x: 0, y: 0, duration: dur * 0.45, ease: 'power2.inOut' }, '>');
  return () => { tl.kill(); gsap.set(el, { x: 0, y: 0 }); };
}
