/**
 * Headless proof for Color Cascade's rules, deck, and CPU policy.
 *
 * Drives the exact pure functions the game runs (buildDeck / shuffle / deal /
 * isLegalPlay / applyPlay / drawCard / handIsEmpty / winner / chooseCpuPlay).
 * The failures that quietly ruin a shedding card game if they silently break:
 *
 *  1. The deck is not the exact 108-card multiset a shedding game needs.
 *  2. shuffle drops or duplicates a card instead of permuting losslessly.
 *  3. isLegalPlay accepts a mismatched card, or rejects a color/rank match or
 *     a wild.
 *  4. applyPlay silently creates or destroys cards, or gets turn order wrong -
 *     with exactly two players, Skip/Reverse must return the turn to the
 *     player who just moved rather than advancing it, and Draw Two must make
 *     the next player draw exactly two cards.
 *  5. A full random self-play game (both sides via chooseCpuPlay) never
 *     terminates, ends without a winner, or plays an illegal card along the
 *     way.
 *
 * Each self-test at the end sabotages a check and confirms it would fail, so
 * a check that has quietly stopped testing anything is caught (mirrors
 * scripts/check-tictactoe.ts's expectFail pattern).
 */
import {
  applyPlay,
  buildDeck,
  chooseCpuPlay,
  COLORS,
  deal,
  describeCard,
  drawCard,
  handIsEmpty,
  isLegalPlay,
  lcg,
  newGame,
  shuffle,
  winner,
  type Card,
  type Color,
  type GameState,
  type Rank,
} from '../components/games/CardMatch';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

// --- 1) buildDeck is the exact expected 108-card multiset -------------------

