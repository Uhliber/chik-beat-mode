import { Game } from '../src/game/Game.ts';
import { buildBaseDeck } from '../src/game/Deck.ts';

const deck = buildBaseDeck();
console.log('Deck size:', deck.length);
console.log('Halo-Halo count:', deck.filter((c) => c.isHaloHalo).length);
console.log('Reverse count:', deck.filter((c) => c.kind === 'reverse').length);
console.log('Decoy count:', deck.filter((c) => c.kind === 'decoy').length);

for (const playerCount of [2, 4, 6]) {
  const g = new Game();
  let setupOk = true;
  try {
    g.setup(playerCount);
  } catch (e) {
    setupOk = false;
    console.log(`  ${playerCount}p setup FAILED:`, e);
  }
  if (!setupOk) continue;
  const total = g.players.reduce((sum, p) => sum + p.cardCount, 0);
  console.log(`Players=${playerCount}: total cards in hands=${total}, halo-owner=${g.haloHaloOwnerId}`);
}

// Quick game run (autoplay 0% failure, no rendering)
const g = new Game();
g.setup(4);
let slamCount = 0;
let winner: string | null = null;
g.on((e) => {
  if (e.kind === 'slam') slamCount++;
  if (e.kind === 'winner') winner = e.playerId;
});
g.openGame();
let safety = 2000;
while (!winner && safety > 0) {
  safety--;
  const beat = g.getRequiredBeat();
  const candidates = g.players.filter((p) => p.hasCardForBeat(beat));
  if (candidates.length === 0) {
    console.log('Stalled at beat', beat);
    break;
  }
  const p = candidates[0];
  const card = p.hasCardForBeat(beat)!;
  g.resolveSlams([{
    playerId: p.id,
    cardId: card.id,
    targetBase: g.resolveTargetBase(card.word),
    shoutedWord: beat,
  }]);
}
console.log(`Game played out. slams=${slamCount} winner=${winner} safety_left=${safety}`);
