<script setup lang="ts">
/**
 * Rendered "How to Play" body, used inside the desktop flip-card, the mobile modal,
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
        <p>Two physical bases sit in the centre: <strong>Left</strong> and <strong>Right</strong>. The most recently slammed card sits on top of one of them, that's the <strong class="hi-high">Prompt</strong> (marked with a "PROMPT" label and a glowing ring). Its direction decides where your NEXT card may land.</p>
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
        <p><strong>3.</strong> Drag back to centre to cancel a slam in progress. If no beat-matching card is in hand, <strong>click the deck</strong><span class="desktop-only"> (or press <kbd class="guide-kbd">D</kbd>)</span> to draw.</p>
        <p>The card you just played becomes the new Prompt, its own type (Left/Right/Free) sets the next direction.</p>
        <p class="hint-line desktop-only">Tip: the <kbd class="guide-kbd">D</kbd> draw shortcut can be turned off in Settings → Display.</p>
      </section>

      <section class="section">
        <h3>Penalties (+2s each)</h3>
        <p>
          <strong>Wrong base</strong>, slamming on a base the current Prompt doesn't allow.<br />
          <strong>Wrong beat</strong>, the card's word doesn't match the current beat.<br />
          <strong>Unnecessary draw</strong>, clicking the deck while a beat-matching card is in your hand.
        </p>
        <p>Every penalty also <strong>breaks your combo</strong> (next section), so accuracy compounds.</p>
      </section>

      <section class="section">
        <h3>Combo Streak (bonuses)</h3>
        <p>Each legal slam pulses the <strong>Combo ×N</strong> bar at the bottom of the screen. The bar fills on every slam and drains over ~3 seconds, so consecutive slams stack a streak. When the streak ends (you wait too long, take a penalty, or finish the round) it cashes in based on how high it climbed:</p>
        <ul class="cards-list combo-list">
          <li><span class="combo-pip is-tier-1">×3–5</span><p>-1 second</p></li>
          <li><span class="combo-pip is-tier-2">×6–9</span><p>-2 seconds</p></li>
          <li><span class="combo-pip is-tier-3">×10+</span><p>-3 seconds</p></li>
        </ul>
        <p>Past ×10 you're in <strong>overflow</strong>: every additional 5 slams instantly drips a further -1s into the clock, no cap. A clean 25-slam run cashes in -3s + -3s (three drips at 15/20/25) for -6s total. Your highest combo ever is saved as "Top ×N" beside Best.</p>
      </section>

      <section class="section">
        <h3>Chant Chik Closer (-1s)</h3>
        <p>Half the Chik cards in the deck are <strong class="hi-high">Chant Chiks</strong>, same Chik beat, just with a darker background. If you slam one as the <strong>closing Chik</strong> of a full chant cycle (Wally→Riki→Chik), you bank an instant -1s on top of whatever your combo will cash in. Stack closers AND combos for the fastest runs.</p>
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
        <p>Be the first to empty your hand. Every card you play sits in front of an opponent, its <strong>prompt</strong> dictates how they must respond on their turn.</p>
      </section>

      <section class="section">
        <h3>How to Play</h3>
        <p>On your turn, in order:</p>
        <p>
          <strong>1.</strong> Check your prompt, the card stacked in front of you. Its type (Left / Right / Free / Stop / Snap / Fetch) dictates which opponents are legal targets.<br />
          <strong>2.</strong> Drag a beat-matching card onto a legal seat (legal seats glow). Drag back to centre to cancel.<br />
          <strong>3.</strong> If no legal play exists, click the deck<span class="desktop-only"> (or press <kbd class="guide-kbd">D</kbd>)</span> to draw, your turn ends.
        </p>
        <p>Whatever card you play becomes the recipient's new prompt.</p>
        <p class="hint-line desktop-only">Tip: the <kbd class="guide-kbd">D</kbd> draw shortcut can be turned off in Settings → Display. If the deck is empty, pressing <kbd class="guide-kbd">D</kbd> simply passes your turn.</p>
      </section>

      <section class="section">
        <h3>Prompts</h3>
        <ul class="cards-list">
          <li>
            <img src="/cards/chik-left.png" alt="Left" class="mini-card" />
            <p><strong>Left / Right</strong>, recipient must play their next card to that neighbour.</p>
          </li>
          <li>
            <img src="/cards/chik-free.png" alt="Free" class="mini-card" />
            <p><strong>Free</strong>, recipient may play in front of anyone.</p>
          </li>
          <li>
            <img src="/cards/chik-block.png" alt="Stop" class="mini-card" />
            <p><strong>Stop</strong>, recipient skips their turn and draws.</p>
          </li>
          <li>
            <img src="/cards/chik-snap.png" alt="Snap" class="mini-card" />
            <p><strong>Snap</strong>, if you DRAW this on a matching beat, play it immediately on your left or right neighbour (overrides Stop).</p>
          </li>
          <li>
            <img src="/cards/chik-off-deck.png" alt="Fetch" class="mini-card" />
            <p><strong>Fetch</strong>, when the recipient must draw, they pull from the Fetch player's hand instead of the deck. Draining that hand to zero is an instant win for the Fetch player.</p>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>The Chain</h3>
        <p>If your card forces the target to draw, you get an <strong>immediate bonus turn</strong>. The chain ends when a target plays successfully OR you draw.</p>
      </section>

      <section class="section">
        <h3>Setup · Claim Your Beats</h3>
        <p>Before the first card is played, every seat claims one of the six chant beats, <span class="word-chik">Chik</span>, <span class="word-wally">Wally</span>, <span class="word-hindo">Hindo</span>, <span class="word-pop">Pop</span>, <span class="word-tambo">Tambo</span>, <span class="word-riki">Riki</span>. The Halo-Halo holder picks first and play proceeds clockwise. In a 3-player game every seat picks twice (a round, then a second round). Owning a beat earns you the <strong>Chant Power</strong> if the Chant Trigger ever lands on your beat.</p>
      </section>

      <section class="section">
        <h3>Counts</h3>
        <p>Every card carries a <strong>count</strong> (0 to 10), shown in a small circular badge beside each player's active prompt. They're dormant most of the round, they only matter when a <strong>Chant Trigger</strong> fires (next section). You can resize or hide the badge in <em>Settings → Display → Prompt info badge</em>.</p>
      </section>

      <section class="section">
        <h3>The Chant Chik</h3>
        <ul class="cards-list">
          <li>
            <img src="/new/free-chant-chik-5.png" alt="Chant Chik" class="mini-card" />
            <p>Eight of the sixteen Chik cards in the deck are <strong>Chant Chiks</strong>, same Chik beat, just with a darker background. They play like normal Chiks <em>except</em> when one lands as the closing Chik of a full chant, then the <strong>Chant Trigger</strong> fires.</p>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>The Chant Trigger</h3>
        <p>When a Chant Chik closes the chant, the table dims and a lottery banner appears:</p>
        <p>
          <strong>1.</strong> Sum the <strong>counts</strong> of every player's current active prompt (including the Chant Chik that just landed).<br />
          <strong>2.</strong> Starting from the seat that just received the Chant Chik, recite the chant clockwise one beat per count.<br />
          <strong>3.</strong> Whichever beat the recital lands on, that beat's <strong>owner</strong> wins the Chant Power.
        </p>
        <p>If the recital lands on the opening Chik (a special non-claimable beat) or an unclaimed beat (in 4–5 player games where some beats stay unowned), no one wins, play simply resumes.</p>
      </section>

      <section class="section">
        <h3>The Chant Power</h3>
        <p>The winning beat-owner may <strong>give up to 3 cards</strong> from their hand to any other players (split however they like). Then play resumes from the Chant Chik recipient with the Chant Chik as their prompt.</p>
        <p>Edge case: if giving cards away empties the winner's hand, they win the game instantly.</p>
      </section>

      <section class="section">
        <h3>Strict Prompts (optional)</h3>
        <p>Toggle on in Settings to attempt any play, illegal moves still land, but you draw a +1 penalty card. Lets you experiment instead of being blocked.</p>
      </section>

      <section v-if="mode === 'playground'" class="section">
        <h3>Sandbox · Configurable Deck</h3>
        <p>Playground is Versus with two extra knobs in Settings:</p>
        <p>
          <strong>Deck composition</strong>, set how many of each prompt type are in the deck (0 to 42 per prompt, Free has a 7-card floor).<br />
          <strong>Hand size</strong>, 3 to 14 starting cards per player.
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
  /* Hide scrollbar visually, keep scroll capability for taller content. */
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

