/**
 * Tutorial step definitions for Solo and Versus modes.
 *
 * Each step is a pure data record describing:
 *   - copy (title + body) shown in the TutorialOverlay
 *   - icons (the SVG glyphs under assets/icons/) to render alongside the copy
 *   - spotlight target (data-tutorial-target selector) to highlight on the table
 *   - optional setup(), pins the engine state via applyScenario
 *   - optional demo(), scripted moves the controller plays itself (paused
 *     SimulationController, direct submitVersusAction calls)
 *   - optional expect, the player action the controller waits for before advancing
 *   - canSkipForward, true for pure-narrative steps (a "Next" button advances)
 *
 * The matcher resolver `matchExpect()` is exported for the controller. It runs
 * against engine `GameEvent`s emitted while the controller is in 'awaiting-input'
 * phase; the first match advances the tutorial.
 *
 * `canonicalActionFor()` produces the deterministic action that the Skip-step button
 * fires to satisfy a matcher, same submit API the player would use.
 */

import type { Game } from '@/game/Game';
import type { BaseSide, CardPrompt, ChantWord, GameEvent, SoloAction, VersusAction } from '@/game/types';
import { applySoloScenario, applyVersusScenario } from './scenarios';

export type SpotlightTarget =
  | { kind: 'selector'; value: string }
  | { kind: 'card-in-hand'; cardWord: ChantWord; cardPrompt?: CardPrompt; isHaloHalo?: boolean }
  | { kind: 'seat'; seatIndex: number }
  | { kind: 'deck' }
  | { kind: 'base'; side: BaseSide }
  /** Whichever Solo base currently holds the active prompt. Used by steps
   *  whose spotlight depends on a choice the player just made (e.g. Halo-Halo
   *  slammed on Left vs. Right). Resolver reads `game.soloActiveBaseSide`. */
  | { kind: 'active-solo-base' }
  /** Whichever Solo base is LEGAL for the NEXT slam. Derived from the active
   *  prompt's DIRECTION (Left → left, Right → right), not from where the active
   *  card sits, those can disagree when e.g. a Right-prompt card was slammed on
   *  the Left base (legal on a Free opener) and the next slam must therefore
   *  go to Right. For Free / null prompts, falls back to the active base. */
  | { kind: 'legal-solo-base' }
  | null;

export type TutorialIcon =
  | 'left'
  | 'right'
  | 'free'
  | 'stop'
  | 'snap'
  | 'deck-off'
  /** /new/prompt-fetch.svg, the Fetch prompt glyph. */
  | 'fetch'
  /** /new/count-5.svg, used to introduce the per-card count system. */
  | 'count'
  /** /new/free-chant-chik-5.png, sample Chant Chik card art. */
  | 'chant-chik';

export type ExpectMatcher =
  | { kind: 'playCard'; cardWord?: ChantWord; cardPrompt?: CardPrompt; isHaloHalo?: boolean; targetSeatIndex?: number; anyTarget?: boolean }
  | { kind: 'slamBase'; baseSide?: BaseSide; cardWord?: ChantWord }
  | { kind: 'draw' }
  | { kind: 'snapPlay'; targetSeatIndex?: number }
  /** Versus beat-selection: the player claimed a beat at setup. */
  | { kind: 'claimBeat'; beat?: ChantWord }
  /** Versus Chant Power: the player resolved their give-up-to-3 gift. */
  | { kind: 'chantPowerResolve' }
  | { kind: 'event'; predicate: (e: GameEvent) => boolean };

export interface TutorialStep {
  id: string;
  concept: string;
  copy: { title: string; body: string };
  icons?: TutorialIcon[];
  spotlight?: SpotlightTarget;
  /** Pin engine state before the step's copy is shown. */
  setup?: (game: Game) => void;
  /** Scripted AI / engine plays to demonstrate the concept. Controller awaits this. */
  demo?: (game: Game) => Promise<void>;
  /** Player action the controller waits for. Omit for pure-narrative steps. */
  expect?: ExpectMatcher;
  /** Hint shown if the player stalls > 8 seconds in awaiting-input. */
  hint?: string;
  /** True for pure-narrative steps, the Next button advances. */
  canSkipForward?: boolean;
  /** When true, this step relies on engine state built up by earlier steps in
   *  the same tutorial run (e.g. cards drawn into hand, prompts on bases). The
   *  isolation test skips it because a fresh game can't reproduce that state
   *  without re-seeding, which would contradict the "hand persists end-to-end"
   *  design. The full-walk-through test still validates the step in sequence. */
  requiresCascadeState?: boolean;
}

// --------------------------------------------------------------------------------------
// Solo tutorial, 11 steps, ~3 minutes
//
// Design: the player gets a FIXED hand at step 1 and that hand evolves naturally
// through the whole tutorial, no mid-walk-through hand replacements. The deck is
// also pre-seeded so each forced draw produces a predictable card. The scripted
// flow:
//
//   Hand at start: Halo-Halo, Wally-Left, Wally-Right, Hindo-Right, Tambo-Free
//   Deck (next draws): Free-Pop, Left-Riki, Free-Chant-Chik
//
//   Step 2, slam Halo-Halo on either base (beat: chik → wally)
//   Step 3, slam either Wally (beat: wally → hindo)
//   Step 4, slam the Hindo (beat: hindo → pop)
//   Step 5, no Pop in hand → draw (gets Free-Pop)
//   Step 6, slam the drawn Pop (beat: pop → tambo)
//   Step 7, demo: auto-slam Tambo, auto-draw Riki, auto-slam Riki, auto-draw
//            the Chant Chik (leaves it in hand, beat: chik [closing])
//   Step 8, slam the Chant Chik for the closing-Chik -1s bonus
//   Steps 9-11, narrative cleanup: penalties, combo, finish-the-deck goal.
//
// Every step's setup is idempotent (only pins state that's already there).
// The earlier "force activePrompt to Right" anti-pattern is gone.
// --------------------------------------------------------------------------------------

