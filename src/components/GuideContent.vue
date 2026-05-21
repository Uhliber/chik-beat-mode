<script setup lang="ts">
/**
 * Rendered "How to Play" body — used inside the desktop flip-card, the mobile modal,
 * and the settings-panel "How to play" overlay. The component owns its own typography
 * and layout styles (via container queries on `.guide-grid`) so it renders identically
 * wherever it's mounted; the host only needs to provide a sized, cream-soft surface.
 */
defineProps<{
  mode?: 'solo' | 'versus' | 'playground';
  /** When true, render a "Start tutorial" CTA at the top of the body. */
  supportsTutorial?: boolean;
  /** When true, the CTA flips to "Replay tutorial". */
  tutorialCompleted?: boolean;
}>();

defineEmits<{
  (e: 'start-tutorial'): void;
}>();
</script>

<template>
  <!-- ============== SOLO RULES ============== -->
  <div v-if="mode === 'solo'" class="guide-grid">
    <div class="left-col">
      <h2 class="guide-title">Solo · Time Attack</h2>
      <button
        v-if="supportsTutorial"
        type="button"
        class="tutorial-cta"
        :class="{ 'is-completed': tutorialCompleted }"
        @click.stop="$emit('start-tutorial')"
      >
        <span class="tutorial-cta-label">{{ tutorialCompleted ? 'Replay tutorial' : 'Start tutorial' }}</span>
        <span v-if="tutorialCompleted" class="tutorial-cta-check" aria-hidden="true">✓</span>
      </button>

      <section class="section">
        <h3>Goal</h3>
        <p>Empty your hand AND the draw pile as fast as possible. Best time persists on this device.</p>
      </section>

      <section class="section">
        <h3>The Prompt</h3>
        <p>Two physical bases sit in the centre: <strong>Left</strong> and <strong>Right</strong>. The most recently slammed card sits on top of one of them — that's the <strong class="hi-high">Prompt</strong> (marked with a "PROMPT" label and a glowing ring). Its direction decides where your NEXT card may land.</p>
      </section>

      <section class="section">
        <h3>How to Play</h3>
        <p>Each turn, in order:</p>
        <p>
          <strong>1.</strong> Find a card in your hand whose word matches the current <em>chant beat</em>.<br />
          <strong>2.</strong> Drag it onto the base allowed by the current Prompt:
        </p>
        <ul class="cards-list">
          <li>
            <img src="/cards/chik-left.png" alt="Left prompt" class="mini-card" />
            <p>Prompt is <strong>Left</strong> → slam on the Left base.</p>
          </li>
          <li>
            <img src="/cards/chik-right.png" alt="Right prompt" class="mini-card" />
            <p>Prompt is <strong>Right</strong> → slam on the Right base.</p>
          </li>
          <li>
            <img src="/cards/chik-free.png" alt="Free prompt" class="mini-card" />
            <p>Prompt is <strong>Free</strong> → either base works.</p>
          </li>
        </ul>
        <p><strong>3.</strong> Drag back to centre to cancel a slam in progress. If no beat-matching card is in hand, <strong>click the deck</strong> to draw.</p>
        <p>The card you just played becomes the new Prompt — its own type (Left/Right/Free) sets the next direction.</p>
      </section>

      <section class="section">
        <h3>Penalties (+2s each)</h3>
        <p>
          <strong>Wrong base</strong> — slamming on a base the current Prompt doesn't allow.<br />
          <strong>Wrong beat</strong> — the card's word doesn't match the current beat.<br />
          <strong>Unnecessary draw</strong> — clicking the deck while a beat-matching card is in your hand.
        </p>
      </section>

      <section class="section">
        <h3>Opening</h3>
        <p>The <strong class="hi-high">Halo-Halo Chik</strong> opens the game on the first Chik beat. It's Free, so it can land on either base. Until you slam it, no other card is legal.</p>
      </section>
    </div>

    <div class="right-col">
      <h2 class="chant-title">The Chant</h2>
      <div class="chant-list">
        <span class="chant-word word-chik">Chik</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-wally">Wally</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-hindo">Hindo</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-pop">Pop</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-tambo">Tambo</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-riki">Riki</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-chik">Chik</span>
        <span class="chant-loop">↻ loops</span>
      </div>
    </div>
  </div>

  <!-- ============== VERSUS / PLAYGROUND RULES ============== -->
  <div v-else class="guide-grid">
    <div class="left-col">
      <h2 class="guide-title">
        {{ mode === 'playground' ? 'Playground · Sandbox' : 'Versus · Turn-based' }}
      </h2>
      <button
        v-if="supportsTutorial"
        type="button"
        class="tutorial-cta"
        :class="{ 'is-completed': tutorialCompleted }"
        @click.stop="$emit('start-tutorial')"
      >
        <span class="tutorial-cta-label">{{ tutorialCompleted ? 'Replay tutorial' : 'Start tutorial' }}</span>
        <span v-if="tutorialCompleted" class="tutorial-cta-check" aria-hidden="true">✓</span>
      </button>

      <section class="section">
        <h3>Goal</h3>
        <p>Be the first to empty your hand. Every card you play sits in front of an opponent — its <strong>prompt</strong> dictates how they must respond on their turn.</p>
      </section>

      <section class="section">
        <h3>How to Play</h3>
        <p>On your turn, in order:</p>
        <p>
          <strong>1.</strong> Check your prompt — the card stacked in front of you. Its type (Left / Right / Free / Stop / Snap / Fetch) dictates which opponents are legal targets.<br />
          <strong>2.</strong> Drag a beat-matching card onto a legal seat (legal seats glow). Drag back to centre to cancel.<br />
          <strong>3.</strong> If no legal play exists, click the deck to draw — your turn ends.
        </p>
        <p>Whatever card you play becomes the recipient's new prompt.</p>
      </section>

      <section class="section">
        <h3>Prompts</h3>
        <ul class="cards-list">
          <li>
            <img src="/cards/chik-left.png" alt="Left" class="mini-card" />
            <p><strong>Left / Right</strong> — recipient must play their next card to that neighbour.</p>
          </li>
          <li>
            <img src="/cards/chik-free.png" alt="Free" class="mini-card" />
            <p><strong>Free</strong> — recipient may play in front of anyone.</p>
          </li>
          <li>
            <img src="/cards/chik-block.png" alt="Stop" class="mini-card" />
            <p><strong>Stop</strong> — recipient skips their turn and draws.</p>
          </li>
          <li>
            <img src="/cards/chik-snap.png" alt="Snap" class="mini-card" />
            <p><strong>Snap</strong> — if you DRAW this on a matching beat, play it immediately on your left or right neighbour (overrides Stop).</p>
          </li>
          <li>
            <img src="/cards/chik-off-deck.png" alt="Fetch" class="mini-card" />
            <p><strong>Fetch</strong> — when the recipient must draw, they pull from the Fetch player's hand instead of the deck. Draining that hand to zero is an instant win for the Fetch player.</p>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>The Chain</h3>
        <p>If your card forces the target to draw, you get an <strong>immediate bonus turn</strong>. The chain ends when a target plays successfully OR you draw.</p>
      </section>

      <section class="section">
        <h3>Strict Prompts (optional)</h3>
        <p>Toggle on in Settings to attempt any play — illegal moves still land, but you draw a +1 penalty card. Lets you experiment instead of being blocked.</p>
      </section>

      <section v-if="mode === 'playground'" class="section">
        <h3>Sandbox · Configurable Deck</h3>
        <p>Playground is Versus with two extra knobs in Settings:</p>
        <p>
          <strong>Deck composition</strong> — set how many of each prompt type are in the deck (0 to 42 per prompt, Free has a 7-card floor).<br />
          <strong>Hand size</strong> — 3 to 14 starting cards per player.
        </p>
        <p>All other Versus rules still apply.</p>
      </section>
    </div>

    <div class="right-col">
      <h2 class="chant-title">The Chant</h2>
      <div class="chant-list">
        <span class="chant-word word-chik">Chik</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-wally">Wally</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-hindo">Hindo</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-pop">Pop</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-tambo">Tambo</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-riki">Riki</span>
        <span class="chant-list-arrow">↓</span>
        <span class="chant-word word-chik">Chik</span>
        <span class="chant-loop">↻ loops</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * The component's root container. `container-type: inline-size` lets every nested
 * font-size / spacing rule scale with the host surface's width via `cqw` units, so the
 * same markup looks correct in the desktop flip-card preview, the desktop hovered/full
 * size, the mobile modal, and the settings-panel overlay.
 */
