<script setup lang="ts">
/**
 * The Vue-rendered "How to Play" body. Used inside both the desktop GuideCard's flip-front
 * (where container queries scale text by card width) and the mobile full-screen modal.
 *
 * Container queries are scoped via `container-type: inline-size` on `.guide-front` in
 * GuideCard.vue's style block — so this component just emits semantic markup.
 */
defineProps<{ mode?: 'simulation' | 'play' | 'solo' }>();
</script>

<template>
  <!-- ============== SOLO RULES ==============
       Different game shape: no chant enforcement, single base, +2s on wrong slams,
       persisted best time. We use the same .guide-grid skeleton so styling is shared. -->
  <div v-if="mode === 'solo'" class="guide-grid">
    <div class="left-col">
      <h2 class="guide-title">Solo · Time Attack</h2>

      <section class="section">
        <h3>Goal</h3>
        <p>Empty the entire 55-card halo as fast as you can. Best time is saved on this device.</p>
      </section>

      <section class="section">
        <h3>How to Play</h3>
        <p><strong>Click or drag</strong> a card → it slams onto the central base.<br />
           A correct card (matches the chant beat) clears from the halo.</p>
      </section>

      <section class="section">
        <h3>Wrong Slams</h3>
        <p>Wrong word → <strong>+2 seconds</strong> on the timer; the card stays in the halo. The chant doesn't move on a miss.</p>
      </section>

      <section class="section">
        <h3>Opening</h3>
        <p>The pulsing <strong class="hi-high">Halo-Halo Chik</strong> opens the game. Pre-open, any click slams it for you.</p>
      </section>

      <section class="section">
        <h3>Special Cards</h3>
        <ul class="cards-list">
          <li>
            <img src="/cards/halohalo-chik.png" alt="Halo-Halo Chik" class="mini-card" />
            <p><strong class="card-name word-chik">Halo-Halo Chik</strong> — opens the run on the first Chik beat.</p>
          </li>
          <li>
            <img src="/cards/chik-reverse.png" alt="Reverse" class="mini-card" />
            <p><strong>Reverse</strong> — steps the chant <em>back</em> one word.</p>
          </li>
        </ul>
        <p style="margin-top: 1cqw; opacity: 0.75;"><em>Decoys are removed in Solo.</em></p>
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

  <div v-else class="guide-grid">
    <!-- Left column — instructions -->
    <div class="left-col">
      <h2 class="guide-title">How to Play</h2>

      <section class="section">
        <h3>Goal</h3>
        <p>Be the first to empty your hand by slamming the right card on the right beat.</p>
      </section>

      <section class="section">
        <h3>Modes</h3>
        <p><strong>Simulate</strong> — watch AI play.<br />
           <strong>Play</strong> — you take P1 (the bottom seat).</p>
      </section>

      <section class="section">
        <h3>The Beat (Play)</h3>
        <p>A metronome rotates clockwise — your seat's pie wedge lights up on your turn. Slam during YOUR beat only; slamming during another's = miscall. You can slam <strong>multiple cards in one beat</strong> to chain a combo. Listen for the
          <strong class="hi-high">high DING</strong> — the next beat is yours.</p>
      </section>

      <section class="section">
        <h3>How to Slam</h3>
        <p><strong>Tap</strong> a card → slam on Main base.<br />
           <strong>Drag</strong> toward a base chip → slam on that base.<br />
           <strong>Drag back</strong> to the center ring → cancel.<br />
           <strong>Esc</strong> → cancel.</p>
      </section>

      <section class="section">
        <h3>Special Cards</h3>
        <ul class="cards-list">
          <li>
            <img src="/cards/halohalo-chik.png" alt="Halo-Halo Chik" class="mini-card" />
            <p><strong class="card-name word-chik">Halo-Halo Chik</strong> — opens the game on the first Chik beat.</p>
          </li>
          <li>
            <img src="/cards/chik-reverse.png" alt="Reverse" class="mini-card" />
            <p><strong>Reverse</strong> — steps the chant <em>back</em> one word.</p>
          </li>
          <li>
            <img src="/cards/chik-decoy.png" alt="Decoy" class="mini-card" />
            <p><strong>Decoy</strong> — matches its word but can be slammed on ANY base.</p>
          </li>
        </ul>
      </section>

      <section class="section">
        <h3>Penalties</h3>
        <p>Tie = pick 1 card from any pile.<br />
           Miscall = pick 2 cards.</p>
      </section>

      <section class="section">
        <h3>Controls</h3>
        <p>Top of the screen — Mode · Players · Failure · Speed · Beats · Mute.</p>
      </section>
    </div>

    <!-- Right column — THE CHANT -->
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
