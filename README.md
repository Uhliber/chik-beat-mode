# Chik! Visual Simulation

Browser-based visual simulation of **Chik!** (the Filipino chant card game) — base game only, no expansions.

Stack: Vue 3 + TypeScript + Vite + Tailwind v4 + GSAP.

## Run

```bash
npm install
npm run dev
```

Then open the printed local URL (typically `http://localhost:5173`).

## Controls

- **Players** — 2 to 6 seats arranged radially around the table.
- **Failure** — chance per beat that the AI ties or miscalls (0% = perfect play).
- **Speed** — 0.25× to 4× simulation speed.
- **Start / Pause / Resume / Restart** — primary action button.
- **AI / YOU button** on each seat — take over that seat. Click your cards to slam.

## Project layout

```
src/
  game/                Pure TypeScript rules engine (no Vue)
    Card.ts            Card class
    Chant.ts           Chant order + step/reverse/loop
    Deck.ts            Build the 56-card deck + shuffle
    Player.ts          Player + hand
    Game.ts            Rules, base piles, penalty resolution, events
    SimulationController.ts  Real-time AI driver + speed/failure dials
    types.ts
  composables/
    useGame.ts         Wraps Game + SimulationController as Vue refs
    useSeatLayout.ts   Radial seat positioning
    useCardAnimation.ts GSAP slam + penalty flights
  components/          Vue components (GameTable, PlayerSeat, BasePile, …)
  styles/theme.css     Tailwind v4 theme tokens (sampled from the card art)
public/cards/          Card PNG faces + back
```

## Notes

- The deck/Game logic is fully decoupled from Vue, so you can run it in tests later.
- Card flip uses CSS `rotateY` + `backface-visibility`; tested on Chrome, Safari, Firefox.
- All animations use `transform` + `opacity` only — no layout thrash.
- Touch-friendly: `touch-action: manipulation`, large tap targets.

## What's not in v1 (yet)

- Sleeping / Boss expansions (assets exist, code path open)
- Sound
- Networked multiplayer
- Replay / share