export const SOLO_STEPS: TutorialStep[] = [
  {
    id: 'solo-welcome',
    concept: 'Welcome & the chant',
    copy: {
      title: 'Welcome to Chik!',
      body:
        'Cards loop through a chant: Chik → Wally → Hindo → Pop → Tambo → Riki → Chik → and back. Each card you play must match the current beat. Empty your hand AND the deck as fast as you can.',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="chant-ticker"]' },
    setup: (game) => {
      // Single source-of-truth deal. Subsequent steps don't touch the hand or
      // the deck, they only pin the beat for defensive idempotency.
      applySoloScenario(game, {
        opened: false,
        beat: 'chik',
        hand: [
          { word: 'chik', prompt: 'free', isHaloHalo: true },
          { word: 'wally', prompt: 'left' },
          { word: 'wally', prompt: 'right' },
          { word: 'hindo', prompt: 'right' },
          { word: 'tambo', prompt: 'free' },
        ],
        // First draw will yield Free-Pop, second Left-Riki, third Free-Chant-Chik.
        deckTops: [
          { word: 'pop', prompt: 'free' },
          { word: 'riki', prompt: 'left' },
          { word: 'chik', prompt: 'free' },
        ],
      });
    },
    canSkipForward: true,
  },
  {
    id: 'solo-halo-halo',
    concept: 'Halo-Halo opens the game',
    copy: {
      title: 'Halo-Halo Chik opens the game',
      body:
        'Your special Halo-Halo Chik starts every game. Its prompt is Free, slam it on either base, Left or Right, to begin.',
    },
    icons: ['free'],
    spotlight: { kind: 'card-in-hand', cardWord: 'chik', isHaloHalo: true },
    expect: { kind: 'slamBase' },
  },
  {
    id: 'solo-prompt-explained',
    concept: 'The card you played is the Prompt',
    copy: {
      title: 'That card is now your Prompt',
      body:
        'The card you just slammed becomes the active Prompt. Because Halo-Halo is Free, your next card can land on either base. Slam either of your Wally cards on whichever side you like.',
    },
    icons: ['left', 'right', 'free'],
    setup: (game) => {
      applySoloScenario(game, { beat: 'wally' });
    },
    spotlight: { kind: 'card-in-hand', cardWord: 'wally' },
    expect: { kind: 'slamBase', cardWord: 'wally' },
    hint: 'Either Wally works, drag one onto Left or Right.',
    requiresCascadeState: true,
  },
  {
    id: 'solo-direction-follows-prompt',
    concept: 'Direction follows the prompt',
    copy: {
      title: 'Now the prompt has a direction',
      body:
        'Your Wally\'s direction is now in charge. Even though your Hindo card itself is a Right, you slam it on whichever base the Prompt requires, the BASE has to match the prompt, the card type doesn\'t.',
    },
    icons: ['right', 'left'],
    setup: (game) => {
      // Defensive: pin the beat only, hand and bases stay as the player left them.
      applySoloScenario(game, { beat: 'hindo' });
    },
    // Highlights the base the next slam must land on, derived from the
    // active prompt's DIRECTION, not where the active card sits.
    spotlight: { kind: 'legal-solo-base' },
    expect: { kind: 'slamBase', cardWord: 'hindo' },
    hint: 'Slam your Hindo on the highlighted base, the prompt direction picks the side.',
    requiresCascadeState: true,
  },
  {
    id: 'solo-draw',
    concept: 'Draw when the beat doesn\'t match your hand',
    copy: {
      title: 'No Pop? Draw from the deck',
      body:
        'The chant moved to Pop and you don\'t have one in hand. Click the deck (or press D on desktop) to draw, you\'ll get a card that matches the current beat.',
    },
    icons: ['deck-off'],
    setup: (game) => {
      applySoloScenario(game, { beat: 'pop' });
    },
    spotlight: { kind: 'deck' },
    expect: { kind: 'draw' },
    hint: 'Tap the deck pile in the centre.',
    requiresCascadeState: true,
  },
  {
    id: 'solo-play-drawn',
    concept: 'Play the card you drew',
    copy: {
      title: 'Now slam that Pop',
      body:
        'You drew a Free-Pop, Free can go on either base, but your active Prompt still dictates the side. Slam it on the highlighted base.',
    },
    icons: ['free'],
    spotlight: { kind: 'legal-solo-base' },
    expect: { kind: 'slamBase', cardWord: 'pop' },
    hint: 'Drag the Free-Pop onto the highlighted base.',
    requiresCascadeState: true,
  },
  {
    id: 'solo-autoplay-cascade',
    concept: 'Watch a Tambo / Riki sequence play out',
    copy: {
      title: 'Watch the next few turns',
      body:
        'Two more beats, two more draws. We\'ll auto-play your Tambo, then auto-draw and slam a Riki, leaving you with a special Chik card in hand. Watch the table.',
    },
    setup: (game) => {
      // Just pin the beat defensively. State carries from step 6.
      applySoloScenario(game, { beat: 'tambo' });
    },
    demo: async (game) => {
      const player = game.players[0];
      if (!player) return;

      // 1. Slam Free-Tambo on whichever base the active prompt allows.
      const tambo = player.hand.find((c) => c.word === 'tambo');
      if (tambo) {
        const legal = legalSoloSide(game);
        game.submitSoloAction({ type: 'slam', cardId: tambo.id, baseSide: legal });
        await delay(700);
      }

      // 2. Draw, should yield Left-Riki from the seeded deck top.
      game.submitSoloAction({ type: 'draw' });
      await delay(700);

      // 3. Slam the freshly-drawn Riki on whichever base is allowed.
      const riki = player.hand.find((c) => c.word === 'riki');
      if (riki) {
        const legal = legalSoloSide(game);
        game.submitSoloAction({ type: 'slam', cardId: riki.id, baseSide: legal });
        await delay(700);
      }

      // 4. Draw the Chant Chik, leave it in hand for the next step's slam.
      game.submitSoloAction({ type: 'draw' });
      await delay(500);
    },
    canSkipForward: true,
  },
  {
    id: 'solo-chant-chik-closer',
    concept: 'Close the chant with a Chant Chik for -1s',
    copy: {
      title: 'Closing Chik = bonus second',
      body:
        'The Free-Chik in your hand has a darker background, that\'s a Chant Chik. Slamming a Chant Chik to CLOSE a full chant (the Chik that comes right after a Riki) shaves -1s off your time. Slam it now.',
    },
    icons: ['chant-chik'],
    spotlight: { kind: 'card-in-hand', cardWord: 'chik' },
    expect: { kind: 'slamBase', cardWord: 'chik' },
    hint: 'Drag the dark-background Chik onto the base your prompt points to, closing the chant grants a -1s bonus.',
    requiresCascadeState: true,
  },
  {
    id: 'solo-penalties-bonuses',
    concept: 'Penalties and bonuses overview',
    copy: {
      title: 'How time moves',
      body:
        'Every mistake adds +2s: slamming on the wrong base, slamming a card whose word doesn\'t match the beat, or drawing when you already have a beat-matching card. Bonuses go the other way: -1s for each Chant Chik closer plus combo streak rewards (next).',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="solo-hud"]' },
    canSkipForward: true,
  },
  {
    id: 'solo-combo-bar',
    concept: 'Combo bar shaves time',
    copy: {
      title: 'Keep the combo going for big bonuses',
      body:
        'Every legal slam fills the Combo bar at the bottom. The longer you keep slamming without pausing or making mistakes, the more seconds you bank when the streak ends. Hesitating or taking a penalty breaks it.',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="combo-bar"]' },
    canSkipForward: true,
  },
  {
    id: 'solo-finish',
    concept: 'Finish the deck to end the game',
    copy: {
      title: 'You\'re ready',
      body:
        'Empty your hand AND the deck as fast as you can. Your time, your best, and your highest combo all show in the top HUD. Good luck!',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="solo-hud"]' },
    canSkipForward: true,
  },
];