/* Right column, chant list */
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

/* Tutorial CTA, pinned at the top of the guide body, prominent enough to act as a
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

/* Keyboard shortcut pip inline in body copy, looks like a key cap. */
.guide-kbd {
  display: inline-block;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 700;
  font-size: 2.2cqw;
  padding: 0.2cqw 0.9cqw;
  margin: 0 0.2cqw;
  border-radius: 0.7cqw;
  background: rgba(60, 40, 30, 0.08);
  color: var(--color-coral-deep);
  box-shadow: inset 0 -0.4cqw 0 rgba(0, 0, 0, 0.08);
}
.hint-line {
  margin-top: 0.6cqw !important;
  font-size: 2.35cqw !important;
  color: rgba(60, 40, 30, 0.55) !important;
  font-style: italic;
}
/* Combo streak ladder, small coloured pips next to each tier label. Sizing
 * mirrors the mini-card slot so a tier row reads at the same rhythm as a
 * prompt row above it. */
.cards-list.combo-list li {
  align-items: center;
}
.combo-pip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* `min-width` (not `width`) so the pill grows to fit "×10+" without breaking,
   * `white-space: nowrap` so the label never wraps to a second line inside the
   * pill. The previous fixed `width: 7cqw` was narrower than the label at the
   * narrow container widths the guide renders in (mobile + side-panel). */
  min-width: 7cqw;
  height: 4.4cqw;
  padding: 0 1.4cqw;
  border-radius: 9999px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-weight: 800;
  font-size: 2.4cqw;
  color: var(--color-cream-soft);
  background: var(--color-coral);
  box-shadow: 0 0.3cqw 0.6cqw rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 1;
}
.combo-pip.is-tier-1 { background: var(--color-wally); }
.combo-pip.is-tier-2 { background: var(--color-coral); }
.combo-pip.is-tier-3 {
  background: var(--color-coral-deep);
  box-shadow:
    0 0.3cqw 0.6cqw rgba(0, 0, 0, 0.18),
    0 0 1.4cqw rgba(232, 90, 79, 0.45);
}
/* Hide keyboard-shortcut hints on mobile, the D shortcut is desktop-only. */
@media (max-width: 767px) {
  .desktop-only {
    display: none !important;
  }
}
</style>