function multiset(cards: Card[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) {
    const key = `${c.color ?? 'wild'}:${c.rank}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function expectedDeckMultiset(): Map<string, number> {
  const m = new Map<string, number>();
  const numbered: Rank[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
  for (const color of COLORS) {
    m.set(`${color}:0`, 1);
    for (const r of numbered) m.set(`${color}:${r}`, 2);
  }
  m.set('wild:wild', 4);
  m.set('wild:wild4', 4);
  return m;
}

function multisetsEqual(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

{
  const deck = buildDeck();
  assert(deck.length === 108, `buildDeck produced ${deck.length} cards, expected 108`);
  const ids = new Set(deck.map((c) => c.id));
  assert(ids.size === 108, 'buildDeck produced duplicate ids');
  assert(
    multisetsEqual(multiset(deck), expectedDeckMultiset()),
    'buildDeck multiset does not match the expected 108-card composition',
  );
}

// --- 2) shuffle is a lossless permutation across many seeds -----------------

{
  const deck = buildDeck();
  const before = multiset(deck);
  let allPermutations = true;
  for (let seed = 1; seed <= 40; seed += 1) {
    const shuffled = shuffle(deck, lcg(seed * 7919 + 1));
    if (shuffled.length !== deck.length || !multisetsEqual(multiset(shuffled), before)) {
      allPermutations = false;
    }
  }
  assert(allPermutations, 'shuffle did not produce a lossless permutation for every seed tried');

  // A real shuffle should not just return the input unchanged.
  const shuffled = shuffle(deck, lcg(12345));
  let anyMoved = false;
  for (let i = 0; i < deck.length; i += 1) if (shuffled[i].id !== deck[i].id) anyMoved = true;
  assert(anyMoved, 'shuffle returned the deck in its original order');
}

// --- 3) deal gives 7 cards each, a non-wild4 starter, and conserves the pile -

{
  for (let seed = 1; seed <= 20; seed += 1) {
    const deck = shuffle(buildDeck(), lcg(seed));
    const d = deal(deck);
    assert(d.hands[0].length === 7 && d.hands[1].length === 7, `deal (seed ${seed}) did not give both players 7 cards`);
    assert(d.discard.length === 1, `deal (seed ${seed}) discard did not start with exactly 1 card`);
    assert(d.discard[0].rank !== 'wild4', `deal (seed ${seed}) opened the round on a Rainbow +4`);
    const total = d.hands[0].length + d.hands[1].length + d.drawPile.length + d.discard.length;
    assert(total === 108, `deal (seed ${seed}) lost or created cards: total ${total}, expected 108`);
  }
}

// --- 4) isLegalPlay: color match, rank match, wild accepted; mismatch rejected

{
  const top: Card = { id: 900, color: 'red', rank: '5' };
  const colorMatch: Card = { id: 901, color: 'red', rank: '7' };
  const rankMatch: Card = { id: 902, color: 'blue', rank: '5' };
  const wild: Card = { id: 903, color: null, rank: 'wild' };
  const wild4: Card = { id: 904, color: null, rank: 'wild4' };
  const mismatch: Card = { id: 905, color: 'blue', rank: '3' };

  assert(isLegalPlay(colorMatch, top, 'red'), 'isLegalPlay rejected a color match');
  assert(isLegalPlay(rankMatch, top, 'red'), 'isLegalPlay rejected a rank match across colors');
  assert(isLegalPlay(wild, top, 'red'), 'isLegalPlay rejected a wild');
  assert(isLegalPlay(wild4, top, 'red'), 'isLegalPlay rejected a wild-draw-four');
  assert(!isLegalPlay(mismatch, top, 'red'), 'isLegalPlay accepted a total color+rank mismatch');

  // An action-rank match (Skip on Skip) across different colors must also be legal.
  const topSkip: Card = { id: 906, color: 'green', rank: 'skip' };
  const skipMatch: Card = { id: 907, color: 'yellow', rank: 'skip' };
  assert(isLegalPlay(skipMatch, topSkip, 'green'), 'isLegalPlay rejected a Skip-on-Skip rank match');
}

// --- 5) applyPlay: conserves cards, and gets 2-player turn order right ------

function totalCards(s: GameState): number {
  return s.hands[0].length + s.hands[1].length + s.drawPile.length + s.discard.length;
}

function freshTestState(topRank: Rank, topColor: Color): GameState {
  // A hand-built, small, fully-known state so effects can be checked exactly.
  const rng = lcg(99);
  const s = newGame(rng);
  // Overwrite the top of the discard / active color for a controlled scenario,
  // keeping the total-card count intact.
  s.discard[s.discard.length - 1] = { id: 8000, color: topColor, rank: topRank };
  s.activeColor = topColor;
  return s;
}

{
  // Plain number card: turn must advance to the opponent.
  const s = freshTestState('4', 'red');
  const card: Card = { id: 8001, color: 'red', rank: '6' };
  s.hands[0] = [card, ...s.hands[0]];
  const before = totalCards(s); // captured AFTER injecting the test card, so conservation is checked fairly
  const r = applyPlay(s, 0, card, null, lcg(1));
  assert(totalCards(r.state) === before, 'applyPlay (plain card) did not conserve total card count');
  assert(r.state.turn === 1, `applyPlay (plain card) turn was ${r.state.turn}, expected 1 (advances)`);
  assert(r.effect === 'none', 'applyPlay (plain card) reported a non-none effect');
}

{
  // Skip: with two players, turn must return to the player who played it.
  const s = freshTestState('4', 'red');
  const card: Card = { id: 8002, color: 'red', rank: 'skip' };
  s.hands[0] = [card, ...s.hands[0]];
  const before = totalCards(s); // captured AFTER injecting the test card, so conservation is checked fairly
  const r = applyPlay(s, 0, card, null, lcg(2));
  assert(totalCards(r.state) === before, 'applyPlay (skip) did not conserve total card count');
  assert(r.state.turn === 0, `applyPlay (skip) turn was ${r.state.turn}, expected 0 (does NOT advance)`);
  assert(r.effect === 'skip', 'applyPlay (skip) did not report effect "skip"');
}

{
  // Reverse: same 2-player behaviour as skip - turn stays.
  const s = freshTestState('4', 'red');
  const card: Card = { id: 8003, color: 'red', rank: 'reverse' };
  s.hands[0] = [card, ...s.hands[0]];
  const beforeDir = s.direction;
  const r = applyPlay(s, 0, card, null, lcg(3));
  assert(r.state.turn === 0, `applyPlay (reverse) turn was ${r.state.turn}, expected 0 (does NOT advance)`);
  assert(r.state.direction === (beforeDir * -1), 'applyPlay (reverse) did not flip direction');
  assert(r.effect === 'reverse', 'applyPlay (reverse) did not report effect "reverse"');
}

{
  // Draw Two: opponent draws exactly 2, and is also skipped (turn stays put).
  const s = freshTestState('4', 'red');
  const card: Card = { id: 8004, color: 'red', rank: 'draw2' };
  s.hands[0] = [card, ...s.hands[0]];
  const before = totalCards(s); // captured AFTER injecting the test card, so conservation is checked fairly
  const oppHandBefore = s.hands[1].length;
  const drawPileBefore = s.drawPile.length;
  const r = applyPlay(s, 0, card, null, lcg(4));
  assert(totalCards(r.state) === before, 'applyPlay (draw2) did not conserve total card count');
  assert(
    r.state.hands[1].length === oppHandBefore + 2,
    `applyPlay (draw2) opponent hand grew by ${r.state.hands[1].length - oppHandBefore}, expected 2`,
  );
  assert(
    r.state.drawPile.length === drawPileBefore - 2,
    'applyPlay (draw2) draw pile did not shrink by exactly 2',
  );
  assert(r.opponentDrew === 2, `applyPlay (draw2) reported opponentDrew=${r.opponentDrew}, expected 2`);
  assert(r.state.turn === 0, `applyPlay (draw2) turn was ${r.state.turn}, expected 0 (opponent is also skipped)`);
}

{
  // Rainbow +4: opponent draws exactly 4, chosen color takes effect, turn stays.
  const s = freshTestState('4', 'red');
  const oppHandBefore = s.hands[1].length;
  const card: Card = { id: 8005, color: null, rank: 'wild4' };
  s.hands[0] = [card, ...s.hands[0]];
  const r = applyPlay(s, 0, card, 'green', lcg(5));
  assert(r.state.hands[1].length === oppHandBefore + 4, 'applyPlay (wild4) opponent did not draw exactly 4');
  assert(r.opponentDrew === 4, `applyPlay (wild4) reported opponentDrew=${r.opponentDrew}, expected 4`);
  assert(r.state.turn === 0, 'applyPlay (wild4) turn advanced, expected it to stay (opponent skipped)');
  assert(r.state.activeColor === 'green', 'applyPlay (wild4) did not adopt the chosen color');
}

{
  // A plain Wild (no draw): turn advances normally, but color still switches.
  const s = freshTestState('4', 'red');
  const card: Card = { id: 8006, color: null, rank: 'wild' };
  s.hands[0] = [card, ...s.hands[0]];
  const r = applyPlay(s, 0, card, 'yellow', lcg(6));
  assert(r.state.turn === 1, 'applyPlay (plain wild) did not advance the turn');
  assert(r.state.activeColor === 'yellow', 'applyPlay (plain wild) did not adopt the chosen color');
}

// --- 6) drawCard: adds one card, conserves total, recycles discard on empty -

{
  const s = freshTestState('4', 'red');
  const before = totalCards(s);
  const handBefore = s.hands[0].length;
  const drawn = drawCard(s, 0, lcg(7));
  assert(totalCards(drawn) === before, 'drawCard did not conserve total card count');
  assert(drawn.hands[0].length === handBefore + 1, 'drawCard did not add exactly one card to the hand');
  assert(drawn.turn === s.turn, 'drawCard changed the turn (it must leave turn untouched)');

  // Empty the draw pile down to nothing, with a fat discard behind the top
  // card, and confirm a draw still succeeds by recycling.
  const s2 = freshTestState('4', 'red');
  const extraDiscard: Card[] = [];
  for (let i = 0; i < 20; i += 1) extraDiscard.push({ id: 9000 + i, color: 'blue', rank: '2' });
  const recyclable: GameState = {
    ...s2,
    drawPile: [],
    discard: [...extraDiscard, s2.discard[s2.discard.length - 1]],
  };
  const beforeTotal = totalCards(recyclable);
  const afterDraw = drawCard(recyclable, 0, lcg(8));
  assert(totalCards(afterDraw) === beforeTotal, 'drawCard (recycle path) did not conserve total card count');
  assert(afterDraw.hands[0].length === recyclable.hands[0].length + 1, 'drawCard (recycle path) did not draw a card');
  assert(afterDraw.discard.length === 1, 'drawCard (recycle path) did not leave exactly the top card in discard');
}

// --- 7) handIsEmpty / winner ------------------------------------------------

{
  assert(handIsEmpty([]), 'handIsEmpty(false) on an empty hand');
  assert(!handIsEmpty([{ id: 1, color: 'red', rank: '1' }]), 'handIsEmpty(true) on a non-empty hand');

  const s = freshTestState('4', 'red');
  assert(winner(s) === null, 'winner declared a winner on a freshly dealt state');
  const emptied: GameState = { ...s, hands: [[], s.hands[1]] };
  assert(winner(emptied) === 0, 'winner did not credit player 0 with an empty hand');
  const emptied2: GameState = { ...s, hands: [s.hands[0], []] };
  assert(winner(emptied2) === 1, 'winner did not credit player 1 with an empty hand');
}

// --- 8) chooseCpuPlay: only ever legal, prefers color, uses a wild only when

// forced, and returns null with no legal card.
{
  const top: Card = { id: 7000, color: 'red', rank: '5' };
  const hand: Card[] = [
    { id: 1, color: 'blue', rank: '2' },
    { id: 2, color: 'red', rank: '9' },
    { id: 3, color: null, rank: 'wild' },
  ];
  const choice = chooseCpuPlay(hand, top, 'red', lcg(1));
  assert(choice !== null, 'chooseCpuPlay returned null despite a legal card being available');
  assert(choice?.card.color === 'red', 'chooseCpuPlay did not prefer the color match over the wild');

  const noLegalHand: Card[] = [
    { id: 4, color: 'blue', rank: '2' },
    { id: 5, color: 'green', rank: '9' },
  ];
  const noChoice = chooseCpuPlay(noLegalHand, top, 'red', lcg(1));
  assert(noChoice === null, 'chooseCpuPlay did not return null with zero legal cards');

  const onlyWild: Card[] = [
    { id: 6, color: 'blue', rank: '2' },
    { id: 7, color: null, rank: 'wild4' },
  ];
  const wildChoice = chooseCpuPlay(onlyWild, top, 'red', lcg(1));
  assert(wildChoice?.card.rank === 'wild4', 'chooseCpuPlay did not fall back to the wild when nothing else was legal');
  assert(wildChoice?.chosenColor !== null, 'chooseCpuPlay did not choose a color when playing a wild');

  // Every choice across many hands/seeds must itself be legal.
  let allLegal = true;
  for (let seed = 0; seed < 200; seed += 1) {
    const rng = lcg(seed + 1);
    const testHand: Card[] = [];
    for (let i = 0; i < 7; i += 1) {
      const color = COLORS[Math.floor(rng() * 4)];
      testHand.push({ id: 100 + i, color, rank: String(Math.floor(rng() * 10)) as Rank });
    }
    const c = chooseCpuPlay(testHand, top, 'red', rng);
    if (c && !isLegalPlay(c.card, top, 'red')) allLegal = false;
  }
  assert(allLegal, 'chooseCpuPlay produced an illegal card on at least one random hand');
}

// --- 9) describeCard: plain-English labels for the play banner ("Computer played red 5") ---

{
  const numbered: Card = { id: 600, color: 'red', rank: '5' };
  assert(describeCard(numbered) === 'red 5', `describeCard gave "${describeCard(numbered)}", expected "red 5"`);

  const action: Card = { id: 601, color: 'blue', rank: 'draw2' };
  assert(
    describeCard(action) === 'blue Draw Two',
    `describeCard gave "${describeCard(action)}", expected "blue Draw Two"`,
  );

  const wild: Card = { id: 602, color: null, rank: 'wild' };
  assert(describeCard(wild) === 'Rainbow', `describeCard gave "${describeCard(wild)}", expected "Rainbow"`);

  const wild4: Card = { id: 603, color: null, rank: 'wild4' };
  assert(
    describeCard(wild4) === 'Rainbow +4',
    `describeCard gave "${describeCard(wild4)}", expected "Rainbow +4"`,
  );
}

// --- 10) full random self-play games always terminate, legally, one winner -

/**
 * Mirrors the orchestration CardMatch.tsx uses: chooseCpuPlay decides; if it
 * has nothing legal, the player draws one card and the turn passes (the
 * simplified "draw ends your turn" house rule the component also uses).
 */
function simulateGame(seed: number): { plies: number; winner: 0 | 1 | null; illegalPlay: boolean } {
  const rng = lcg(seed);
  let state = newGame(rng);
  let illegalPlay = false;
  const CAP = 4000;
  let plies = 0;
  for (; plies < CAP; plies += 1) {
    const w = winner(state);
    if (w !== null) return { plies, winner: w, illegalPlay };
    const player = state.turn;
    const top = state.discard[state.discard.length - 1];
    const choice = chooseCpuPlay(state.hands[player], top, state.activeColor, rng);
    if (choice) {
      if (!isLegalPlay(choice.card, top, state.activeColor)) illegalPlay = true;
      const r = applyPlay(state, player, choice.card, choice.chosenColor, rng);
      state = r.state;
    } else {
      state = drawCard(state, player, rng);
      state = { ...state, turn: player === 0 ? 1 : 0 };
    }
  }
  return { plies, winner: winner(state), illegalPlay };
}

{
  let anyIllegal = false;
  let anyNoWinner = false;
  let maxPlies = 0;
  const GAMES = 60;
  for (let seed = 1; seed <= GAMES; seed += 1) {
    const result = simulateGame(seed * 104729 + 17);
    if (result.illegalPlay) anyIllegal = true;
    if (result.winner === null) anyNoWinner = true;
    maxPlies = Math.max(maxPlies, result.plies);
  }
  assert(!anyIllegal, 'a full random self-play game played an illegal card');
  assert(!anyNoWinner, `a full random self-play game did not terminate with a winner within the ply cap`);
  console.log(`${GAMES} full random self-play games: all terminated legally with exactly one winner (max ${maxPlies} plies).`);
}

// --- self-tests: each sabotages a check and confirms it would fail ----------

let selfFails = 0;
function expectFail(name: string, run: () => boolean): void {
  if (run()) {
    console.log(`  ok  ${name}`);
  } else {
    selfFails += 1;
    console.error(`  SELF-TEST BROKEN: ${name} did not catch the sabotage`);
  }
}

expectFail('a deck missing a card is caught by the multiset check', () => {
  const bad = buildDeck().slice(1); // drop one card
  return !multisetsEqual(multiset(bad), expectedDeckMultiset());
});

expectFail('a shuffle that duplicates instead of permuting is caught', () => {
  const deck = buildDeck();
  const brokenShuffle = deck.map(() => deck[0]); // every slot becomes the same card
  return !multisetsEqual(multiset(brokenShuffle), multiset(deck));
});

expectFail('an isLegalPlay that ignores wilds is caught', () => {
  const top: Card = { id: 1, color: 'red', rank: '5' };
  const wild: Card = { id: 2, color: null, rank: 'wild' };
  const brokenIsLegal = (card: Card): boolean => card.color === 'red'; // forgets wilds entirely
  return isLegalPlay(wild, top, 'red') && !brokenIsLegal(wild);
});

expectFail('a turn rule that always advances (ignoring Skip) is caught', () => {
  const s = freshTestState('4', 'red');
  const card: Card = { id: 8100, color: 'red', rank: 'skip' };
  s.hands[0] = [card, ...s.hands[0]];
  const real = applyPlay(s, 0, card, null, lcg(11));
  const brokenTurn: 0 | 1 = 1; // a buggy version that always advances turn to 1
  return real.state.turn !== brokenTurn;
});

expectFail('a Draw Two that only makes the opponent draw 1 is caught', () => {
  const s = freshTestState('4', 'red');
  const oppBefore = s.hands[1].length;
  const card: Card = { id: 8101, color: 'red', rank: 'draw2' };
  s.hands[0] = [card, ...s.hands[0]];
  const real = applyPlay(s, 0, card, null, lcg(12));
  const brokenDrawCount = oppBefore + 1; // a buggy version that only draws 1
  return real.state.hands[1].length !== brokenDrawCount;
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log(
  '\nColor Cascade: deck composition, shuffle, legal-play rules, applyPlay turn/draw effects, ' +
    'and full random self-play games all verified.',
);
