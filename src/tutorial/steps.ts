/**
 * Tutorial step definitions for Solo and Versus modes.
 *
 * Each step is a pure data record describing:
 *   - copy (title + body) shown in the TutorialOverlay
 *   - icons (the SVG glyphs under assets/icons/) to render alongside the copy
 *   - spotlight target (data-tutorial-target selector) to highlight on the table
 *   - optional setup() — pins the engine state via applyScenario
 *   - optional demo() — scripted moves the controller plays itself (paused
 *     SimulationController, direct submitVersusAction calls)
 *   - optional expect — the player action the controller waits for before advancing
 *   - canSkipForward — true for pure-narrative steps (a "Next" button advances)
 *
 * The matcher resolver `matchExpect()` is exported for the controller. It runs
 * against engine `GameEvent`s emitted while the controller is in 'awaiting-input'
 * phase; the first match advances the tutorial.
 *
 * `canonicalActionFor()` produces the deterministic action that the Skip-step button
 * fires to satisfy a matcher — same submit API the player would use.
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
  | null;

export type TutorialIcon = 'left' | 'right' | 'free' | 'stop' | 'snap' | 'deck-off' | 'left-right';

export type ExpectMatcher =
  | { kind: 'playCard'; cardWord?: ChantWord; cardPrompt?: CardPrompt; isHaloHalo?: boolean; targetSeatIndex?: number; anyTarget?: boolean }
  | { kind: 'slamBase'; baseSide?: BaseSide; cardWord?: ChantWord }
  | { kind: 'draw' }
  | { kind: 'snapPlay'; targetSeatIndex?: number }
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
  /** True for pure-narrative steps — the Next button advances. */
  canSkipForward?: boolean;
}

// --------------------------------------------------------------------------------------
// Solo tutorial — 5 steps, ~90 seconds
// --------------------------------------------------------------------------------------