.guide-grid {
  container-type: inline-size;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 2.4cqw;
  padding: 2.4cqw 2.6cqw 2cqw;
  overflow: auto;
  color: #3a2a1f;
  font-family: var(--font-body);
  text-align: left;
  /* Hide scrollbar visually — keep scroll capability for taller content. */
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.guide-grid::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.left-col,
.right-col {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.guide-title,
.chant-title {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 6cqw;
  line-height: 1;
  color: var(--color-coral);
  text-transform: uppercase;
  margin: 0 0 2.5cqw;
  padding-bottom: 1.4cqw;
  border-bottom: 0.5cqw solid var(--color-coral);
  letter-spacing: 0.02em;
}

.section {
  margin-bottom: 1.4cqw;
}

.section h3 {
  font-family: var(--font-display);
  font-size: 3.4cqw;
  font-weight: 700;
  color: var(--color-coral-deep);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 0.6cqw;
  line-height: 1;
}

.section p {
  font-size: 2.65cqw;
  line-height: 1.35;
  margin: 0;
}

.section strong {
  font-weight: 700;
  color: #2a1d12;
}

.section em {
  font-style: italic;
  color: var(--color-coral-deep);
}

.hi-high {
  color: var(--color-coral);
}

/* Special-cards list */
.cards-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1cqw;
}
.cards-list li {
  display: flex;
  align-items: center;
  gap: 1.6cqw;
}
.mini-card {
  width: 7cqw;
  height: auto;
  flex-shrink: 0;
  border-radius: 0.6cqw;
  box-shadow: 0 0.3cqw 0.6cqw rgba(0, 0, 0, 0.18);
}
.cards-list p {
  margin: 0;
  font-size: 2.5cqw;
  line-height: 1.3;
  flex: 1;
}

/* Right column — chant list */
.chant-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 0.4cqw;
}

