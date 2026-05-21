<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useBeatAudio } from '@/composables/useBeatAudio';
import { FLAGS } from '@/config/flags';
import { loadTutorialCompletion, type TutorialMode } from '@/tutorial/persistence';

const router = useRouter();
const { fx } = useBeatAudio();

/** Tutorial-completion state. Loaded once on mount so the start buttons can
 *  decide whether to offer the tutorial first or jump straight to play. */
const tutorialCompleted = ref<{ solo: boolean; versus: boolean }>({ solo: false, versus: false });
onMounted(async () => {
  tutorialCompleted.value = await loadTutorialCompletion();
});

/** Session-only dismissal so the offer doesn't re-pop within the same session
 *  if the player skipped it. Cleared on reload (sessionStorage). Survives until
 *  the player either completes the tutorial (permanent) or refreshes. */
const SESSION_DISMISS_KEY = (mode: TutorialMode) => `chik-tutorial-offer-dismissed-${mode}`;
function isOfferDismissedThisSession(mode: TutorialMode): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try { return sessionStorage.getItem(SESSION_DISMISS_KEY(mode)) === '1'; } catch { return false; }
}
function dismissOfferForSession(mode: TutorialMode): void {
  if (typeof sessionStorage === 'undefined') return;
  try { sessionStorage.setItem(SESSION_DISMISS_KEY(mode), '1'); } catch { /* swallow */ }
}

/** Modal state. `null` = no offer shown. Set to a mode to surface the offer. */
const pendingOfferMode = ref<TutorialMode | null>(null);

function attemptStart(mode: TutorialMode) {
  fx('tap');
  // Offer the tutorial if the player has never completed it for this mode AND
  // they haven't dismissed the offer in this session.
  if (!tutorialCompleted.value[mode] && !isOfferDismissedThisSession(mode)) {
    pendingOfferMode.value = mode;
    return;
  }
  navigateToPlay(mode, false);
}

function navigateToPlay(mode: TutorialMode | 'playground', withTutorial: boolean) {
  router.push({
    name: 'play',
    query: withTutorial ? { mode, tutorial: '1' } : { mode },
  });
}

function acceptTutorialOffer() {
  fx('tap');
  const mode = pendingOfferMode.value;
  if (!mode) return;
  pendingOfferMode.value = null;
  navigateToPlay(mode, true);
}
function skipTutorialOffer() {
  fx('tap');
  const mode = pendingOfferMode.value;
  if (!mode) return;
  dismissOfferForSession(mode);
  pendingOfferMode.value = null;
  navigateToPlay(mode, false);
}

function startSolo() {
  attemptStart('solo');
}
function startVersus() {
  attemptStart('versus');
}
function startPlayground() {
  fx('tap');
  // Playground has no tutorial; jump straight in.
  router.push({ name: 'play', query: { mode: 'playground' } });
}
function openSettings() {
  fx('tap');
  router.push({ name: 'settings' });
}

/** Marketing site for the physical card game. Keep in sync with `siteUrl` in
 *  halohalogames.com/apps/chik-marketing/nuxt.config.ts. */
const CHIK_WEBSITE_URL = 'https://chik.halohalogames.com';
function visitChikSite() {
  fx('tap');
  window.open(CHIK_WEBSITE_URL, '_blank', 'noopener,noreferrer');
}

/** Welcome-card "Read more" → modal on mobile. The full copy + sim-only
 *  disclaimer reads fine on desktop where the card has horizontal room (mockup
 *  left, copy right), but on phones the stacked layout pushes the play buttons
 *  off-screen if all the copy is inline. Solution: keep mobile card compact
 *  (title + lead + CTA + "Read more"), and surface the rest in a modal when
 *  the player taps Read more. Desktop never opens the modal because the
 *  inline copy is already visible there. */
const welcomeModalOpen = ref(false);
function openWelcomeModal() {
  fx('tap');
  welcomeModalOpen.value = true;
}
function closeWelcomeModal() {
  fx('tap');
  welcomeModalOpen.value = false;
}
</script>

