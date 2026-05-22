import { computed, type Ref } from 'vue';

export interface SeatPosition {
  /** 0..1 normalized position around the table */
  angle: number;
  /** CSS transform: translate(...) rotate(...), applied to the seat container */
  transform: string;
  /** Rotation in degrees so cards/UI face the table center */
  rotation: number;
  /** Convenience: x/y offsets in CSS units (unitless multipliers, scaled by table size) */
  x: number;
  y: number;
}

export type SeatLayoutMode = 'radial' | 'semicircle' | 'solo';

/**
 * Compute seat positions for N seats around the table.
 *
 *  - 'radial' (default, desktop): seats spread around a full circle. Seat 0 at the bottom,
 *    others CW. Used for the perspective-tilted desktop table.
 *  - 'semicircle' (mobile portrait): seat 0 (the human) sits at the BOTTOM. The remaining
 *    N-1 opponents arc across the UPPER semicircle so their owned bases can cluster around
 *    the central main base, and the slam wheel can naturally point at each opponent.
 *
 * @param count   number of seats (2..6)
 * @param radius  CSS distance from table center (px), same scale for both modes
 * @param mode    'radial' (full circle) or 'semicircle' (P1 bottom, opponents top arc)
 */
export function useSeatLayout(
  count: Ref<number>,
  radius: Ref<number>,
  mode: Ref<SeatLayoutMode> | SeatLayoutMode = 'radial',
) {
  const seats = computed<SeatPosition[]>(() => {
    const m = typeof mode === 'string' ? mode : mode.value;
    // SOLO: a single seat at dead centre. The hand renders as a circle around this anchor,
    // not via PlayerSeat, so all that matters is x = y = 0 and no rotation.
    if (m === 'solo') {
      return [{ angle: 0, x: 0, y: 0, rotation: 0, transform: 'translate(0px, 0px)' }];
    }
    const n = Math.max(2, Math.min(6, count.value));
    const out: SeatPosition[] = [];

    if (m === 'semicircle') {
      // Convention used here: φ measured from south (bottom), increasing clockwise.
      //   x = -R · sin(φ)
      //   y =  R · cos(φ)   (CSS y grows downward → +R = bottom, −R = top)
      // Seat 0 (P1) at φ = 0 (south). Opponents (1..N-1) span the top semicircle
      // [π/2, 3π/2] in even slices, so seat 1 is upper-LEFT and seat N-1 is upper-RIGHT.
      // Seats are NOT rotated, the player pill, owned base etc. all stay UPRIGHT on
      // mobile so they're always readable. Only the (x, y) position varies.
      const opponents = n - 1;
      for (let i = 0; i < n; i++) {
        let phi: number;
        if (i === 0) {
          phi = 0;
        } else if (opponents === 1) {
          phi = Math.PI;
        } else {
          phi = Math.PI / 2 + (i - 0.5) * (Math.PI / opponents);
        }
        const x = -radius.value * Math.sin(phi);
        const y = radius.value * Math.cos(phi);
        out.push({
          angle: i / n,
          x,
          y,
          rotation: 0,
          transform: `translate(${x}px, ${y}px)`,
        });
      }
      return out;
    }

    // ---- Radial (desktop) ----
    // φ = 0 → top of screen, increasing clockwise. We want seat 0 at the bottom.
    for (let i = 0; i < n; i++) {
      const phi = Math.PI + (i * 2 * Math.PI) / n; // bottom, then clockwise
      const x = Math.sin(phi) * radius.value;
      const y = -Math.cos(phi) * radius.value;
      // Rotate the seat so that its content's "up" (default screen-up) points toward the center.
      // That requires rotation = φ + π.
      const rotationDeg = (((phi + Math.PI) * 180) / Math.PI) % 360;
      out.push({
        angle: i / n,
        x,
        y,
        rotation: rotationDeg,
        transform: `translate(${x}px, ${y}px) rotate(${rotationDeg}deg)`,
      });
    }
    return out;
  });

  return { seats };
}
