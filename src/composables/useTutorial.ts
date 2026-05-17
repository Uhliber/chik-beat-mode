/**
 * Tutorial controller. Drives the player through a scripted sequence of TutorialSteps
 * by interleaving with the existing Game + SimulationController:
 *
 *   intro            → show copy + Next button (or auto-advance if no Next)
 *   if step.setup    → applyScenario, then triggerRef(game) so the UI reflows
 *   if step.demo     → phase = 'demo'; run scripted moves (controller paused);
 *                      then await flightsSettled + grace period
 *   if step.expect   → phase = 'awaiting-input'; controller paused; tutorial's own
 *                      game listener resolves on the matching event → advance()
 *   else            → wait for Next click
 *
 * `useGame.handleEvent` is untouched — we subscribe a SECOND listener to Game.on. The
 * engine supports multiple listeners (`private listeners: Listener[]`). Order is
 * deterministic: useGame subscribes first during initGame; tutorial subscribes after,
 * reads only.
 *
 * Pause/resume contract: the SimulationController is paused on every step that has an
 * `expect`. It's resumed inside `demo()` blocks so scripted AI submissions actually
 * flow through the normal event machinery, then paused again on completion. The
 * SimulationController is never STOPPED here — that would tear down the game; we let
 * the parent route do the stop on unmount.
 */