<template>
  <div
    class="fixed inset-0 flex flex-col items-center"
    style="background: var(--color-coral); height: 100dvh; overflow-y: auto;"
  >
    <!-- Top: title block -->
    <header class="flex flex-col items-center gap-2 pt-10 px-6 text-center shrink-0">
      <img
        src="/logo-white.svg"
        alt="Chik!"
        class="menu-title menu-stagger"
        style="--stagger-delay: 60ms;"
      />
      <div
        class="font-subtitle text-cream-soft/85 text-sm sm:text-base menu-stagger"
        style="--stagger-delay: 180ms;"
      >
        A Filipino chant card game
      </div>
    </header>

    <!-- Welcome card, sits between the title and play buttons. The mockup PNG of
         the physical card-box pairs with a short note framing this app as a
         simulation companion: try the rules, then back the real game. The "May
         differ" disclaimer is deliberate, Time Attack mode and several UX
         polishes (combo streak, prompt info badges, the D-key draw shortcut,
         etc) don't exist in the physical rulebook. -->
    <section
      class="welcome-card menu-stagger shrink-0"
      style="--stagger-delay: 260ms;"
    >
      <img
        src="/chik-package-mockup.png"
        alt="Chik card game box"
        class="welcome-card-mockup"
      />
      <div class="welcome-card-body">
        <p class="welcome-card-title">A taste before the real deal</p>
        <p class="welcome-card-text welcome-card-lead">
          A digital simulation of the physical Chik card game.
        </p>
        <!-- Desktop: always-visible inline. Mobile: hidden via media query,
             surfaced through the modal instead. -->
        <div class="welcome-card-inline-detail">
          <p class="welcome-card-text">
            Built so you can learn the chant, the prompts, and the new Chant
            Trigger before backing the real cards.
          </p>
          <p class="welcome-card-note">
            A few things here (Time Attack mode, combo streaks, the prompt info
            badge) are simulation-only flourishes to make solo play more
            intuitive. The card game itself is best played with friends around a
            table, where the chant lives loud.
          </p>
        </div>
        <div class="welcome-card-actions">
          <button
            type="button"
            class="welcome-card-cta"
            @click="visitChikSite"
          >
            Get the real game ↗
          </button>
          <button
            type="button"
            class="welcome-card-more"
            @click="openWelcomeModal"
          >
            Read more
          </button>
        </div>
      </div>
    </section>

    <!-- Middle: primary actions. Each item rides its own stagger delay so the menu
         lands one beat at a time, title → tagline → welcome card → Versus AI →
         Solo → Login → footer. Versus AI is the primary play mode; Solo (time
         attack) sits below as a side path with a muted subtitle. -->
    <main class="flex flex-col items-stretch w-full max-w-xs gap-4 px-6 mt-8 mb-auto">
      <button
        type="button"
        class="menu-btn menu-btn-primary menu-stagger"
        style="--stagger-delay: 380ms;"
        @click="startVersus"
      >Versus AI</button>
      <button
        type="button"
        class="menu-btn menu-btn-primary menu-stagger menu-btn-stacked"
        style="--stagger-delay: 480ms;"
        @click="startSolo"
      >
        <span class="menu-btn-label">Solo</span>
        <span class="menu-btn-subtext">Time Attack</span>
      </button>
      <button
        v-if="FLAGS.playgroundEnabled"
        type="button"
        class="menu-btn menu-btn-primary menu-stagger"
        style="--stagger-delay: 580ms;"
        @click="startPlayground"
      >
        Playground
      </button>

      <!-- Login is feature-flagged off in V1 (Phase 2 ships auth). Render disabled so
           the slot is reserved for the eventual button. -->
      <button
        type="button"
        class="menu-btn menu-btn-ghost menu-stagger"
        style="--stagger-delay: 680ms;"
        disabled
        aria-disabled="true"
      >
        Online (soon)
      </button>
    </main>

    <!-- Bottom: settings + version -->
    <footer
      class="flex items-center justify-between w-full px-6 py-6 menu-stagger shrink-0"
      style="--stagger-delay: 800ms;"
    >
      <button
        type="button"
        aria-label="Settings"
        class="w-11 h-11 rounded-full bg-cream-soft/95 ring-1 ring-black/10 flex items-center justify-center text-coral-deep shadow-md"
        @click="openSettings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <span class="font-subtitle text-cream-soft/70 text-xs tracking-wider">v0.1</span>
    </footer>

    <!-- Welcome "Read more" modal. Mobile-only path for the full pitch + sim
         disclaimer (desktop renders the same copy inline inside the card).
         Outside-click on the backdrop closes; explicit close button too. -->
    <Transition name="offer-fade">
      <div
        v-if="welcomeModalOpen"
        class="offer-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        @click.self="closeWelcomeModal"
      >
        <div class="offer-card welcome-modal-card">
          <img
            src="/chik-package-mockup.png"
            alt="Chik card game box"
            class="welcome-modal-mockup"
          />
          <p id="welcome-modal-title" class="offer-title">A taste before the real deal</p>
          <p class="offer-text">
            A digital simulation of the physical Chik card game. Built so you
            can learn the chant, the prompts, and the new Chant Trigger before
            backing the real cards.
          </p>
          <p class="offer-text welcome-modal-note">
            A few things here (Time Attack mode, combo streaks, the prompt info
            badge) are simulation-only flourishes to make solo play more
            intuitive. The card game itself is best played with friends around
            a table, where the chant lives loud.
          </p>
          <div class="offer-actions">
            <button
              type="button"
              class="offer-btn offer-btn-primary"
              @click="visitChikSite"
            >
              Get the real game ↗
            </button>
            <button
              type="button"
              class="offer-btn offer-btn-ghost"
              @click="closeWelcomeModal"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Tutorial offer modal. Shown the first time a player taps Versus AI or Solo
         before completing that mode's tutorial. Dimmed backdrop closes via Skip;
         no outside-click dismiss so the choice is explicit. -->
    <Transition name="offer-fade">
      <div
        v-if="pendingOfferMode"
        class="offer-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-title"
      >
        <div class="offer-card">
          <p id="offer-title" class="offer-title">First time here?</p>
          <p class="offer-text">
            <template v-if="pendingOfferMode === 'solo'">
              The Solo tutorial walks you through the chant, prompts, and combo bonuses in under three minutes.
            </template>
            <template v-else>
              The Versus tutorial covers the chant, prompts, and the new Chant Trigger in about three minutes.
            </template>
            Recommended before your first real round.
          </p>
          <div class="offer-actions">
            <button
              type="button"
              class="offer-btn offer-btn-primary"
              @click="acceptTutorialOffer"
            >
              Start tutorial
            </button>
            <button
              type="button"
              class="offer-btn offer-btn-ghost"
              @click="skipTutorialOffer"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.menu-title {
  height: clamp(3.8rem, 15vw, 6.5rem);
  width: auto;
}
/* Welcome card, cream-tone panel sitting between the title and the play
 * buttons. Horizontal layout: package mockup on the left, copy + CTA on the
 * right. On mobile (≤640px) the layout stacks and the secondary copy collapses
 * behind a "Read more" toggle so the play buttons stay above the fold. */