export const SOLO_STEPS: TutorialStep[] = [
  {
    id: 'solo-welcome',
    concept: 'Welcome & the chant',
    copy: {
      title: 'Welcome to Chik!',
      body:
        'Cards loop through a chant: Chik → Wally → Hindo → Pop → Tambo → Riki → Chik → and back. Each card you play must match the current beat.',
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target="chant-ticker"]' },
    setup: (game) => {
      applySoloScenario(game, {
        opened: false,
        beat: 'chik',
        hand: [
          { word: 'chik', prompt: 'free', isHaloHalo: true },
          { word: 'chik', prompt: 'right' },
          { word: 'wally', prompt: 'left' },
          { word: 'hindo', prompt: 'free' },
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
        'Your special Halo-Halo Chik (rainbow) starts every game. Slam it on either base — Left or Right — to begin.',
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
        'The base you slammed it on is highlighted with "PROMPT". Its type — Left, Right, or Free — decides where your NEXT card may land.',
    },
    icons: ['free'],
    setup: (game) => {
      // Step 2 advanced via slamBase — the active prompt is already set on whichever
      // base the player chose. Pin the beat to Wally for step 4's payoff.
      applySoloScenario(game, { beat: 'wally' });
    },
    spotlight: { kind: 'selector', value: '[data-tutorial-target^="base-"]' },
    canSkipForward: true,
  },
  {
    id: 'solo-right-prompt',
    concept: 'The card you play sets the next direction',
    copy: {
      title: 'Watch what you put down',
      body:
        'Halo-Halo (Free) lets you slam either side. Try slamming a Wally card now — the prompt of THAT card will decide where the next card has to go.',
    },
    icons: ['right', 'left'],
    setup: (game) => {
      applySoloScenario(game, {
        opened: true,
        beat: 'wally',
        hand: [
          { word: 'wally', prompt: 'right' },
          { word: 'wally', prompt: 'left' },
        ],
      });
    },
    spotlight: { kind: 'card-in-hand', cardWord: 'wally' },
    expect: { kind: 'slamBase', cardWord: 'wally' },
  },
  {
    id: 'solo-direction-follows-prompt',
    concept: 'Direction follows the prompt',
    copy: {
      title: 'The base, not the card',
      body:
        'Your last card sets the Prompt direction. The card you play next can be ANY type — only the BASE you slam it on has to match the prompt.',
    },
    icons: ['right', 'left'],
    setup: (game) => {
      // After step 4, soloActivePrompt is set to whichever Wally the player slammed.
      // We FORCE the active prompt to Right for a predictable rule demonstration.
      applySoloScenario(game, {
        opened: true,
        beat: 'hindo',
        activePrompt: { side: 'right', card: { word: 'wally', prompt: 'right' } },
        hand: [{ word: 'hindo', prompt: 'left' }],
      });
    },
    spotlight: { kind: 'base', side: 'right' },
    expect: { kind: 'slamBase', baseSide: 'right', cardWord: 'hindo' },
    hint: 'The active prompt is Right — slam your Hindo on the Right base.',
  },
];

// --------------------------------------------------------------------------------------
// Versus tutorial — 10 steps, ~3 minutes
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
      // them target the human directly (P2/Lefty has Right-Wally — their right is the
      // human; P3/Across has Free-Wally — any target; P4/Righty has Left-Wally — their
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
    id: 'versus-halo-halo',
    concept: 'Halo-Halo opens',
    copy: {
      title: 'Play Halo-Halo on any opponent',
      body:
        'The Halo-Halo Chik (rainbow) opens the game. Drag it onto any opponent — the card you play lands in FRONT of them as their next prompt.',
    },
    icons: ['free'],
    setup: (game) => {
      // Minimal cold-start guard: if the human's hand somehow doesn't contain
      // Halo-Halo (e.g. the tutorial was opened to this step directly via a debug
      // path), re-seed enough state for the matcher to find it. In the normal walk
      // through this is idempotent — step 1 already seeded the same cards.
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
        'Watch — the opponent you handed Halo-Halo to now has a Free prompt. They play a Wally card on YOU, so the next prompt — and the next play — comes back to you.',
    },
    icons: ['left'],
    setup: (game) => {
      // DYNAMIC: find whoever the player handed Halo-Halo to in step 2 and make them
      // active. Don't touch hands or promptStacks — Halo-Halo is already in front of
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
      // the engine — promptStack on the human updates from the actual event, not a pin.
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
        'You just received a prompt. Your next card has to land on a seat your prompt allows. Drag any Hindo onto a legal opponent — the wheel will only let you slam on legal seats.',
    },
    icons: ['left', 'right', 'free'],
    setup: (game) => {
      // ORGANIC: the human's hand and prompt carry over from step 3's real AI play.
      // Their initial deal contains a Free-Hindo, so they have a card on this beat.
      // We only top up what's missing — never replace the hand.
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
        'A Free prompt lets the holder target ANY opponent. Watch — the opponent you handed your Hindo to plays a Free-Pop right back at you. Then play any Tambo on whoever you like.',
    },
    icons: ['free'],
    setup: (game) => {
      // ORGANIC: after step 4 the human played their Hindo on someone — that recipient
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
    hint: 'Your prompt is now Free-Pop — play any Tambo on anyone you like.',
  },
  {
    id: 'versus-stop',
    concept: 'Stop forces a draw',
    copy: {
      title: 'Stop: you can\'t play this turn',
      body:
        'A Stop prompt blocks you from playing — you have to click the deck and draw a card. When the pile empties, Stop becomes a Left/Right pick instead.',
    },
    icons: ['stop', 'left-right'],
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
    hint: 'Click the deck to draw — Stop means you must pass this turn.',
  },
  {
    id: 'versus-chain',
    concept: 'The Chain — forced draws bounce back',
    copy: {
      title: 'Forcing a draw earns a bonus turn',
      body:
        'Watch what unfolds — Lefty plays a Chik on you (lifting your Stop), then your Wally flies to Righty, who has no reply and is forced to draw. Because YOUR card caused that draw, the chain bounces straight back — take a bonus turn!',
    },
    icons: ['right'],
    setup: (game) => {
      // ORGANIC: after step 6 the human drew under Stop. Beat advanced to Chik. The Stop
      // is still on their stack (engine never auto-clears it). The demo scripts an AI to
      // LIFT the Stop with a fresh Chik play — that play legitimately puts a new prompt
      // on top of the human's stack. Then the human's own auto-played Wally forces a
      // draw on Righty, triggering the chain. No prompt pinning needed on the human.
      applyVersusScenario(game, {
        opened: true,
        beat: 'chik',
        activeSeatIndex: SEAT_LEFTY,
        appendHands: {
          // Lefty needs a Chik to lift the Stop. Use Right-Chik (deck-available — the
          // only Free-Chik in the deck was dealt to the human; pulling it would steal
          // from the human's hand).
          [SEAT_LEFTY]: [{ word: 'chik', prompt: 'right' }],
          // Human needs a Wally for the chain-trigger play AND a Hindo for the bonus
          // turn. We pick Right-prompt variants because both have multiple copies in
          // the deck — Free-Wally has only one and may already be in the human's own
          // promptStack from step 3 (Across plays Free-Wally when given Halo-Halo),
          // making it unappendable.
          [SEAT_HUMAN]: [
            { word: 'wally', prompt: 'right' },
            { word: 'hindo', prompt: 'right' },
          ],
        },
      });
      // Drain Righty's hand so the human's Wally play forces Righty to draw — triggering
      // the chain bounce.
      const righty = game.players[SEAT_RIGHTY];
      if (righty) {
        while (righty.hand.length > 0) {
          game.drawPile.unshift(righty.hand.pop()!);
        }
      }
    },
    demo: async (game) => {
      // 1. Lefty plays a Chik on the human — replaces the Stop on top of the stack
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
      // 2. Human auto-plays a Wally on Righty — beat → hindo; control to Righty; the
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
      // 3. Righty has no cards — forced draw. Engine bounces control back to the human.
      const righty = game.players[SEAT_RIGHTY];
      if (righty) {
        game.submitVersusAction(righty.id, { type: 'draw' });
        await new Promise((r) => setTimeout(r, 900));
      }
    },
    expect: { kind: 'playCard', cardWord: 'hindo', anyTarget: true },
    hint: 'Bonus turn — play any Hindo on whoever you like.',
  },
  {
    id: 'versus-snap',
    concept: 'Snap-when-drawn',
    copy: {
      title: 'Drew a Snap on the beat? Play it now!',
      body:
        'If you DRAW a Snap matching the current beat, play it immediately on your left or right neighbour. It overrides any prompt — even Stop.',
    },
    icons: ['snap', 'left-right'],
    setup: (game) => {
      // ORGANIC: after step 7's chain bonus play, beat advanced to Wally. We pin the
      // deck top to a Snap-Wally and ensure the human is active. We DON'T replace the
      // human's hand — we just remove any Wally they're holding so the only path is
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
    hint: 'Click the deck — a Snap matching the beat will appear; tap a neighbour to play it.',
  },
  {
    id: 'versus-fetch',
    concept: 'Fetch drains the owner',
    copy: {
      title: 'Fetch: you draw from someone\'s hand',
      body:
        'When your prompt is Fetch, your draws come from the player who placed it — not the deck. If you empty their hand, they win instantly.',
    },
    icons: ['deck-off', 'left-right'],
    setup: (game) => {
      // ORGANIC: after step 8's snap-play, beat advanced to Hindo and control passed
      // to whoever the human snapped on. We bring control to Across (P3), append a
      // Fetch-Hindo to their hand, and demo them playing it on the human. The Fetch
      // ownership is recorded by the engine — no manual fetchOwners poke needed.
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
      // Make sure Across has at least one more card to actually fetch from — otherwise
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
      // Fetch prompt — their draw will come from Across's hand.
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
    spotlight: { kind: 'seat', seatIndex: SEAT_ACROSS },
    expect: { kind: 'draw' },
    hint: 'Click the deck — your card will fly from Across\'s hand, not the pile.',
  },
  {
    id: 'versus-done',
    concept: 'You\'re ready',
    copy: {
      title: 'You\'re ready to play',
      body:
        'That\'s the whole game. Try a real round next — and if you want stricter rules with penalty draws for illegal plays, toggle "Strict prompts" in Settings.',
    },
    canSkipForward: true,
  },
];

// --------------------------------------------------------------------------------------
// Matcher resolver — called by useTutorial on each engine event in 'awaiting-input' phase
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
// Canonical-resolution helper — produces the deterministic action the Skip button fires
// --------------------------------------------------------------------------------------

export interface CanonicalActionResult {
  mode: 'solo' | 'versus';
  action: SoloAction | VersusAction;
  /** Player id who performs the action — always seat 0 (the human) for tutorial steps. */
  playerId: string;
}

/** Produce a player-action that would canonically satisfy this step's expect matcher.
 *  Returns null if the matcher is non-deterministic (kind: 'event') or if no card in
 *  the current state matches (rare — would indicate a mis-authored step). */
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
      const baseSide: BaseSide = m.baseSide ?? 'left';
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
      // snap-play submission. We return just the draw here — the controller's Skip
      // path will follow up with snap-play once pendingSnapDraw appears.
      const target = m.targetSeatIndex ?? 1;
      return {
        mode: 'versus',
        playerId: human.id,
        action: { type: 'snap-play', targetSeatIndex: target },
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