import { computed, onUnmounted, ref, shallowRef, triggerRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { Game } from '@/game/Game';
import type { SimulationController } from '@/game/SimulationController';
import type { GameEvent } from '@/game/types';
import { matchExpect, canonicalActionFor, SOLO_STEPS, VERSUS_STEPS } from '@/tutorial/steps';
import type { TutorialStep, SpotlightTarget } from '@/tutorial/steps';
import { saveTutorialCompletion, type TutorialMode } from '@/tutorial/persistence';

export type TutorialPhase = 'intro' | 'demo' | 'awaiting-input' | 'done';

export interface UseTutorialOptions {
  mode: TutorialMode;
  game: ShallowRef<Game>;
  controller: ShallowRef<SimulationController>;
  /** Reactive in-flight cards from useGame — controller waits for this to settle before
   *  advancing copy so the UI doesn't flicker. */
  pendingFlights: Ref<{ id: number }[]>;
}

const FLIGHT_GRACE_MS = 250;
const HINT_DELAY_MS = 8000;

export function useTutorial(opts: UseTutorialOptions) {
  const steps: TutorialStep[] = opts.mode === 'solo' ? SOLO_STEPS : VERSUS_STEPS;
  const currentStepIndex = ref(0);
  const phase = ref<TutorialPhase>('intro');
  const active = ref(true);
  const hintVisible = ref(false);
  /** When the controller is in `awaiting-input`, this resolver advances the tutorial as
   *  soon as the matching event arrives. Stored as a one-shot ref so we don't have to
   *  juggle a flag inside the listener. */
  let awaitResolver: ((e: GameEvent) => void) | null = null;
  let hintTimer: number | null = null;

  // Tutorial mode forces strict prompts OFF on the engine — strict mode lets the player
  // attempt illegal plays (with a penalty), which would let them stray off the tutorial's
  // expected path. The user's saved preference is unaffected and re-applies on the next
  // round outside the tutorial. We re-apply at the start of every step in case useGame's
  // async preference load (Capacitor) resolves later and overrides our setting.
  function forceStrictPromptsOff() {
    opts.game.value.setStrictPromptsEnabled(false);
  }
  forceStrictPromptsOff();

  const currentStep = computed<TutorialStep | null>(() =>
    steps[currentStepIndex.value] ?? null,
  );

  /** Resolve a SpotlightTarget into a CSS selector string the overlay can use. For
   *  `card-in-hand` targets we look up the actual card id in the human's hand, so the
   *  spotlight points at the right element. Drops the spotlight on the completion
   *  celebration so nothing on the table is highlighted while the "Back to menu" CTA
   *  is showing. */
  const spotlightSelector = computed<string | null>(() => {
    if (phase.value === 'done') return null;
    const step = currentStep.value;
    const target = step?.spotlight ?? null;
    if (!target) return null;
    return resolveSpotlight(target);
  });

  function resolveSpotlight(target: SpotlightTarget): string | null {
    if (!target) return null;
    switch (target.kind) {
      case 'selector':
        return target.value;
      case 'seat':
        return `[data-tutorial-target="seat-${target.seatIndex}"]`;
      case 'deck':
        return `[data-tutorial-target="deck"], [data-base-id="deck"]`;
      case 'base':
        return `[data-tutorial-target="base-${target.side}"], [data-base-id="${target.side}"]`;
      case 'card-in-hand': {
        const human = opts.game.value.players[0];
        if (!human) return null;
        const card = human.hand.find((c) => {
          if (target.isHaloHalo !== undefined && c.isHaloHalo !== target.isHaloHalo) return false;
          if (target.cardWord && c.word !== target.cardWord) return false;
          if (target.cardPrompt && c.prompt !== target.cardPrompt) return false;
          return true;
        });
        if (!card) return null;
        return `[data-tutorial-target="card-${card.id}"]`;
      }
    }
    return null;
  }

  /** Where the speech card should sit on screen. Two-pass rule:
   *   1. Any step that requires the player to ACT (has an expect matcher) needs the
   *      human's hand visible — the hand sits at the bottom, so put the card at the
   *      top. This covers playCard / slamBase / draw / snapPlay.
   *   2. For pure-narrative / demo steps, position the card AWAY from the spotlight
   *      so the highlighted element stays visible.
   *  Derived synchronously from the step definition so it lands correctly on the first
   *  render without racing CardFan's re-render. */
  const cardPosition = computed<'top' | 'bottom'>(() => {
    const step = currentStep.value;
    if (!step) return 'bottom';
    if (step.expect) {
      // The user is about to interact with their hand — keep the hand area clear.
      return 'top';
    }
    const target = step.spotlight ?? null;
    if (!target) return 'bottom';
    switch (target.kind) {
      case 'card-in-hand':
        return 'top';
      case 'seat':
        return target.seatIndex === 0 ? 'top' : 'bottom';
      case 'deck':
      case 'base':
        return 'bottom';
      case 'selector':
        return 'bottom';
    }
    return 'bottom';
  });

  // ----- Game event listener (separate from useGame's) -----
  const unsubGame = opts.game.value.on((e) => {
    if (phase.value === 'demo' && awaitResolver) {
      // The demo block may be waiting for a specific event (e.g. a chain bounce).
      // The resolver itself decides whether to consume this event.
      awaitResolver(e);
      return;
    }
    if (phase.value === 'awaiting-input' && active.value) {
      const step = currentStep.value;
      if (step && matchExpect(step.expect, e, opts.game.value)) {
        // Clear hint timer + advance after the flight settles. Pause the controller
        // immediately so its post-play scheduleNext() doesn't fire an AI tick during
        // the brief window before runCurrentStep() pauses again.
        clearHintTimer();
        if (opts.controller.value.getStatus() === 'running') {
          opts.controller.value.pause();
        }
        void onExpectSatisfied();
      }
    }
  });

  // ----- Flight settling helper -----
  // `pendingFlights` from useGame is append-only (GameTable doesn't pop after dispatch),
  // so length-based settling never resolves. We just sleep a fixed duration that's long
  // enough for the typical flight (~600ms baseline) to land before the next step starts
  // mutating state. The engine is authoritative; if the visual is slightly out of sync
  // for a frame the next step's setup() will re-pin everything.
  const FLIGHT_SETTLE_MS = 700;
  function waitForFlightsSettled(graceMs = FLIGHT_GRACE_MS): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, FLIGHT_SETTLE_MS + graceMs));
  }

  // ----- Hint -----
  function clearHintTimer() {
    hintVisible.value = false;
    if (hintTimer !== null) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
  }
  function startHintTimer() {
    clearHintTimer();
    const step = currentStep.value;
    if (!step?.hint) return;
    hintTimer = window.setTimeout(() => {
      hintVisible.value = true;
    }, HINT_DELAY_MS);
  }

  // ----- Step lifecycle -----
  async function runCurrentStep() {
    const step = currentStep.value;
    if (!step) return;
    phase.value = 'intro';
    clearHintTimer();
    // Defensive: re-apply strict prompts OFF in case useGame's async preference load
    // resolved between setup and now (or any other code path turned it on).
    forceStrictPromptsOff();

    // Pause the simulation controller while we set up and run scripted demo moves —
    // we don't want it scheduling AI ticks that conflict with the script. The
    // controller will be started again before awaiting-input so useGame's submit gate
    // (which requires status === 'running') accepts the human's play.
    const status = opts.controller.value.getStatus();
    if (status !== 'paused' && status !== 'idle') {
      opts.controller.value.pause();
    }

    // Run setup (engine state mutation) then trigger ref so UI reflows.
    if (step.setup) {
      step.setup(opts.game.value);
      triggerRef(opts.game);
    }

    // Run demo (scripted moves) with the controller paused so it doesn't double-play.
    if (step.demo) {
      phase.value = 'demo';
      try {
        await step.demo(opts.game.value);
      } catch (err) {
        console.warn('[tutorial] demo failed', err);
      }
      await waitForFlightsSettled();
    }

    if (step.expect) {
      // Awaiting human input — start the controller so useGame's status === 'running'
      // gate passes for the human's submit calls. The controller's tick() is a no-op
      // when the active seat is human (Game.players[activeSeat].isAI === false), so
      // it doesn't trigger any auto-play during the human's turn.
      phase.value = 'awaiting-input';
      const s = opts.controller.value.getStatus();
      if (s === 'idle' || s === 'paused') {
        opts.controller.value.start();
      }
      startHintTimer();
    } else {
      // Narrative step — keep the controller paused (likely already is, from the
      // demo's pause). The previous step's last play queued a scheduleNext() that
      // would otherwise have the AI auto-play through the rest of the round while
      // the user reads. PauseOverlay is suppressed in tutorial mode (PlayView gates
      // on !isTutorial) so paused state shows nothing on screen.
      phase.value = 'intro';
    }
  }

  async function onExpectSatisfied() {
    // Wait for any in-flight cards from the satisfying play to land before we move on.
    await waitForFlightsSettled();
    advance();
  }

  function advance() {
    clearHintTimer();
    awaitResolver = null;
    if (currentStepIndex.value >= steps.length - 1) {
      complete();
      return;
    }
    currentStepIndex.value += 1;
    void runCurrentStep();
  }

  function complete() {
    phase.value = 'done';
    active.value = false;
    saveTutorialCompletion(opts.mode);
  }

  function nextNarrative() {
    const step = currentStep.value;
    if (!step) return;
    // Only valid during 'intro' phase on a narrative step (canSkipForward or no expect).
    if (phase.value !== 'intro') return;
    if (!step.canSkipForward) return;
    advance();
  }

  function skipStep() {
    const step = currentStep.value;
    if (!step) return;
    if (phase.value !== 'awaiting-input') return;
    const canonical = canonicalActionFor(step, opts.game.value, opts.mode);
    if (!canonical) return;
    // Snap requires a draw first so pendingSnapDraw is set, THEN the snap-play.
    if (step.expect?.kind === 'snapPlay') {
      opts.game.value.submitVersusAction(canonical.playerId, { type: 'draw' });
      opts.game.value.submitVersusAction(canonical.playerId, canonical.action as import('@/game/types').VersusAction);
      return;
    }
    // Fire the canonical action via the same submit API the player would use.
    if (canonical.mode === 'solo') {
      opts.game.value.submitSoloAction(canonical.action as import('@/game/types').SoloAction);
    } else {
      opts.game.value.submitVersusAction(canonical.playerId, canonical.action as import('@/game/types').VersusAction);
    }
    // The listener will see the resulting event and advance via matchExpect.
  }

  function quit() {
    clearHintTimer();
    active.value = false;
    awaitResolver = null;
    unsubGame();
  }

  onUnmounted(() => {
    clearHintTimer();
    unsubGame();
  });

  // Kick off the first step on mount.
  void runCurrentStep();

  return {
    steps: shallowRef(steps),
    currentStepIndex,
    currentStep,
    spotlightSelector,
    cardPosition,
    phase,
    active,
    hintVisible,
    nextNarrative,
    skipStep,
    quit,
    /** Read-only: total number of steps. */
    total: steps.length,
  };
}