/** Helper for the auto-play demo, returns whichever base side the engine will
 *  accept for the next slam, given the current active prompt. Falls back to
 *  the active card's seat (Free / null prompt cases). */
function legalSoloSide(game: Game): BaseSide {
  const internals = game as unknown as {
    soloActivePrompt: CardPrompt | null;
    soloActiveBaseSide: BaseSide | null;
  };
  if (internals.soloActivePrompt === 'left') return 'left';
  if (internals.soloActivePrompt === 'right') return 'right';
  return internals.soloActiveBaseSide ?? 'left';
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --------------------------------------------------------------------------------------
// Versus tutorial, 10 steps, ~3 minutes
// --------------------------------------------------------------------------------------

/** Convenience: chronological 4-player setup. seat 0 = human, 1 = "Lefty",
 *  2 = "Across", 3 = "Righty" (in the human's frame of reference per the v1.1
 *  CCW-right convention). */
const SEAT_HUMAN = 0;
const SEAT_LEFTY = 1;
const SEAT_ACROSS = 2;
const SEAT_RIGHTY = 3;

export const VERSUS_STEPS: TutorialStep[] = [
  {
    id: 'versus-table',
    concept: 'The table',
    copy: {
      title: 'Four seats. One winner.',
      body:
        'You\'re P1 at the bottom. Lefty is to your left, Across is opposite, Righty is to your right. First to empty their hand wins.',
    },
    setup: (game) => {
      // ONE-TIME deal. Every opponent is seeded with a Wally card whose prompt lets
      // them target the human directly (P2/Lefty has Right-Wally, their right is the
      // human; P3/Across has Free-Wally, any target; P4/Righty has Left-Wally, their
      // left is the human). So whoever the player chooses for Halo-Halo in step 2 can
      // organically play their Wally on the human in step 3's demo. No subsequent step
      // alters hands; AI plays come from these real cards.
      applyVersusScenario(game, {
        opened: false,
        beat: 'chik',
        activeSeatIndex: SEAT_HUMAN,
        hands: {
          [SEAT_HUMAN]: [
            { word: 'chik', prompt: 'free', isHaloHalo: true },
            { word: 'hindo', prompt: 'free' },
            { word: 'pop', prompt: 'free' },
            { word: 'tambo', prompt: 'free' },
            { word: 'chik', prompt: 'free' },
          ],
          // Each opponent gets a Wally card whose prompt naturally targets the human +
          // a couple of filler cards so a single demo play doesn't empty their hand and
          // trigger an unintended win.
          [SEAT_LEFTY]: [
            { word: 'wally', prompt: 'right' },
            { word: 'tambo', prompt: 'free' },
            { word: 'riki', prompt: 'free' },
          ],
          [SEAT_ACROSS]: [
            { word: 'wally', prompt: 'free' },
            { word: 'tambo', prompt: 'left' },
            { word: 'riki', prompt: 'right' },
          ],
          [SEAT_RIGHTY]: [
            { word: 'wally', prompt: 'left' },
            { word: 'tambo', prompt: 'right' },
            { word: 'riki', prompt: 'left' },
          ],
        },
      });
    },
    canSkipForward: true,
  },
  {
    id: 'versus-chant',
    concept: 'The chant',
    copy: {
      title: 'Follow the chant',
      body:
        'Cards loop through a chant: Chik → Wally → Hindo → Pop → Tambo → Riki → Chik → and back. The ticker shows the current beat in the middle, what was played, and what\'s next. Every card you play must match the current beat.',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="chant-ticker"]' },
    canSkipForward: true,
  },
  {
    // v1.2 setup phase, every seat claims one of the six chant beats before
    // play begins. Owning a beat wins the Chant Power if a Chant Trigger ever
    // lands on it. The Halo-Halo holder always picks first, which is the human
    // in this tutorial (we re-seed Halo-Halo to seat 0 in step 1).
    id: 'versus-beat-claim',
    concept: 'Claim a beat at setup',
    copy: {
      title: 'Claim a chant beat',
      body:
        'Before play begins, every seat claims one of the six chant beats. The Halo-Halo holder picks first, that\'s you. Owning a beat earns you the Chant Power if the chant later lands on it (more on that soon). Pick any beat from the overlay.',
    },
    setup: (game) => {
      // Restart beat-selection so seat 0 (the human, now holding Halo-Halo
      // after step 1's re-seed) is the first picker. Without this, the random
      // initial Halo-Halo holder still leads the order and the player can't
      // claim from the UI.
      applyVersusScenario(game, {
        restartBeatSelectionFromSeat: SEAT_HUMAN,
      });
    },
    expect: { kind: 'claimBeat' },
    hint: 'Tap any glowing beat card in the centre overlay.',
  },
  {
    id: 'versus-halo-halo',
    concept: 'Halo-Halo opens',
    copy: {
      title: 'Play Halo-Halo on any opponent',
      body:
        'The Halo-Halo Chik opens the game. Drag it onto any opponent, the card you play lands in FRONT of them as their next prompt.',
    },
    icons: ['free'],
    setup: (game) => {
      // Auto-complete the rest of the beat picks (controller is paused during
      // the tutorial so AI seats would otherwise stall). Once setupPhase flips
      // to 'play', the BeatPickerOverlay clears and play can begin.
      applyVersusScenario(game, { autoCompleteBeatSelection: true });
      // Minimal cold-start guard: if the human's hand somehow doesn't contain
      // Halo-Halo (e.g. the tutorial was opened to this step directly via a debug
      // path), re-seed enough state for the matcher to find it. In the normal walk
      // through this is idempotent, step 1 already seeded the same cards.
      if (!game.players[0]?.hand.some((c) => c.isHaloHalo)) {
        applyVersusScenario(game, {
          opened: false,
          beat: 'chik',
          activeSeatIndex: SEAT_HUMAN,
          hands: {
            [SEAT_HUMAN]: [
              { word: 'chik', prompt: 'free', isHaloHalo: true },
              { word: 'hindo', prompt: 'free' },
            ],
            [SEAT_LEFTY]: [{ word: 'wally', prompt: 'right' }, { word: 'tambo', prompt: 'free' }],
            [SEAT_ACROSS]: [{ word: 'wally', prompt: 'free' }, { word: 'tambo', prompt: 'left' }],
            [SEAT_RIGHTY]: [{ word: 'wally', prompt: 'left' }, { word: 'tambo', prompt: 'right' }],
          },
        });
      }
    },
    spotlight: { kind: 'card-in-hand', cardWord: 'chik', isHaloHalo: true },
    expect: { kind: 'playCard', isHaloHalo: true, anyTarget: true },
  },
  {
    id: 'versus-prompt-dictates',
    concept: "Prompts dictate the recipient's direction",
    copy: {
      title: 'A prompt tells the recipient where to play next',
      body:
        'Watch, the opponent you handed Halo-Halo to now has a Free prompt. They play a Wally card on YOU, so the next prompt, and the next play, comes back to you.',
    },
    icons: ['left'],
    setup: (game) => {
      // DYNAMIC: find whoever the player handed Halo-Halo to in step 2 and make them
      // active. Don't touch hands or promptStacks, Halo-Halo is already in front of
      // them from the real play.
      const haloSeat = game.players.findIndex((p) =>
        p.promptStack.length > 0 && p.promptStack[p.promptStack.length - 1].isHaloHalo,
      );
      if (haloSeat < 0) return;
      applyVersusScenario(game, { activeSeatIndex: haloSeat });
    },
    demo: async (game) => {
      // Recipient plays their pre-seeded Wally card on the human. Each opponent's card
      // is wired so its prompt direction reaches seat 0: P2=Right-Wally (right neighbor),
      // P3=Free-Wally (any), P4=Left-Wally (left neighbor). This is a REAL play through
      // the engine, promptStack on the human updates from the actual event, not a pin.
      const active = game.players[game.activeSeatIndex];
      if (!active) return;
      const beat = game.chant.current;
      const candidates = active.hand.filter((c) => c.matchesBeat(beat));
      let chosen = candidates.find((c) =>
        game.legalTargetSeats(active.seatIndex, c).includes(SEAT_HUMAN),
      );
      if (!chosen) chosen = candidates[0];
      if (!chosen) return;
      const legal = game.legalTargetSeats(active.seatIndex, chosen);
      const target = legal.includes(SEAT_HUMAN) ? SEAT_HUMAN : legal[0];
      if (target === undefined) return;
      game.submitVersusAction(active.id, {
        type: 'play',
        cardId: chosen.id,
        targetSeatIndex: target,
      });
      await new Promise((r) => setTimeout(r, 800));
    },
    spotlight: { kind: 'seat', seatIndex: SEAT_HUMAN },
    canSkipForward: true,
  },
  {
    id: 'versus-your-prompt',
    concept: 'YOUR prompt dictates targets',
    copy: {
      title: 'Your prompt is now active',
      body:
        'You just received a prompt. Your next card has to land on a seat your prompt allows. Drag any Hindo onto a legal opponent, the wheel will only let you slam on legal seats.',
    },
    icons: ['left', 'right', 'free'],
    setup: (game) => {
      // ORGANIC: the human's hand and prompt carry over from step 3's real AI play.
      // Their initial deal contains a Free-Hindo, so they have a card on this beat.
      // We only top up what's missing, never replace the hand.
      const human = game.players[SEAT_HUMAN];
      if (!human) return;
      const needsPrompt = human.promptStack.length === 0;
      const needsHindo = !human.hand.some((c) => c.word === 'hindo');
      applyVersusScenario(game, {
        opened: true,
        beat: 'hindo',
        activeSeatIndex: SEAT_HUMAN,
        ...(needsPrompt
          ? {
              promptStacks: [
                { seatIndex: SEAT_HUMAN, card: { word: 'wally', prompt: 'free' } },
              ],
            }
          : {}),
        ...(needsHindo
          ? {
              appendHands: {
                [SEAT_HUMAN]: [{ word: 'hindo', prompt: 'free' }],
              },
            }
          : {}),
      });
    },
    // Highlight the human's active prompt + its info badge, that's what the
    // step is teaching about. The seat pill itself isn't relevant here.
    spotlight: { kind: 'selector', value: '[data-tutorial-target="prompt-0"]' },
    // Generic matcher: any Hindo on any legal seat. The engine's legalTargetSeats
    // already restricts to whichever prompt the player received in step 3.
    expect: { kind: 'playCard', cardWord: 'hindo', anyTarget: true },
    hint: 'Drag any Hindo onto a glowing opponent.',
  },
  {
    id: 'versus-free',
    concept: 'Free = anyone',
    copy: {
      title: 'Free is a wildcard direction',
      body:
        'A Free prompt lets the holder target ANY opponent. Watch, the opponent you handed your Hindo to plays a Free-Pop right back at you. Then play any Tambo on whoever you like.',
    },
    icons: ['free'],
    setup: (game) => {
      // ORGANIC: after step 4 the human played their Hindo on someone, that recipient
      // is now active. Hand them a Free-Pop so they can play it back at the human,
      // demonstrating that Free targets ANY seat. Walk-through uses the real target;
      // isolation defaults to Across.
      let targetSeat = game.activeSeatIndex;
      if (targetSeat === SEAT_HUMAN || targetSeat < 0) targetSeat = SEAT_ACROSS;
      applyVersusScenario(game, {
        opened: true,
        beat: 'pop',
        activeSeatIndex: targetSeat,
        appendHands: {
          [targetSeat]: [{ word: 'pop', prompt: 'free' }],
        },
      });
      // Make sure the human has a Tambo for the post-demo bonus play. Walk-through hand
      // includes Free-Tambo from the initial deal; isolation may not.
      const human = game.players[SEAT_HUMAN];
      if (human && !human.hand.some((c) => c.word === 'tambo')) {
        applyVersusScenario(game, {
          appendHands: { [SEAT_HUMAN]: [{ word: 'tambo', prompt: 'free' }] },
        });
      }
    },
    demo: async (game) => {
      // Active AI plays Free-Pop on the human. Their existing prompt (a Free card from
      // the human's step-4 play) lets them target any seat, so this is a legal play.
      const active = game.players[game.activeSeatIndex];
      if (!active) return;
      const pop = active.hand.find((c) => c.word === 'pop' && c.prompt === 'free');
      if (!pop) return;
      game.submitVersusAction(active.id, {
        type: 'play',
        cardId: pop.id,
        targetSeatIndex: SEAT_HUMAN,
      });
      await new Promise((r) => setTimeout(r, 900));
    },
    expect: { kind: 'playCard', cardWord: 'tambo', anyTarget: true },
    hint: 'Your prompt is now Free-Pop, play any Tambo on anyone you like.',
  },
  {
    id: 'versus-stop',
    concept: 'Stop forces a draw',
    copy: {
      title: 'Stop: you can\'t play this turn',
      body:
        'A Stop prompt blocks you from playing, you have to click the deck and draw a card. When the pile empties, Stop becomes a Left/Right pick instead.',
    },
    icons: ['stop'],
    setup: (game) => {
      // ORGANIC: after step 5 the human played a Tambo. Beat advanced to Riki. Active is
      // now whoever they targeted. We hand control to Lefty, append a Stop-Riki, and let
      // them play it on the human in demo. The Stop lands naturally on the human's stack.
      applyVersusScenario(game, {
        opened: true,
        beat: 'riki',
        activeSeatIndex: SEAT_LEFTY,
        appendHands: {
          [SEAT_LEFTY]: [{ word: 'riki', prompt: 'stop' }],
        },
      });
    },
    demo: async (game) => {
      const lefty = game.players[SEAT_LEFTY];
      if (!lefty) return;
      const stop = lefty.hand.find((c) => c.word === 'riki' && c.prompt === 'stop');
      if (!stop) return;
      game.submitVersusAction(lefty.id, {
        type: 'play',
        cardId: stop.id,
        targetSeatIndex: SEAT_HUMAN,
      });
      await new Promise((r) => setTimeout(r, 900));
    },
    spotlight: { kind: 'deck' },
    expect: { kind: 'draw' },
    hint: 'Click the deck to draw, Stop means you must pass this turn.',
  },
  {
    id: 'versus-chain',
    concept: 'The Chain, forced draws bounce back',
    copy: {
      title: 'Forcing a draw earns a bonus turn',
      body:
        'Watch, Lefty plays a Chik on you (lifting your Stop), your Wally flies to Righty, who can\'t reply and is forced to draw. Because YOUR card caused that draw, the chain bounces back. Bonus turn! Your prompt now points at Righty, slam your Hindo there.',
    },
    icons: ['right'],
    setup: (game) => {
      // ORGANIC: after step 6 the human drew under Stop. Beat advanced to Chik. The Stop
      // is still on their stack (engine never auto-clears it). The demo scripts an AI to
      // LIFT the Stop with a fresh Chik play, that play legitimately puts a new prompt
      // on top of the human's stack. Then the human's own auto-played Wally forces a
      // draw on Righty, triggering the chain. No prompt pinning needed on the human.
      applyVersusScenario(game, {
        opened: true,
        beat: 'chik',
        activeSeatIndex: SEAT_LEFTY,
        appendHands: {
          // Lefty needs a Chik to lift the Stop. Use Right-Chik (deck-available, the
          // only Free-Chik in the deck was dealt to the human; pulling it would steal
          // from the human's hand).
          [SEAT_LEFTY]: [{ word: 'chik', prompt: 'right' }],
          // Human needs a Wally for the chain-trigger play AND a Hindo for the bonus
          // turn. We pick Right-prompt variants because both have multiple copies in
          // the deck, Free-Wally has only one and may already be in the human's own
          // promptStack from step 3 (Across plays Free-Wally when given Halo-Halo),
          // making it unappendable.
          [SEAT_HUMAN]: [
            { word: 'wally', prompt: 'right' },
            { word: 'hindo', prompt: 'right' },
          ],
        },
      });
      // Drain Righty's hand so the human's Wally play forces Righty to draw, triggering
      // the chain bounce.
      const righty = game.players[SEAT_RIGHTY];
      if (righty) {
        while (righty.hand.length > 0) {
          game.drawPile.unshift(righty.hand.pop()!);
        }
      }
    },
    demo: async (game) => {
      // 1. Lefty plays a Chik on the human, replaces the Stop on top of the stack
      //    with a new prompt; beat advances chik → wally; control passes to the human.
      //    We look for the Right-Chik we appended in setup; fall back to any non-HaloHalo
      //    Chik so isolation tests aren't picky about which prompt variant we found.
      const lefty = game.players[SEAT_LEFTY];
      const leftyChik = lefty?.hand.find((c) => c.word === 'chik' && c.prompt === 'right')
        ?? lefty?.hand.find((c) => c.word === 'chik' && !c.isHaloHalo);
      if (lefty && leftyChik) {
        game.submitVersusAction(lefty.id, {
          type: 'play',
          cardId: leftyChik.id,
          targetSeatIndex: SEAT_HUMAN,
        });
        await new Promise((r) => setTimeout(r, 900));
      }
      // 2. Human auto-plays a Wally on Righty, beat → hindo; control to Righty; the
      //    chain source is now the human. We accept ANY non-HaloHalo Wally so the demo
      //    is resilient to which specific Wally variant is currently in the hand.
      const human = game.players[SEAT_HUMAN];
      const humanWally = human?.hand.find((c) => c.word === 'wally' && !c.isHaloHalo);
      if (human && humanWally) {
        game.submitVersusAction(human.id, {
          type: 'play',
          cardId: humanWally.id,
          targetSeatIndex: SEAT_RIGHTY,
        });
        await new Promise((r) => setTimeout(r, 900));
      }
      // 3. Righty has no cards, forced draw. Engine bounces control back to the human.
      const righty = game.players[SEAT_RIGHTY];
      if (righty) {
        game.submitVersusAction(righty.id, { type: 'draw' });
        await new Promise((r) => setTimeout(r, 900));
      }
    },
    expect: { kind: 'playCard', cardWord: 'hindo', anyTarget: true },
    hint: 'Drag your Hindo onto Righty, that\'s the legal target per your current prompt.',
  },
  {
    id: 'versus-snap',
    concept: 'Snap-when-drawn',
    copy: {
      title: 'Drew a Snap on the beat? Play it now!',
      body:
        'If you DRAW a Snap matching the current beat, play it immediately on your left or right neighbour. It overrides any prompt, even Stop.',
    },
    icons: ['snap'],
    setup: (game) => {
      // ORGANIC: after step 7's chain bonus play, beat advanced to Wally. We pin the
      // deck top to a Snap-Wally and ensure the human is active. We DON'T replace the
      // human's hand, we just remove any Wally they're holding so the only path is
      // "draw → snap-play". Their remaining hand carries through to step 10.
      applyVersusScenario(game, {
        opened: true,
        beat: 'wally',
        activeSeatIndex: SEAT_HUMAN,
        deckTop: { word: 'wally', prompt: 'snap' },
      });
      const human = game.players[SEAT_HUMAN];
      if (human) {
        for (let i = human.hand.length - 1; i >= 0; i--) {
          if (human.hand[i].word === 'wally') {
            game.drawPile.unshift(human.hand.splice(i, 1)[0]);
          }
        }
        // Isolation safety: if the cold-start hand is empty for some reason, give them
        // one off-beat card so a draw is the only legal path.
        if (human.hand.length === 0) {
          applyVersusScenario(game, {
            appendHands: { [SEAT_HUMAN]: [{ word: 'pop', prompt: 'free' }] },
          });
        }
      }
    },
    spotlight: { kind: 'deck' },
    expect: { kind: 'snapPlay' },
    hint: 'Click the deck, a Snap matching the beat will appear; tap a neighbour to play it.',
  },
  {
    id: 'versus-fetch',
    concept: 'Fetch drains the owner',
    copy: {
      title: 'Fetch: you draw from someone\'s hand',
      body:
        'When your prompt is Fetch, your draws come from the player who placed it, not the deck. If you empty their hand, they win instantly.',
    },
    icons: ['fetch'],
    setup: (game) => {
      // ORGANIC: after step 8's snap-play, beat advanced to Hindo and control passed
      // to whoever the human snapped on. We bring control to Across (P3), append a
      // Fetch-Hindo to their hand, and demo them playing it on the human. The Fetch
      // ownership is recorded by the engine, no manual fetchOwners poke needed.
      applyVersusScenario(game, {
        opened: true,
        beat: 'hindo',
        activeSeatIndex: SEAT_ACROSS,
        appendHands: {
          [SEAT_ACROSS]: [{ word: 'hindo', prompt: 'fetch' }],
        },
      });
      // Drain any Hindo from the human's hand so their only legal action is to draw
      // (and that draw lands from Across's hand because of the Fetch prompt).
      const human = game.players[SEAT_HUMAN];
      if (human) {
        for (let i = human.hand.length - 1; i >= 0; i--) {
          if (human.hand[i].word === 'hindo') {
            game.drawPile.unshift(human.hand.splice(i, 1)[0]);
          }
        }
      }
      // Make sure Across has at least one more card to actually fetch from, otherwise
      // the lesson collapses (no source). Top up with a non-Hindo filler.
      const across = game.players[SEAT_ACROSS];
      if (across && across.hand.length < 2) {
        applyVersusScenario(game, {
          appendHands: {
            [SEAT_ACROSS]: [{ word: 'pop', prompt: 'free' }, { word: 'chik', prompt: 'free' }],
          },
        });
      }
    },
    demo: async (game) => {
      // Across plays Fetch-Hindo on the human. The engine records Across as the Fetch
      // owner via fetchOwners. After this play, control returns to the human under a
      // Fetch prompt, their draw will come from Across's hand.
      const across = game.players[SEAT_ACROSS];
      if (!across) return;
      const fetch = across.hand.find((c) => c.word === 'hindo' && c.prompt === 'fetch');
      if (!fetch) return;
      game.submitVersusAction(across.id, {
        type: 'play',
        cardId: fetch.id,
        targetSeatIndex: SEAT_HUMAN,
      });
      await new Promise((r) => setTimeout(r, 900));
    },
    // Highlight the Fetch prompt icon beside the human's active prompt, the
    // round circular badge with the off-deck glyph. That's the cue the body is
    // talking about ("when your prompt is Fetch...").
    spotlight: { kind: 'selector', value: '[data-tutorial-target="prompt-info-0"]' },
    expect: { kind: 'draw' },
    hint: 'Click the deck, your card will fly from Across\'s hand, not the pile.',
  },
  // ---- Versus v1.2 layer: Counts + Chant Trigger ----
  // These are narrative-only steps (canSkipForward). The mechanics here only fire
  // at specific moments, the Chant Trigger needs a specific Chant Chik played as
  // the closing Chik, so a scripted demo would require deep state choreography.
  // Beat ownership is already covered interactively by the early `versus-beat-claim`
  // step. Here we just walk the player through what they'll see in a real round.
  {
    id: 'versus-counts',
    concept: 'Every card has a count',
    copy: {
      title: 'Counts sit on every card',
      body:
        'Look beside your active prompt, the circular badge with a number is the card\'s count (0 to 10). Counts are dormant most of the round, but they matter the moment a Chant Trigger fires (coming up next).',
    },
    icons: ['count'],
    // Highlight the COUNT badge specifically (the numeric circle), not the
    // prompt-icon badge on the other side of the prompt card.
    spotlight: { kind: 'selector', value: '[data-tutorial-target="prompt-count-0"]' },
    canSkipForward: true,
  },
  {
    id: 'versus-chant-chik',
    concept: 'The Chant Chik variant',
    copy: {
      title: 'Half the Chiks are Chant Chiks',
      body:
        'Eight of the sixteen Chik cards are Chant Chiks, same Chik beat, just with a darker background. They behave like normal Chiks UNTIL one is played as the CLOSING Chik of a full Wally→Riki chant. Then: the Chant Trigger fires.',
    },
    icons: ['chant-chik'],
    canSkipForward: true,
  },
  {
    id: 'versus-chant-trigger-play',
    concept: 'Trigger the Chant with a Chant Chik',
    copy: {
      title: 'Slam your Chant Chik on any opponent',
      body:
        'We\'ve fast-forwarded to the closing Chik beat. Your hand has a Chant Chik and every seat\'s prompt has a count set up so the recital will land on YOUR beat. Slam the Chant Chik on any opponent, the recital will play out automatically.',
    },
    icons: ['chant-chik'],
    setup: (game) => {
      // Orchestrate the Chant Trigger so the recital lands on the player's
      // claimed beat (from step 3 versus-beat-claim). This is the climactic
      // moment of the tutorial, it has to "just work" regardless of which
      // beat the player picked.
      orchestrateChantTriggerForHuman(game);
    },
    spotlight: { kind: 'card-in-hand', cardWord: 'chik', isHaloHalo: false },
    expect: { kind: 'playCard', cardWord: 'chik' },
    hint: 'Drag the dark-background Chik onto any opponent.',
    requiresCascadeState: true,
  },
  {
    id: 'versus-chant-power',
    concept: 'You won, give cards away',
    copy: {
      title: 'You won the Chant Power!',
      body:
        'Because the recital landed on YOUR beat, you win the Chant Power. You can give 0 to 3 cards from your hand to any other players. Pick cards to give (or none), then confirm, the modal at the bottom drives this.',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="chant-power-modal"]' },
    expect: { kind: 'chantPowerResolve' },
    hint: 'Use the modal at the bottom of the screen, pick cards, pick recipients, confirm.',
    requiresCascadeState: true,
  },
  {
    id: 'versus-done',
    concept: 'You\'re ready',
    copy: {
      title: 'You\'re ready to play',
      body:
        'That\'s the whole game. First to empty their hand wins, and stacking Chant Chiks lets you flip the table mid-round. Toggle "Strict prompts" in Settings for penalty draws on illegal plays. On desktop, press D to draw (or pass when the deck is empty).',
    },
    canSkipForward: true,
  },
];

/** Set up the engine so the next Chant Chik play fires the Chant Trigger AND
 *  lands the recital on the human's claimed beat. Called from the
 *  `versus-chant-trigger-play` step setup.
 *
 *  Strategy (kept deliberately simple after a bug where the math depended on
 *  the player picking a SPECIFIC chant chik from their hand):
 *
 *    1. Purge EVERY Chik from the human's hand (any variant they picked up
 *       earlier via draws, only the controlled one should remain).
 *    2. Force-pull the Free Chant Chik (count 5) from anywhere it lives and
 *       give it to the human as the ONLY chik in hand.
 *    3. All AI seats get a stub with count 0.
 *    4. The human's stack gets a stub with count = (desiredTotal - 5) so
 *       sum-after-play lands on the desired beat regardless of which AI seat
 *       the player targets.
 *
 *  Math: landed beat = BEAT_ORDER[(total - 1) % 7] where BEAT_ORDER is
 *  [opening-chik, wally, hindo, pop, tambo, riki, closing-chik]. After play,
 *  total = humanStub.count + 5 (chant chik) + 0 + 0 = humanCount + 5.
 *  So humanCount = (desiredTotal - 5), where desiredTotal is the smallest
 *  number ≥ 5 satisfying `total % 7 = (beatIndex + 1) % 7`. */
function orchestrateChantTriggerForHuman(game: Game): void {
  const internals = game as unknown as {
    beatOwners: Map<ChantWord, number>;
    chant: { _virtualPos: number };
    drawPile: import('@/game/Card').Card[];
    players: { hand: import('@/game/Card').Card[]; promptStack: import('@/game/Card').Card[] }[];
  };

  // 1. Find the human's claimed beat.
  let targetBeat: ChantWord | null = null;
  for (const [beat, seat] of internals.beatOwners.entries()) {
    if (seat === SEAT_HUMAN) { targetBeat = beat; break; }
  }
  // Map beat → BEAT_ORDER index we want the recital to land on. Chik maps to 6
  // (closing), not 0 (opening, that's the no-winner case).
  const beatIndex =
    targetBeat === 'wally' ? 1 :
    targetBeat === 'hindo' ? 2 :
    targetBeat === 'pop'   ? 3 :
    targetBeat === 'tambo' ? 4 :
    targetBeat === 'riki'  ? 5 :
    targetBeat === 'chik'  ? 6 :
    1; // fallback → Wally (in practice unreachable; step 3 forces a claim)

  // 2. Compute required total. We want `total % 7 = (beatIndex + 1) % 7`,
  //    and `total = humanCount + 5`, so `humanCount = (desiredTotal - 5)`.
  //    Pick the smallest desiredTotal ≥ 5 (so humanCount ≥ 0, within 0..10).
  const desiredMod = (beatIndex + 1) % 7;  // 0..6
  // Find smallest desiredTotal ≥ 5 with `desiredTotal % 7 = desiredMod`.
  let desiredTotal = desiredMod === 0 ? 7 : desiredMod; // 1..7
  while (desiredTotal < 5) desiredTotal += 7;
  // desiredTotal is now 5, 6, 7, 9, 10, or 11 (for beat indices 4, 5, 6, 1, 2, 3).
  const humanCount = desiredTotal - 5; // 0..6, always ≤ 10.

  // 3. Set chant to CLOSING chik (currentIndex 6) so the next Chant Chik play
  //    triggers. The Chant.current setter only handles index 0 for 'chik', so
  //    poke _virtualPos directly.
  internals.chant._virtualPos = 6;

  // 4. Purge ALL chiks from human's hand AND all AI prompt stacks. Any stray
  //    chant chik the player drew in earlier steps would otherwise be a second
  //    valid play option with the wrong count.
  const human = internals.players[SEAT_HUMAN];
  if (human) {
    for (let i = human.hand.length - 1; i >= 0; i--) {
      if (human.hand[i].word === 'chik') {
        internals.drawPile.push(human.hand.splice(i, 1)[0]);
      }
    }
  }

  // 5. Force-pull the Free Chant Chik (count 5) from ANYWHERE, deck, any
  //    hand, any prompt stack. `appendHands` only searches deck + hands, so we
  //    do it manually here to handle the case where a prior step's play put
  //    the Free Chant Chik on someone's stack.
  const freeChantChik = pullFreeChantChik(internals);
  if (freeChantChik) {
    human?.hand.push(freeChantChik);
  }

  // 6. Reset prompt stacks: human gets a stub with the orchestrated count;
  //    every AI seat gets a count-0 stub. With AI counts at 0, the sum after
  //    play is purely chant-chik(5) + humanStub(humanCount), independent of
  //    which AI seat the player targets.
  applyVersusScenario(game, {
    clearPromptStacks: [SEAT_HUMAN, SEAT_LEFTY, SEAT_ACROSS, SEAT_RIGHTY],
    promptStacks: [
      { seatIndex: SEAT_HUMAN,  card: { word: 'wally', prompt: 'free', count: humanCount } },
      { seatIndex: SEAT_LEFTY,  card: { word: 'wally', prompt: 'free', count: 0 } },
      { seatIndex: SEAT_ACROSS, card: { word: 'wally', prompt: 'free', count: 0 } },
      { seatIndex: SEAT_RIGHTY, card: { word: 'wally', prompt: 'free', count: 0 } },
    ],
    activeSeatIndex: SEAT_HUMAN,
  });
}

/** Pull the Free Chant Chik card from anywhere it currently lives, deck top,
 *  any player's hand, any player's prompt stack. Returns the Card or null if
 *  it's somehow missing (shouldn't happen, Versus deck always has exactly one). */
function pullFreeChantChik(internals: {
  drawPile: import('@/game/Card').Card[];
  players: { hand: import('@/game/Card').Card[]; promptStack: import('@/game/Card').Card[] }[];
}): import('@/game/Card').Card | null {
  const matches = (c: import('@/game/Card').Card) =>
    c.word === 'chik' && c.prompt === 'free' && !c.isHaloHalo;
  // Deck
  const di = internals.drawPile.findIndex(matches);
  if (di >= 0) return internals.drawPile.splice(di, 1)[0];
  // Any hand
  for (const p of internals.players) {
    const hi = p.hand.findIndex(matches);
    if (hi >= 0) return p.hand.splice(hi, 1)[0];
  }
  // Any prompt stack
  for (const p of internals.players) {
    const si = p.promptStack.findIndex(matches);
    if (si >= 0) return p.promptStack.splice(si, 1)[0];
  }
  return null;
}

// --------------------------------------------------------------------------------------
// Matcher resolver, called by useTutorial on each engine event in 'awaiting-input' phase
// --------------------------------------------------------------------------------------

/** Does the matcher accept this event? Used by the tutorial controller to decide
 *  whether the current step is satisfied. */
export function matchExpect(expect: ExpectMatcher | undefined, event: GameEvent, game: Game): boolean {
  if (!expect) return false;
  switch (expect.kind) {
    case 'playCard': {
      if (event.kind !== 'versusPlay') return false;
      const card = findCardById(game, event.cardId);
      if (!card) return false;
      if (expect.cardWord && card.word !== expect.cardWord) return false;
      if (expect.cardPrompt && card.prompt !== expect.cardPrompt) return false;
      if (expect.isHaloHalo !== undefined && card.isHaloHalo !== expect.isHaloHalo) return false;
      if (expect.targetSeatIndex !== undefined && event.targetSeatIndex !== expect.targetSeatIndex) return false;
      return true;
    }
    case 'slamBase': {
      if (event.kind !== 'soloSlam') return false;
      if (expect.baseSide && event.baseSide !== expect.baseSide) return false;
      if (expect.cardWord && event.cardWord !== expect.cardWord) return false;
      return true;
    }
    case 'draw':
      return event.kind === 'versusDraw' || event.kind === 'soloDraw';
    case 'snapPlay':
      if (event.kind !== 'versusSnapDrawnPlayed') return false;
      // versusSnapDrawnPlayed doesn't carry targetSeatIndex; if a specific seat is
      // expected, fall back to the subsequent versusPlay event. For now we accept
      // any snap-played as success.
      return true;
    case 'claimBeat':
      if (event.kind !== 'versusBeatClaimed') return false;
      if (expect.beat && event.beat !== expect.beat) return false;
      return true;
    case 'chantPowerResolve':
      return event.kind === 'versusChantPowerResolved';
    case 'event':
      return expect.predicate(event);
  }
}

function findCardById(game: Game, cardId: string) {
  for (const p of game.players) {
    const fromHand = p.hand.find((c) => c.id === cardId);
    if (fromHand) return fromHand;
    const fromStack = p.promptStack.find((c) => c.id === cardId);
    if (fromStack) return fromStack;
  }
  const fromDeck = game.drawPile.find((c) => c.id === cardId);
  if (fromDeck) return fromDeck;
  for (const side of ['left', 'right'] as const) {
    const fromBase = game.soloBases[side].find((c) => c.id === cardId);
    if (fromBase) return fromBase;
  }
  return null;
}

// --------------------------------------------------------------------------------------
// Canonical-resolution helper, produces the deterministic action the Skip button fires
// --------------------------------------------------------------------------------------

export interface CanonicalActionResult {
  mode: 'solo' | 'versus';
  action: SoloAction | VersusAction;
  /** Player id who performs the action, always seat 0 (the human) for tutorial steps. */
  playerId: string;
}

/** Produce a player-action that would canonically satisfy this step's expect matcher.
 *  Returns null if the matcher is non-deterministic (kind: 'event') or if no card in
 *  the current state matches (rare, would indicate a mis-authored step). */
export function canonicalActionFor(step: TutorialStep, game: Game, mode: 'solo' | 'versus'): CanonicalActionResult | null {
  if (!step.expect) return null;
  const human = game.players[0];
  if (!human) return null;

  switch (step.expect.kind) {
    case 'playCard': {
      const card = human.hand.find((c) => {
        if (step.expect!.kind !== 'playCard') return false;
        const m = step.expect as Extract<ExpectMatcher, { kind: 'playCard' }>;
        if (m.isHaloHalo !== undefined && c.isHaloHalo !== m.isHaloHalo) return false;
        if (m.cardWord && c.word !== m.cardWord) return false;
        if (m.cardPrompt && c.prompt !== m.cardPrompt) return false;
        return true;
      });
      if (!card) return null;
      const m = step.expect as Extract<ExpectMatcher, { kind: 'playCard' }>;
      const target = m.targetSeatIndex !== undefined
        ? m.targetSeatIndex
        : firstLegalTarget(game, 0, card);
      if (target == null) return null;
      return {
        mode: 'versus',
        playerId: human.id,
        action: { type: 'play', cardId: card.id, targetSeatIndex: target },
      };
    }
    case 'slamBase': {
      const m = step.expect as Extract<ExpectMatcher, { kind: 'slamBase' }>;
      const card = m.cardWord
        ? human.hand.find((c) => c.word === m.cardWord)
        : human.hand.find((c) => c.isHaloHalo) ?? human.hand[0];
      if (!card) return null;
      // When the step doesn't pin a specific side, derive it from the engine's
      // active prompt DIRECTION (Left → left base, Right → right base). Falls
      // through to the active card's actual seat for Free / no-prompt cases,
      // and finally 'left' as a last resort (matters only for step 2's opener
      // where the deck is fresh).
      const internals = game as unknown as {
        soloActivePrompt: CardPrompt | null;
        soloActiveBaseSide: BaseSide | null;
      };
      const fromPrompt: BaseSide | null =
        internals.soloActivePrompt === 'left' ? 'left' :
        internals.soloActivePrompt === 'right' ? 'right' :
        null;
      const baseSide: BaseSide = m.baseSide ?? fromPrompt ?? internals.soloActiveBaseSide ?? 'left';
      return {
        mode: 'solo',
        playerId: human.id,
        action: { type: 'slam', cardId: card.id, baseSide },
      };
    }
    case 'draw':
      // Pick whichever submit API is appropriate from the game mode.
      return {
        mode,
        playerId: human.id,
        action: { type: 'draw' },
      };
    case 'snapPlay': {
      const m = step.expect as Extract<ExpectMatcher, { kind: 'snapPlay' }>;
      // For Snap, the canonical resolution is "click deck (draw)" followed by the
      // snap-play submission. We return just the draw here, the controller's Skip
      // path will follow up with snap-play once pendingSnapDraw appears.
      const target = m.targetSeatIndex ?? 1;
      return {
        mode: 'versus',
        playerId: human.id,
        action: { type: 'snap-play', targetSeatIndex: target },
      };
    }
    case 'claimBeat': {
      const m = step.expect as Extract<ExpectMatcher, { kind: 'claimBeat' }>;
      // Honour an explicit beat; otherwise pick the first unclaimed one.
      let beat: ChantWord | undefined = m.beat;
      if (!beat) {
        const internals = game as unknown as { beatOwners: Map<ChantWord, number> };
        const ORDER: ChantWord[] = ['chik', 'wally', 'hindo', 'pop', 'tambo', 'riki'];
        beat = ORDER.find((w) => (internals.beatOwners.get(w) ?? -1) < 0);
      }
      if (!beat) return null;
      return {
        mode: 'versus',
        playerId: human.id,
        action: { type: 'claim-beat', beat },
      };
    }
    case 'chantPowerResolve': {
      // Default: gift the first card in hand to the first opponent (LEFTY).
      // Tutorial body explains the player can pick any 0-3 cards / recipients;
      // canonical just produces a valid no-op-ish resolution for the test path.
      const card = human.hand[0];
      const opponent = game.players.find((p) => p.seatIndex !== human.seatIndex);
      if (!card || !opponent) {
        // No cards to give or no opponent, submit empty gifts.
        return {
          mode: 'versus',
          playerId: human.id,
          action: { type: 'chant-power-resolve', gifts: [] },
        };
      }
      return {
        mode: 'versus',
        playerId: human.id,
        action: {
          type: 'chant-power-resolve',
          gifts: [{ recipientSeatIndex: opponent.seatIndex, cardIds: [card.id] }],
        },
      };
    }
    case 'event':
      return null;
  }
}

function firstLegalTarget(game: Game, seatIdx: number, card: import('@/game/Card').Card): number | null {
  const targets = game.legalTargetSeats(seatIdx, card);
  return targets.length > 0 ? targets[0] : null;
}
