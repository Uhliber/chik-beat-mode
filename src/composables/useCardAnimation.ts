import { gsap } from 'gsap';

/**
 * The flight clone is always rendered at a fixed PORTRAIT size, regardless of how
 * the source/destination elements are visually rotated. This keeps the card art's
 * aspect ratio correct even when slamming onto a base in a rotated seat.
 */
const FLIGHT_CARD_W = 64;
const FLIGHT_CARD_H = Math.round(FLIGHT_CARD_W * 1.4); // 5:7 portrait ratio

export interface SlamFlightParams {
  cardId: string;
  fromEl: HTMLElement;
  toEl: HTMLElement;
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

/** Build a portrait flight card stage in <body>. Returns { stage, inner }. */
function buildStage(faceUrl: string, backUrl: string, startCx: number, startCy: number) {
  const stage = document.createElement('div');
  stage.style.cssText = `
    position: fixed;
    left: ${startCx - FLIGHT_CARD_W / 2}px;
    top: ${startCy - FLIGHT_CARD_H / 2}px;
    width: ${FLIGHT_CARD_W}px;
    height: ${FLIGHT_CARD_H}px;
    z-index: 9999;
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
 * Fly a card from source to target, kept portrait throughout, with a back→face flip mid-flight.
 */
export function flyCardSlam({ fromEl, toEl, faceUrl, backUrl, speed, onComplete }: SlamFlightParams): void {
  const from = center(fromEl);
  const to = center(toEl);

  const { stage, inner } = buildStage(faceUrl, backUrl, from.cx, from.cy);

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const dur = 0.55 / Math.max(0.1, speed);

  const tl = gsap.timeline({
    onComplete: () => {
      stage.remove();
      onComplete?.();
    },
  });
  // Arc: rise then fall.
  tl.to(stage, { x: dx, y: dy - 60, duration: dur * 0.55, ease: 'power2.out' }, 0);
  tl.to(stage, { y: dy, duration: dur * 0.45, ease: 'power2.in' }, dur * 0.55);
  // Mid-flight flip from back to face.
  tl.to(inner, { rotateY: 180, duration: dur * 0.85, ease: 'power1.inOut' }, dur * 0.05);
  // Impact squash.
  tl.to(stage, { scale: 0.95, duration: 0.06, yoyo: true, repeat: 1, ease: 'power2.out' }, dur);
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
