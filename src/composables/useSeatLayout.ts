import { computed, type Ref } from 'vue';

export interface SeatPosition {
  /** 0..1 normalized position around the table */
  angle: number;
  /** CSS transform: translate(...) rotate(...) — applied to the seat container */
  transform: string;
  /** Rotation in degrees so cards/UI face the table center */
  rotation: number;
  /** Convenience: x/y offsets in CSS units (unitless multipliers, scaled by table size) */
  x: number;
  y: number;
}

/**
 * Compute radial positions for N seats around the table.
 * Seat 0 is placed at the bottom (closest to camera) so the human takeover seat is intuitive.
 *
 * @param count   number of seats (2..6)
 * @param radius  CSS distance from table center (px)
 */
export function useSeatLayout(count: Ref<number>, radius: Ref<number>) {
  const seats = computed<SeatPosition[]>(() => {
    const n = Math.max(2, Math.min(6, count.value));
    const out: SeatPosition[] = [];
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
