<script setup lang="ts">
/**
 * Rendered "How to Play" body — used inside the desktop flip-card and the mobile modal.
 * Container queries scale text by card width via .guide-front in GuideCard.vue.
 */
defineProps<{ mode?: 'solo' | 'versus' | 'playground' }>();
</script>

<template>
  <!-- ============== SOLO RULES ============== -->
  <div v-if="mode === 'solo'" class="guide-grid">
    <div class="left-col">
      <h2 class="guide-title">Solo · Time Attack</h2>

      <section class="section">
        <h3>Goal</h3>
        <p>Empty your hand AND the draw pile as fast as possible. Best time persists on this device.</p>
      </section>

      <section class="section">
        <h3>Bases</h3>
        <p>Two physical bases sit in the centre: <strong>Left</strong> and <strong>Right</strong>. Each card's prompt dictates which base accepts it.</p>
      </section>

      <section class="section">
        <h3>How to Play</h3>
        <p><strong>Drag</strong> a card toward a base to slam it. <strong>Drag back to centre</strong> to cancel. <strong>Click the deck</strong> to draw a card.</p>
      </section>

      <section class="section">
        <h3>Card Prompts</h3>
        <ul class="cards-list">
          <li>
            <img src="/cards/chik-left.png" alt="Left" class="mini-card" />
            <p><strong>Left</strong> — slam on the Left base only.</p>
          </li>
          <li>
            <img src="/cards/chik-right.png" alt="Right" class="mini-card" />
            <p><strong>Right</strong> — slam on the Right base only.</p>
          </li>
          <li>
            <img src="/cards/chik-free.png" alt="Free" class="mini-card" />
            <p><strong>Free</strong> — slam on either base.</p>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>Penalties (+2s each)</h3>
        <p>
          <strong>Wrong base</strong> — slamming a Left card on Right or vice versa.<br />
          <strong>Wrong beat</strong> — the card's chant word doesn't match the current beat.<br />
          <strong>Unnecessary draw</strong> — clicking the deck while you have a legal play in hand.
        </p>
      </section>

      <section class="section">
        <h3>Opening</h3>
        <p>The <strong class="hi-high">Halo-Halo Chik</strong> opens the game on the first Chik beat. Until you slam it, no other card is legal.</p>
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

  <!-- ============== VERSUS RULES ============== -->
  <div v-else class="guide-grid">
    <div class="left-col">
      <h2 class="guide-title">Versus · Turn-based</h2>

      <section class="section">
        <h3>Goal</h3>
        <p>Be the first to empty your hand. Every card you play sits in front of an opponent — its <strong>prompt</strong> dictates how they must respond on their turn.</p>
      </section>

      <section class="section">
        <h3>How to Play</h3>
        <p><strong>Drag</strong> a card toward an opponent's seat — legal targets glow. <strong>Drag back</strong> to cancel. <strong>Click the deck</strong> to draw if you can't play.</p>
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
            <p><strong>Snap</strong> — drawing this matching the beat lets you play it immediately.</p>
          </li>
          <li>
            <img src="/cards/chik-off-deck.png" alt="Fetch" class="mini-card" />
            <p><strong>Fetch</strong> — forced draws come from the Fetch owner's hand, not the pile.</p>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>The Chain</h3>
        <p>If your card forces the target to draw, you get an <strong>immediate bonus turn</strong>. The chain ends when a target plays successfully OR you draw.</p>
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
