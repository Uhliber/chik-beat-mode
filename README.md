# Chik! Visual Simulation

Browser-based digital simulation of **Chik!** — the Filipino chant card game by Halohalo Games. Tracks the v1.2 rulebook (Chant Trigger + counts + beat ownership).

Stack: Vue 3 + TypeScript + Vite + Tailwind v4 + GSAP + Capacitor (for native packaging + persisted prefs).

Marketing companion: [chik.halohalogames.com](https://chik.halohalogames.com) — the welcome card on the main menu links to it. This app is a simulation; the physical game is the real thing.

## Run

```bash
npm install
npm run dev
```

Opens on `http://localhost:5173`.

## Modes

- **Versus AI** — primary mode. 3-6 seats around the table; AI opponents with adjustable skill (Easy / Normal / Hard / Master). Solo or playground modes share most of the engine but with different setups.
- **Solo · Time Attack** — single-player race to empty the deck + your hand. Combo streak bonuses, Chant Chik closer bonuses, persisted best time + top combo.
- **Playground** (feature-flagged) — Versus with deck-composition + hand-size knobs. Off by default.

Each player-vs-AI mode opens with a beat-claim phase (v1.2): every seat claims one of the six chant beats. Owning a beat matters when the Chant Trigger fires.

## v1.2 mechanics at a glance

- **Counts** — every card carries a value 0-10, shown in a circular badge beside the active prompt. Dormant most of the round; matter when a Chant Trigger fires.
- **Chant Chik variant** — 8 of the 16 Chik cards are Chant Chiks (darker background). Identical to a regular Chik *except* when played as the closing Chik of a full Wally→Riki cycle.
- **Chant Trigger** — closing a chant with a Chant Chik fires the trigger: sum every player's active prompt count, recite the chant clockwise from the receiver one beat per count, and whichever beat the recital lands on, that beat's owner wins the Chant Power.
- **Chant Power** — winner gives up to 3 cards from their hand to opponents. Emptying their own hand by giving away is an instant win.

## Tutorial

First time entering Versus AI or Solo prompts a "Start tutorial / Skip for now" offer. Solo tutorial is 11 steps with a scripted auto-play segment; Versus tutorial is 16 steps and culminates in a real Chant Trigger that mathematically lands on the player's claimed beat. Tutorial completion persists per mode; the prompt only fires before completion.

## Project layout

```
src/
  game/                      Pure TypeScript rules engine (Vue-free)
    Card.ts / Chant.ts / Deck.ts / Player.ts / Game.ts
    SimulationController.ts  Real-time AI driver
    modes.ts                 Mode capability registry
    types.ts
  composables/
    useGame.ts               Wraps Game + Controller as Vue refs; pref load/save
    useTutorial.ts           Tutorial state machine + spotlight resolver
    useBeatAudio.ts          Web Audio synth + Capacitor haptics
    useInlineSvg.ts          SVG load + recolor via currentColor
    useSeatLayout.ts         Radial seat positioning
    useCardAnimation.ts      GSAP slam + penalty + chant-power flights
    useResponsive.ts
    userPreferences.ts       Capacitor Preferences keys + load/save helpers
  tutorial/
    steps.ts                 SOLO_STEPS + VERSUS_STEPS + matcher + canonical
    scenarios.ts             applySoloScenario / applyVersusScenario
    persistence.ts           Tutorial-completion prefs
  components/                Vue components (GameTable, PlayerSeat, ChantTriggerOverlay, ChantPowerModal, …)
  views/
    MainMenu.vue             Welcome card + mode buttons + tutorial offer
    PlayView.vue
    SettingsView.vue
  config/flags.ts            Env-driven feature flags
  dev/resetStorage.ts        DevTools `chikReset` command (env-gated)
  styles/theme.css           Tailwind v4 theme tokens (sampled from card art)
public/new/                  v1.2 card art + prompt + count SVGs
public/cards/                Legacy card faces + back
```

The engine (`src/game/`) has zero Vue dependencies; full vitest coverage. UI changes don't touch rules.

## Developer commands

Open the browser DevTools console while the app is running:

- `chikReset()` — wipe all persisted state (tutorial completion, best time, top combo, settings, Playground config).
- `chikReset('settings')` — wipe only display + gameplay prefs (best time stays).
- `chikReset('tutorial')` — wipe only the tutorial-completion flags. Use when iterating on the tutorial flow.

The command is gated by the `VITE_DEVTOOL_COMMANDS_ENABLED` flag (default ON in dev, OFF in production) so prod builds don't expose it on `window`. Key lists are sourced from `PREF_KEYS` / `TUTORIAL_PREF_KEYS` so adding a new pref auto-gets reset coverage.

A one-line hint logs on app startup when the command is installed.

## Keyboard shortcuts (desktop)

- **D** — draw from the deck (same as clicking it). When the deck is empty in Versus, pressing D passes the turn. Toggle off in *Settings → Display → Draw shortcut (D)*.

Mobile hides the shortcut row + guide hint entirely.

## Feature flags

Build-time flags live in `.env.local` (gitignored) and are read at startup via Vite. Copy `.env.example` as a starting point.

| Flag | Default | Effect |
|---|---|---|
| `VITE_PLAYGROUND_ENABLED` | `false` | Surfaces the Playground entry on the main menu. Stale `?mode=playground` URLs coerce to Versus when off. |
| `VITE_DEVTOOL_COMMANDS_ENABLED` | dev: `true`, prod: `false` | Installs `window.chikReset()` on app boot. Override either way to suit your env. |

## Tests

```bash
npm test              # vitest (engine + tutorial + utils)
npm run typecheck     # vue-tsc --noEmit
```

Tutorial tests cover canonical-action matchers per step + a full walk-through that exercises the orchestrated Chant Trigger end-to-end.

## What's not in v1 (yet)

- Sleeping / Boss expansions (assets exist, code path open)
- Networked multiplayer
- Replay / share