.welcome-card {
  margin: 1.4rem 1rem 0;
  max-width: 38rem;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 18px;
  padding: 16px 20px;
  border-radius: 20px;
  background: rgba(252, 246, 230, 0.96);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  color: rgb(60, 40, 30);
}
.welcome-card-mockup {
  width: 140px;
  height: auto;
  flex-shrink: 0;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
  /* Box stands a touch tall; nudge it down inside the row for visual balance. */
  transform: translateY(2px);
  transition: width 220ms cubic-bezier(.2, .8, .2, 1);
}
.welcome-card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.welcome-card-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.1rem;
  color: var(--color-coral-deep);
  letter-spacing: 0.02em;
  line-height: 1.1;
  margin: 0;
}
.welcome-card-text {
  font-family: var(--font-body);
  font-size: 0.85rem;
  line-height: 1.4;
  color: rgba(60, 40, 30, 0.88);
  margin: 0;
}
.welcome-card-lead {
  font-weight: 600;
}
.welcome-card-note {
  font-family: var(--font-body);
  font-size: 0.74rem;
  line-height: 1.4;
  color: rgba(60, 40, 30, 0.6);
  font-style: italic;
  margin: 0;
}
/* Desktop inline detail block. Hidden on mobile (the same copy lives in the
 * "Read more" modal there). */
.welcome-card-inline-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.welcome-card-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}
.welcome-card-cta {
  padding: 7px 14px;
  border-radius: 9999px;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-family: var(--font-body);
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow: 0 4px 10px rgba(201, 84, 59, 0.4);
  transition: transform 120ms ease, box-shadow 120ms ease;
  cursor: pointer;
}
.welcome-card-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(201, 84, 59, 0.5);
}
.welcome-card-cta:active {
  transform: translateY(0) scale(0.97);
}
/* "Read more" toggle is mobile-only chrome. Hidden by default; the mobile media
 * query below reveals it and collapses the secondary copy behind it. */
.welcome-card-more {
  display: none;
  background: transparent;
  border: 0;
  padding: 6px 4px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-coral-deep);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Mobile: keep the card COMPACT (no inline expand). Two-column layout with
 * mockup on the left and copy/CTA on the right so we don't burn vertical space
 * stacking. Read more opens a modal with the full pitch + sim disclaimer. */
@media (max-width: 640px) {
  .welcome-card {
    /* Stay horizontal even at phone widths, the modal absorbs the long copy. */
    flex-direction: row;
    align-items: center;
    text-align: left;
    padding: 12px 14px;
    gap: 12px;
    margin: 1rem 0.85rem 0;
  }
  .welcome-card-mockup {
    width: 96px;
    transform: none;
  }
  .welcome-card-title {
    font-size: 0.98rem;
  }
  .welcome-card-text,
  .welcome-card-lead {
    font-size: 0.78rem;
  }
  /* Hide the inline secondary copy on mobile, the modal carries it. */
  .welcome-card-inline-detail {
    display: none;
  }
  /* Show the Read more affordance only on mobile (desktop has the copy
   * inline so the button would be redundant). */
  .welcome-card-more {
    display: inline-block;
  }
  .welcome-card-actions {
    margin-top: 4px;
    gap: 8px;
  }
}