.chant-word {
  font-family: var(--font-display);
  font-size: 6cqw;
  font-weight: 800;
  text-transform: uppercase;
  line-height: 1;
  color: var(--word-color);
  letter-spacing: 0.02em;
}

.chant-list-arrow {
  font-size: 3.6cqw;
  color: var(--color-coral);
  font-weight: 800;
  line-height: 1;
  margin: -0.4cqw 0;
  opacity: 0.65;
}

.chant-loop {
  margin-top: 1.5cqw;
  font-size: 2.5cqw;
  color: rgba(60, 40, 30, 0.45);
  font-style: italic;
}

/* Tutorial CTA — pinned at the top of the guide body, prominent enough to act as a
 * "primary action" pill but visually distinct from the rules sections. */
.tutorial-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1cqw;
  width: 100%;
  margin: 0 0 2.5cqw;
  padding: 1.8cqw 2.5cqw;
  border: 0;
  border-radius: 9999px;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 3cqw;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  box-shadow: 0 1cqw 2cqw rgba(231, 89, 61, 0.3);
  transition: transform 120ms ease, background-color 120ms ease;
}
.tutorial-cta:hover { background: var(--color-coral-deep); }
.tutorial-cta:active { transform: scale(0.97); }
.tutorial-cta.is-completed {
  background: rgba(231, 89, 61, 0.14);
  color: var(--color-coral-deep);
  box-shadow: none;
}
.tutorial-cta-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3.6cqw;
  height: 3.6cqw;
  border-radius: 9999px;
  background: var(--color-coral);
  color: var(--color-cream-soft);
  font-size: 2.4cqw;
  font-weight: 800;
}
</style>