/* Welcome modal: same backdrop+card chrome as the tutorial offer modal
 * (.offer-backdrop / .offer-card), with a mockup at the top and a note line
 * for the sim disclaimer. */
.welcome-modal-card {
  max-width: 28rem;
}
.welcome-modal-mockup {
  display: block;
  margin: 0 auto 14px;
  width: 160px;
  height: auto;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.3));
}
.welcome-modal-note {
  font-size: 0.8rem;
  color: rgba(60, 40, 30, 0.6);
  font-style: italic;
  margin-top: 4px;
}
.menu-btn {
  width: 100%;
  padding: 0.95rem 1.25rem;
  border-radius: 9999px;
  font-family: var(--font-body);
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-size: 0.95rem;
  transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.menu-btn:active:not(:disabled) {
  transform: translateY(1px) scale(0.99);
}
.menu-btn-primary {
  background: var(--color-cream-soft);
  color: var(--color-coral-deep);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
}

/* Stacked-label variant, label on top, muted subtext below. Used by Solo so it
 * reads as "Solo: time attack" without expanding the row's overall height too much. */
.menu-btn-stacked {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding-top: 0.7rem;
  padding-bottom: 0.7rem;
  line-height: 1.05;
}
.menu-btn-label {
  font-size: 0.95rem;
  letter-spacing: 0.12em;
}
.menu-btn-subtext {
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  font-weight: 700;
  text-transform: uppercase;
  color: rgba(201, 84, 59, 0.6);
}
.menu-btn-ghost {
  background: transparent;
  color: var(--color-cream-soft);
  border: 2px solid rgba(252, 246, 230, 0.55);
  opacity: 0.55;
  cursor: not-allowed;
}


/* Stagger entrance: each .menu-stagger fades + slides up a beat after the previous one
   via its own `--stagger-delay` inline style. The disabled Login button keeps its 0.55
   resting opacity (set explicitly in the keyframe terminus) so the cascade doesn't pop
   it back to fully opaque. */
.menu-stagger {
  opacity: 0;
  animation: menu-stagger-in 520ms cubic-bezier(.2, .8, .2, 1) forwards;
  animation-delay: var(--stagger-delay, 0ms);
  will-change: transform, opacity;
}
.menu-btn-ghost.menu-stagger {
  animation-name: menu-stagger-in-ghost;
}
@keyframes menu-stagger-in {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes menu-stagger-in-ghost {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 0.55; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .menu-stagger {
    animation: none;
    opacity: 1;
  }
  .menu-btn-ghost.menu-stagger {
    opacity: 0.55;
  }
}

/* Tutorial-offer modal. Full-screen dimmed backdrop with a centered cream card.
 * No outside-click dismiss, the choice is explicit (Start / Skip). Sits at z-50
 * so it lands above every menu element including the welcome card. */
.offer-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(20, 14, 10, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.offer-card {
  width: 100%;
  max-width: 26rem;
  padding: 22px 22px 20px;
  border-radius: 20px;
  background: var(--color-cream-soft);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.45);
  color: rgb(60, 40, 30);
  text-align: center;
  animation: offer-pop 280ms cubic-bezier(.2, .8, .2, 1);
}
.offer-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.25rem;
  color: var(--color-coral-deep);
  letter-spacing: 0.02em;
  margin: 0 0 8px;
}
.offer-text {
  font-family: var(--font-body);
  font-size: 0.88rem;
  line-height: 1.45;
  color: rgba(60, 40, 30, 0.85);
  margin: 0 0 18px;
}
.offer-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.offer-btn {
  width: 100%;
  padding: 11px 18px;
  border-radius: 9999px;
  font-family: var(--font-body);
  font-weight: 800;
  font-size: 0.88rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.offer-btn-primary {
  background: var(--color-coral);
  color: var(--color-cream-soft);
  box-shadow: 0 6px 14px rgba(201, 84, 59, 0.45);
}
.offer-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(201, 84, 59, 0.55); }
.offer-btn-primary:active { transform: translateY(0) scale(0.98); }
.offer-btn-ghost {
  background: transparent;
  color: rgba(60, 40, 30, 0.7);
  border: 0;
  letter-spacing: 0.08em;
  font-size: 0.78rem;
  padding: 6px 12px;
}
.offer-btn-ghost:hover { color: var(--color-coral-deep); }

@keyframes offer-pop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.offer-fade-enter-active,
.offer-fade-leave-active { transition: opacity 200ms ease; }
.offer-fade-enter-from,
.offer-fade-leave-to { opacity: 0; }
</style>
