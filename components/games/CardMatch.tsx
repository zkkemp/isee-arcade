'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameApi, GameCanvasProps } from '@/lib/games';
import { playSound, unlockAudio } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

/**
 * Color Cascade - an ORIGINAL shedding / crazy-eights style card game. It is
 * the reference genre popularized by a well-known trademarked game, but
 * nothing here copies that game's name, card back, or exact card layout: the
 * deck uses flat color-coded fronts with an original pinwheel wild icon, and
 * the action cards are renamed (Skip, Reverse, Draw Two, Rainbow, Rainbow +4).
 *
 * Like TicTacToe.tsx (the 'board' control-scheme reference), everything above
 * the component is pure - no canvas, no React, no clock, and no Math.random
 * (the only randomness is an injected seeded rng). scripts/check-cardmatch.ts
 * drives these exact functions headlessly and proves the things that quietly
 * ruin a card game if they silently break:
 *
 *  1. The deck is not the exact 108-card multiset a shedding game needs -
 *     `buildDeck` is checked against the expected count of every (color, rank)
 *     pair, and `shuffle` (Fisher-Yates over an injected rng) is checked to be
 *     a lossless permutation across many seeds.
 *  2. A card that should not be playable slips through, or a legal card is
 *     wrongly rejected. `isLegalPlay` is checked against a color match, a
 *     rank/action match across colors, a wild, and a total mismatch.
 *  3. `applyPlay` silently creates or destroys cards, or gets the turn order
 *     wrong. With exactly two players, Skip and Reverse both return the turn
 *     to the player who just moved (the only opponent is skipped) instead of
 *     advancing it, and Draw Two makes the next player draw exactly two cards
 *     and lose their turn - the checker proves both the turn behaviour and
 *     that hand+drawPile+discard always sums to the same total.
 *  4. A full random self-play game (both sides using `chooseCpuPlay`) never
 *     terminates, ends in a tie, or plays an illegal card along the way.
 *
 * Two modes from an in-canvas menu, exactly like TicTacToe: two players
 * pass-and-play on one device, or one player against the computer. In
 * pass-and-play, a full-screen "Pass to Player N" gate sits between turns so
 * hands stay private; in computer mode the CPU takes its turn after a short
 * "thinking" beat via `chooseCpuPlay`.
 */

// --- pure rules --------------------------------------------------------------

export type Color = 'red' | 'blue' | 'green' | 'yellow';
export const COLORS: Color[] = ['red', 'blue', 'green', 'yellow'];

export type Rank =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

/** Number/action ranks that live under every color; wilds are colorless. */
const COLORED_RANKS: Rank[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

export type Card = {
  /** Unique within one deck instance. Used for hit-testing and React-free identity. */
  id: number;
  /** null only for the two wild ranks. */
  color: Color | null;
  rank: Rank;
};

/**
 * The full 108-card deck: per color, one 0, two each of 1-9 / Skip / Reverse /
 * Draw Two (25 cards x 4 colors = 100), plus 4 Rainbow and 4 Rainbow +4 wilds.
 */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  let id = 0;
  for (const color of COLORS) {
    deck.push({ id: id++, color, rank: '0' });
    for (const rank of COLORED_RANKS) {
      deck.push({ id: id++, color, rank });
      deck.push({ id: id++, color, rank });
    }
  }
  for (let i = 0; i < 4; i += 1) deck.push({ id: id++, color: null, rank: 'wild' });
  for (let i = 0; i < 4; i += 1) deck.push({ id: id++, color: null, rank: 'wild4' });
  return deck;
}

/** Fisher-Yates over an injected rng. Never touches Math.random. */
export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export const HAND_SIZE = 7;

export type DealResult = {
  hands: [Card[], Card[]];
  drawPile: Card[];
  discard: Card[];
  activeColor: Color;
};

/**
 * Deals 7 cards to each of exactly two players from an already-shuffled deck,
 * then flips the next card as the starting discard. Any Rainbow +4 flipped as
 * the starter is deferred to the bottom of the pile (a wild-draw-four should
 * never open a round) - deterministic, no extra rng needed. A plain Rainbow
 * landing as the starter defaults the active color to red (COLORS[0]); real
 * table rules have the dealer call it, which a solo pure function cannot do.
 */
export function deal(deck: Card[]): DealResult {
  const hands: [Card[], Card[]] = [[], []];
  let i = 0;
  for (let r = 0; r < HAND_SIZE; r += 1) {
    for (let p = 0; p < 2; p += 1) {
      hands[p].push(deck[i]);
      i += 1;
    }
  }
  let rest = deck.slice(i);
  const deferred: Card[] = [];
  let starter: Card | null = null;
  while (rest.length > 0) {
    const c = rest[0];
    rest = rest.slice(1);
    if (c.rank === 'wild4') {
      deferred.push(c);
      continue;
    }
    starter = c;
    break;
  }
  if (!starter) starter = deferred.shift() ?? rest[0];
  const drawPile = [...rest, ...deferred];
  const activeColor: Color = starter.color ?? COLORS[0];
  return { hands, drawPile, discard: [starter], activeColor };
}

/** A card is legal if it shares the active color, matches the top's rank/action, or is a wild. */
export function isLegalPlay(card: Card, top: Card, activeColor: Color): boolean {
  if (card.rank === 'wild' || card.rank === 'wild4') return true;
  if (card.color === activeColor) return true;
  if (card.rank === top.rank) return true;
  return false;
}

/** Human-readable name for a rank - action cards get their real names, numbers pass through. */
function rankWord(rank: Rank): string {
  switch (rank) {
    case 'skip':
      return 'Skip';
    case 'reverse':
      return 'Reverse';
    case 'draw2':
      return 'Draw Two';
    case 'wild':
      return 'Rainbow';
    case 'wild4':
      return 'Rainbow +4';
    default:
      return rank;
  }
}

/**
 * A plain-English label for a card - "red 5", "blue Skip", "Rainbow" - used by the play
 * banner so a kid can read exactly what was just played instead of only seeing the icon.
 * Pure and exported so scripts/check-cardmatch.ts can prove it directly.
 */
export function describeCard(card: Card): string {
  return card.color ? `${card.color} ${rankWord(card.rank)}` : rankWord(card.rank);
}

export type GameState = {
  hands: [Card[], Card[]];
  drawPile: Card[];
  discard: Card[];
  activeColor: Color;
  turn: 0 | 1;
  direction: 1 | -1;
};

export function newGame(rng: () => number): GameState {
  const deck = shuffle(buildDeck(), rng);
  const d = deal(deck);
  return { ...d, turn: 0, direction: 1 };
}

export function handIsEmpty(hand: Card[]): boolean {
  return hand.length === 0;
}

/** 0 or 1 if that player has emptied their hand, else null - the round continues. */
export function winner(state: GameState): 0 | 1 | null {
  if (handIsEmpty(state.hands[0])) return 0;
  if (handIsEmpty(state.hands[1])) return 1;
  return null;
}

function otherPlayer(p: 0 | 1): 0 | 1 {
  return p === 0 ? 1 : 0;
}

/**
 * Recycles the discard pile (everything except its top card) into the draw
 * pile when the draw pile runs dry - the standard way a shedding game avoids
 * ever truly running out of cards. A no-op if there is nothing to recycle.
 */
function reshuffleIfNeeded(
  drawPile: Card[],
  discard: Card[],
  rng: () => number,
): { drawPile: Card[]; discard: Card[] } {
  if (drawPile.length > 0 || discard.length <= 1) return { drawPile, discard };
  const top = discard[discard.length - 1];
  const rest = discard.slice(0, -1);
  return { drawPile: shuffle(rest, rng), discard: [top] };
}

/** Draws one card into `player`'s hand, recycling the discard pile if needed. Turn is untouched. */
export function drawCard(state: GameState, player: 0 | 1, rng: () => number): GameState {
  const r = reshuffleIfNeeded(state.drawPile, state.discard, rng);
  if (r.drawPile.length === 0) return { ...state, drawPile: r.drawPile, discard: r.discard };
  const card = r.drawPile[0];
  const drawPile = r.drawPile.slice(1);
  const hands: [Card[], Card[]] = [state.hands[0].slice(), state.hands[1].slice()];
  hands[player] = hands[player].concat(card);
  return { ...state, hands, drawPile, discard: r.discard };
}

function drawN(
  drawPile: Card[],
  discard: Card[],
  n: number,
  rng: () => number,
): { drawPile: Card[]; discard: Card[]; drawn: Card[] } {
  let dp = drawPile;
  let dc = discard;
  const drawn: Card[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = reshuffleIfNeeded(dp, dc, rng);
    dp = r.drawPile;
    dc = r.discard;
    if (dp.length === 0) break; // truly no cards anywhere - defensive, should not happen at 108 cards.
    drawn.push(dp[0]);
    dp = dp.slice(1);
  }
  return { drawPile: dp, discard: dc, drawn };
}

export type PlayEffect = 'none' | 'skip' | 'reverse' | 'draw2' | 'wild4';

export type PlayResult = {
  state: GameState;
  /** What the played card did, for the banner the UI shows. */
  effect: PlayEffect;
  /** How many cards the opponent was made to draw (0, 2, or 4). */
  opponentDrew: number;
};

/**
 * Removes `card` from `player`'s hand, plays it to the discard, and resolves
 * its effect. Assumes the caller already checked `isLegalPlay` - like
 * TicTacToe's `place`, illegal input is the component's job to prevent, not
 * this function's job to reject.
 *
 * With exactly two players: Skip and Reverse both return the turn to the
 * player who just played (their only opponent is the one being skipped);
 * Draw Two and Rainbow +4 make the opponent draw then ALSO skip their turn
 * (the standard rule), so the turn again returns to the player who played.
 * A plain number/color card or a plain Rainbow (no draw) passes the turn.
 */
export function applyPlay(
  state: GameState,
  player: 0 | 1,
  card: Card,
  chosenColor: Color | null,
  rng: () => number,
): PlayResult {
  const hands: [Card[], Card[]] = [state.hands[0].slice(), state.hands[1].slice()];
  const hand = hands[player];
  const idx = hand.findIndex((c) => c.id === card.id);
  if (idx === -1) throw new Error('applyPlay: card is not in that player\'s hand');
  hand.splice(idx, 1);

  let discard = state.discard.concat(card);
  let drawPile = state.drawPile;
  const opponent = otherPlayer(player);
  let direction = state.direction;
  let turn: 0 | 1 = opponent;
  let effect: PlayEffect = 'none';
  let opponentDrew = 0;

  if (card.rank === 'skip') {
    turn = player;
    effect = 'skip';
  } else if (card.rank === 'reverse') {
    direction = (direction * -1) as 1 | -1; // vestigial with 2 players, kept for fidelity.
    turn = player;
    effect = 'reverse';
  } else if (card.rank === 'draw2') {
    const d = drawN(drawPile, discard, 2, rng);
    drawPile = d.drawPile;
    discard = d.discard;
    hands[opponent] = hands[opponent].concat(d.drawn);
    opponentDrew = d.drawn.length;
    turn = player;
    effect = 'draw2';
  } else if (card.rank === 'wild4') {
    const d = drawN(drawPile, discard, 4, rng);
    drawPile = d.drawPile;
    discard = d.discard;
    hands[opponent] = hands[opponent].concat(d.drawn);
    opponentDrew = d.drawn.length;
    turn = player;
    effect = 'wild4';
  }

  const activeColor: Color = card.color ?? (chosenColor ?? state.activeColor);

  return {
    state: { hands, drawPile, discard, activeColor, turn, direction },
    effect,
    opponentDrew,
  };
}

const RANK_VALUE: Record<Rank, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  skip: 20, reverse: 20, draw2: 25, wild: 40, wild4: 50,
};

function bestColorFor(hand: Card[], excludingId: number): Color {
  const counts: Record<Color, number> = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const c of hand) {
    if (c.id === excludingId) continue;
    if (c.color) counts[c.color] += 1;
  }
  let best: Color = COLORS[0];
  for (const c of COLORS) if (counts[c] > counts[best]) best = c;
  return best;
}

export type CpuChoice = { card: Card; chosenColor: Color | null };

/**
 * The computer's choice: legal cards only. It prefers a color match (keeping
 * wilds in reserve), then a rank/action match, and only reaches for a wild
 * when nothing else fits. Within its preferred group it dumps the
 * highest-value card first (action cards ahead of numbers), which both
 * empties the costliest cards fastest and, for Skip/Reverse/Draw Two,
 * disrupts the opponent. `rng` only breaks ties among equally-valued cards,
 * so play is not perfectly robotic. Returns null when the hand has no legal
 * card at all (the caller must draw).
 */
export function chooseCpuPlay(
  hand: Card[],
  top: Card,
  activeColor: Color,
  rng: () => number,
): CpuChoice | null {
  const legal = hand.filter((c) => isLegalPlay(c, top, activeColor));
  if (legal.length === 0) return null;

  const colorMatches = legal.filter((c) => c.color === activeColor);
  const rankMatches = legal.filter(
    (c) => c.color !== activeColor && c.rank !== 'wild' && c.rank !== 'wild4' && c.rank === top.rank,
  );
  const wilds = legal.filter((c) => c.rank === 'wild' || c.rank === 'wild4');
  const pool = colorMatches.length > 0 ? colorMatches : rankMatches.length > 0 ? rankMatches : wilds;

  let bestValue = -1;
  for (const c of pool) bestValue = Math.max(bestValue, RANK_VALUE[c.rank]);
  const tied = pool.filter((c) => RANK_VALUE[c.rank] === bestValue);
  const pick = tied[Math.floor(rng() * tied.length)] ?? tied[0];

  const chosenColor = pick.rank === 'wild' || pick.rank === 'wild4' ? bestColorFor(hand, pick.id) : null;
  return { card: pick, chosenColor };
}

/** Seeded LCG, so nothing above ever touches Math.random. */
export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// --- layout ------------------------------------------------------------------

type Mode = 'cpu' | '2p';
type Phase = 'menu' | 'pass' | 'play' | 'over';

const TOP = 52;
/** Height of the dedicated "other player" panel drawn just below the top bar. */
const OPP_H = 62;

export const COLOR_HEX: Record<Color, string> = {
  red: '#ff5a5a',
  blue: '#4ea8ff',
  green: '#3ddc84',
  yellow: '#ffd75e',
};
const WILD_BG = '#211d33';

type HandSlot = { card: Card; x: number; y: number; w: number; h: number; playable: boolean };

/**
 * `interactive` is false whenever the fanned hand is not the one whose turn it actually is
 * (e.g. the human's own hand shown - fixed, always visible - while the computer is thinking
 * or its play is still animating). A non-interactive hand never raises or highlights a card,
 * even one that would otherwise be legal, so a kid never sees a false "you can play this" cue.
 */
function layoutHand(
  hand: Card[],
  top: Card,
  activeColor: Color,
  cw: number,
  ch: number,
  inset: number,
  interactive: boolean,
): HandSlot[] {
  const n = hand.length;
  if (n === 0) return [];
  const maxW = Math.max(60, cw - 24);
  const cardW = Math.min(72, Math.max(34, maxW / Math.max(3.2, n * 0.62)));
  const cardH = cardW * 1.4;
  const overlap = n > 1 ? Math.min(cardW * 0.74, (maxW - cardW) / (n - 1)) : 0;
  const totalW = cardW + overlap * (n - 1);
  const startX = (cw - totalW) / 2;
  const baseY = ch - inset - cardH - 16;
  const out: HandSlot[] = [];
  for (let i = 0; i < n; i += 1) {
    const card = hand[i];
    const playable = interactive && isLegalPlay(card, top, activeColor);
    out.push({ card, x: startX + i * overlap, y: baseY - (playable ? 10 : 0), w: cardW, h: cardH, playable });
  }
  return out;
}

/** Topmost (last-drawn) card wins on overlap, so search back-to-front. */
function slotAtPoint(slots: HandSlot[], x: number, y: number): HandSlot | null {
  for (let i = slots.length - 1; i >= 0; i -= 1) {
    const s = slots[i];
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  }
  return null;
}

type PileRect = { x: number; y: number; w: number; h: number };

/**
 * The discard pile is drawn noticeably bigger than the draw pile - it is the one card every
 * player must be able to read at a glance (color + number/symbol), so it gets the size budget.
 */
function pileLayout(cw: number, ch: number, inset: number): { draw: PileRect; discard: PileRect } {
  const top = TOP + OPP_H;
  const discardW = Math.min(112, cw * 0.3);
  const discardH = discardW * 1.4;
  const drawW = Math.min(52, cw * 0.13);
  const drawH = drawW * 1.4;
  const gap = 20;
  const totalW = drawW + gap + discardW;
  const startX = cw / 2 - totalW / 2;
  const y = top + (ch - inset - top - discardH) / 2 - 14;
  return {
    draw: { x: startX, y: y + (discardH - drawH) / 2, w: drawW, h: drawH },
    discard: { x: startX + drawW + gap, y, w: discardW, h: discardH },
  };
}

function insideRect(r: PileRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// --- component state -----------------------------------------------------------

type Nudge = { cardId: number; t: number };

/**
 * A play (or draw) that just happened, held on screen for a visible beat before the game
 * moves on. `card` is null for a draw (nothing to fly to the discard pile). `fromOpponent`
 * is true only when the party who acted is NOT the person currently looking at the screen -
 * the computer in vs-computer mode - which is the one case that must never fire instantly or
 * chain without a pause. `settle` is the deferred turn/phase advance that used to run
 * immediately; it now runs only once this beat finishes, so nothing changes on screen while
 * the banner and animation are showing.
 */
type PlayAnim = {
  text: string;
  card: Card | null;
  fromOpponent: boolean;
  t: number;
  duration: number;
  settle: () => void;
};

type UIState = {
  mode: Mode;
  phase: Phase;
  game: GameState;
  /** Which hand index is the human's, in cpu mode. Alternates each round. */
  humanIndex: 0 | 1;
  /** Whose hand is fanned at the bottom of the screen right now - see comment on assignment. */
  viewer: 0 | 1;
  /** Whose turn the pass gate is about to reveal (2p mode). */
  pendingReveal: 0 | 1;
  pendingWild: Card | null;
  cpuWait: number;
  nudge: Nudge | null;
  anim: PlayAnim | null;
  /** Seconds remaining on a brief pulse of the active-color pill, right after a wild changes it. */
  colorFlash: number;
  overWinner: 0 | 1 | null;
  time: number;
};

function initialState(): UIState {
  return {
    mode: 'cpu',
    phase: 'menu',
    game: newGame(lcg(1)),
    humanIndex: 1, // flips to 0 on the first cpu match, so the child opens.
    viewer: 1,
    pendingReveal: 0,
    pendingWild: null,
    cpuWait: 0,
    nudge: null,
    anim: null,
    colorFlash: 0,
    overWinner: null,
    time: 0,
  };
}

/**
 * The computer's card choice (chooseCpuPlay) does not vary with difficulty -
 * dumping high-value cards sensibly is just good play, not a knob to weaken.
 * `difficulty` instead scales how long the computer "thinks" before each
 * move, exactly like an arcade game's SPEED_SCALE: brisk and businesslike on
 * hard, generously slow on easy so a young child can follow what happened.
 */
const CPU_THINK: Record<Difficulty, number> = {
  easy: 0.9,
  normal: 0.6,
  hard: 0.35,
};

function startRound(s: UIState, mode: Mode, rng: () => number, difficulty: Difficulty): void {
  s.mode = mode;
  s.game = newGame(rng);
  s.pendingWild = null;
  s.cpuWait = 0;
  s.nudge = null;
  s.anim = null;
  s.colorFlash = 0;
  s.overWinner = null;
  if (mode === 'cpu') {
    s.humanIndex = s.humanIndex === 0 ? 1 : 0;
    s.viewer = s.humanIndex;
    s.phase = 'play';
    if (s.game.turn !== s.humanIndex) s.cpuWait = CPU_THINK[difficulty];
  } else {
    s.pendingReveal = s.game.turn;
    s.phase = 'pass';
  }
}

/** "You" takes first-person verbs (lose/draw); every other seat takes third-person (loses/draws). */
function loseVerb(seat: string): string {
  return seat === 'You' ? 'lose' : 'loses';
}
function drawVerb(seat: string): string {
  return seat === 'You' ? 'draw' : 'draws';
}

/** Who a hand index is, from the screen's point of view: "You" / "Computer" / "Player 2". */
function seatLabel(mode: Mode, humanIndex: 0 | 1, idx: 0 | 1): string {
  if (mode === 'cpu') return idx === humanIndex ? 'You' : 'Computer';
  return `Player ${idx + 1}`;
}

/**
 * The banner text for a just-played card - "Computer played red 5.", or with an effect,
 * "Computer played red Draw Two! You draw 2." A wild that is colorless names the color it
 * chose so the change is called out in words, not just shown as a swatch.
 */
function playBanner(
  actorLabel: string,
  card: Card,
  effectiveColor: Color,
  effect: PlayEffect,
  opponentDrew: number,
  opponentLabel: string,
): string {
  let base = `${actorLabel} played ${describeCard(card)}`;
  if (!card.color) base += ` and chose ${effectiveColor}`;
  switch (effect) {
    case 'skip':
      return `${base}! ${opponentLabel} ${loseVerb(opponentLabel)} a turn.`;
    case 'reverse':
      return `${base}! Reverse.`;
    case 'draw2':
    case 'wild4':
      return `${base}! ${opponentLabel} ${drawVerb(opponentLabel)} ${opponentDrew}.`;
    default:
      return `${base}.`;
  }
}

/**
 * How long a play's banner + animation holds the screen before the game moves on.
 * `fromOpponent` plays (the computer, in vs-computer mode) always get the full
 * kid-readable pause (1.2-1.8s per the effect's weight); the viewer's own tap already has
 * instant tactile feedback, so it only gets a short confirmation blip.
 */
function pickAnimDuration(fromOpponent: boolean, effect: PlayEffect): number {
  if (!fromOpponent) return 0.55;
  switch (effect) {
    case 'wild4':
      return 1.8;
    case 'draw2':
      return 1.65;
    case 'skip':
      return 1.5;
    case 'reverse':
      return 1.4;
    default:
      return 1.2;
  }
}

// --- component -----------------------------------------------------------------

export default function CardMatch({ paused, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const stateRef = useRef<UIState>(initialState());
  const handSlotsRef = useRef<HandSlot[]>([]);
  const pileRef = useRef<{ draw: PileRect; discard: PileRect }>({
    draw: { x: 0, y: 0, w: 1, h: 1 },
    discard: { x: 0, y: 0, w: 1, h: 1 },
  });
  const colorButtonsRef = useRef<{ color: Color; x: number; y: number; w: number; h: number }[]>([]);
  const rngRef = useRef<() => number>(lcg(1));

  useEffect(() => {
    rngRef.current = lcg((Date.now() ^ Math.imul(restartToken + 1, 2654435761)) >>> 0 || 1);
    stateRef.current = initialState();
  }, [restartToken]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const resolveIfOver = (s: UIState, api: GameApi): boolean => {
    const w = winner(s.game);
    if (w === null) return false;
    s.phase = 'over';
    s.overWinner = w;
    s.pendingWild = null;
    if (s.mode === 'cpu') {
      if (w === s.humanIndex) {
        playSound('levelClear');
        api.addScore(60);
        api.setStatus('You win the round!');
      } else {
        api.died('Computer wins the round');
      }
    } else {
      playSound('levelClear');
      api.addScore(40);
      api.setStatus(`Player ${w + 1} wins the round!`);
    }
    return true;
  };

  /**
   * The turn/phase advance that used to happen the instant a play committed. Now deferred
   * behind the play's on-screen beat (see PlayAnim) so a kid actually gets to read the banner
   * and watch the card land before anything else moves - including the "you win" screen.
   */
  const afterPlaySettle = (s: UIState, actingPlayer: 0 | 1, api: GameApi): void => {
    if (resolveIfOver(s, api)) return;
    if (s.game.turn !== actingPlayer) {
      // Turn actually changed hands - in 2p mode, gate behind a pass screen.
      if (s.mode === '2p') {
        s.pendingReveal = s.game.turn;
        s.phase = 'pass';
      } else if (s.game.turn !== s.humanIndex) {
        s.cpuWait = CPU_THINK[difficulty];
      }
    } else if (s.mode === 'cpu' && s.game.turn !== s.humanIndex) {
      // Skip/Reverse/Draw2/Wild4 kept the turn with the player who just acted,
      // and that player is the computer - it goes again after its own beat.
      s.cpuWait = CPU_THINK[difficulty];
    }
  };

  /**
   * Commits a resolved PlayResult (hands/turn/discard all update immediately - the rules
   * never wait) and opens the visible beat: a banner naming the card, a card flying to the
   * discard pile, and every tap ignored until it finishes. Only once that beat elapses does
   * afterPlaySettle run, so the pass screen or the computer's next move never appears before
   * the kid has had a chance to see what just happened.
   */
  const commitPlay = (s: UIState, result: PlayResult, actingPlayer: 0 | 1, api: GameApi): void => {
    s.game = result.state;
    playSound('click');
    const playedCard = s.game.discard[s.game.discard.length - 1];
    if (!playedCard.color) s.colorFlash = 1;
    const fromOpponent = s.mode === 'cpu' && actingPlayer !== s.viewer;
    const actorLabel = seatLabel(s.mode, s.humanIndex, actingPlayer);
    const opponentLabel = seatLabel(s.mode, s.humanIndex, otherPlayer(actingPlayer));
    const text = playBanner(actorLabel, playedCard, s.game.activeColor, result.effect, result.opponentDrew, opponentLabel);
    s.anim = {
      text,
      card: playedCard,
      fromOpponent,
      t: 0,
      duration: pickAnimDuration(fromOpponent, result.effect),
      settle: () => afterPlaySettle(s, actingPlayer, api),
    };
  };

  const playCard = (s: UIState, player: 0 | 1, card: Card, chosenColor: Color | null, api: GameApi): void => {
    const result = applyPlay(s.game, player, card, chosenColor, rngRef.current);
    commitPlay(s, result, player, api);
  };

  const attemptDraw = (s: UIState, player: 0 | 1, api: GameApi): void => {
    s.game = drawCard(s.game, player, rngRef.current);
    playSound('brick');
    const actorLabel = seatLabel(s.mode, s.humanIndex, player);
    // Simplified house rule (kept deliberately for a young audience): drawing
    // always ends the turn, rather than allowing an immediate follow-up play.
    s.game = { ...s.game, turn: otherPlayer(player) };
    const fromOpponent = s.mode === 'cpu' && player !== s.viewer;
    s.anim = {
      text: `${actorLabel} drew a card.`,
      card: null,
      fromOpponent,
      t: 0,
      duration: fromOpponent ? 1.3 : 0.5,
      settle: () => afterPlaySettle(s, player, api),
    };
  };

  const onTap = (sx: number, sy: number, cw: number): void => {
    const s = stateRef.current;
    if (paused) return;
    unlockAudio();

    if (s.phase === 'menu') {
      if (sx < cw / 2) startRound(s, '2p', rngRef.current, difficulty);
      else startRound(s, 'cpu', rngRef.current, difficulty);
      playSound('powerup');
      return;
    }

    if (s.phase === 'pass') {
      s.phase = 'play';
      s.viewer = s.pendingReveal;
      playSound('click');
      return;
    }

    if (s.phase === 'over') {
      if (sx < 96 && sy < TOP) {
        s.phase = 'menu';
        playSound('click');
      } else {
        startRound(s, s.mode, rngRef.current, difficulty);
        playSound('powerup');
      }
      return;
    }

    // phase === 'play'
    if (s.anim) return; // a play (or the computer's) is still mid-beat - no input until it lands

    if (sx < 96 && sy < TOP) {
      s.phase = 'menu';
      playSound('click');
      return;
    }

    const current = s.game.turn;
    if (current !== s.viewer) return; // not the on-screen player's turn to act

    if (s.pendingWild) {
      for (const btn of colorButtonsRef.current) {
        if (sx >= btn.x && sx <= btn.x + btn.w && sy >= btn.y && sy <= btn.y + btn.h) {
          const card = s.pendingWild;
          s.pendingWild = null;
          playCard(s, current, card, btn.color, api);
          return;
        }
      }
      return; // tap elsewhere while choosing a color does nothing
    }

    const top = s.game.discard[s.game.discard.length - 1];
    const slot = slotAtPoint(handSlotsRef.current, sx, sy);
    if (slot) {
      if (!isLegalPlay(slot.card, top, s.game.activeColor)) {
        s.nudge = { cardId: slot.card.id, t: 0 };
        return;
      }
      if (slot.card.rank === 'wild' || slot.card.rank === 'wild4') {
        s.pendingWild = slot.card;
        return;
      }
      playCard(s, current, slot.card, null, api);
      return;
    }

    if (insideRect(pileRef.current.draw, sx, sy)) {
      attemptDraw(s, current, api);
      return;
    }
  };

  const { canvasRef } = useCanvasGame({
    active: true,
    step: (ctx, dt, cw, ch) => {
      const s = stateRef.current;
      pileRef.current = pileLayout(cw, ch, controlsInset);

      if (!paused) {
        s.time += dt;
        if (s.nudge) {
          s.nudge.t += dt;
          if (s.nudge.t > 0.3) s.nudge = null;
        }
        if (s.colorFlash > 0) s.colorFlash = Math.max(0, s.colorFlash - dt / 0.6);

        if (s.anim) {
          s.anim.t += dt;
          if (s.anim.t >= s.anim.duration) {
            const settle = s.anim.settle;
            s.anim = null;
            settle(); // runs the turn/phase advance that the beat above was holding back
          }
        }

        if (
          s.phase === 'play' &&
          s.mode === 'cpu' &&
          s.game.turn !== s.humanIndex &&
          !s.pendingWild &&
          !s.anim &&
          s.cpuWait > 0
        ) {
          s.cpuWait -= dt;
          if (s.cpuWait <= 0) {
            const cpu = s.game.turn;
            const top = s.game.discard[s.game.discard.length - 1];
            const choice = chooseCpuPlay(s.game.hands[cpu], top, s.game.activeColor, rngRef.current);
            if (choice) playCard(s, cpu, choice.card, choice.chosenColor, api);
            else attemptDraw(s, cpu, api);
          }
        }
      }

      if (s.phase === 'play' && !s.pendingWild) {
        const top = s.game.discard[s.game.discard.length - 1];
        const interactive = !s.anim && s.game.turn === s.viewer;
        handSlotsRef.current = layoutHand(
          s.game.hands[s.viewer],
          top,
          s.game.activeColor,
          cw,
          ch,
          controlsInset,
          interactive,
        );
      } else {
        handSlotsRef.current = [];
      }

      draw(ctx, s, cw, ch, controlsInset, paused, colorButtonsRef, handSlotsRef.current);
    },
  });

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full touch-none"
      onPointerDown={(e) => {
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onTap(e.clientX - r.left, e.clientY - r.top, r.width);
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

// --- drawing -------------------------------------------------------------------

function draw(
  ctx: CanvasRenderingContext2D,
  s: UIState,
  cw: number,
  ch: number,
  inset: number,
  paused: boolean,
  colorButtonsRef: { current: { color: Color; x: number; y: number; w: number; h: number }[] },
  handSlots: HandSlot[],
): void {
  ctx.clearRect(0, 0, cw, ch);
  const bg = ctx.createLinearGradient(0, 0, 0, ch);
  bg.addColorStop(0, '#161327');
  bg.addColorStop(1, '#0d0c1a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cw, ch);

  if (s.phase === 'menu') {
    drawMenu(ctx, cw, ch);
    if (paused) dim(ctx, cw, ch);
    return;
  }

  if (s.phase === 'pass') {
    drawPassScreen(ctx, s, cw, ch);
    if (paused) dim(ctx, cw, ch);
    return;
  }

  drawTopBar(ctx, s, cw, inset);
  drawOpponentPanel(ctx, s, cw);
  drawPiles(ctx, s, cw, ch, inset);
  if (!s.pendingWild) drawHand(ctx, handSlots, s.nudge);
  if (s.anim) drawPlayAnim(ctx, s, cw, ch, inset);
  if (s.phase === 'over') drawOver(ctx, s, cw, ch);
  if (s.pendingWild) drawColorPicker(ctx, cw, ch, colorButtonsRef);
  if (paused) dim(ctx, cw, ch);
}

function drawMenu(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(38, cw * 0.1)}px system-ui, sans-serif`;
  ctx.fillText('Color Cascade', cw / 2, ch * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `600 ${Math.min(17, cw * 0.042)}px system-ui, sans-serif`;
  ctx.fillText('Match the color, dodge the wilds, empty your hand!', cw / 2, ch * 0.16 + 30);

  const bw = Math.min(cw * 0.4, 250);
  const bh = Math.min(ch * 0.28, 200);
  const by = ch * 0.48 - bh / 2;
  drawMenuButton(ctx, cw / 2 - bw - 12, by, bw, bh, '2 Players', 'Pass and play', '#4ea8ff');
  drawMenuButton(ctx, cw / 2 + 12, by, bw, bh, 'vs Computer', 'Beat the bot', '#ff5a5a');

  drawMiniPinwheel(ctx, cw / 2, by + bh + 66, Math.min(30, cw * 0.07));
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `600 ${Math.min(14, cw * 0.036)}px system-ui, sans-serif`;
  ctx.fillText('Tap a side to start', cw / 2, by + bh + 100);
}

function drawMenuButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub: string,
  color: string,
): void {
  roundRect(ctx, x, y, w, h, 22);
  ctx.fillStyle = `${color}22`;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = `${color}aa`;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.min(24, w * 0.14)}px system-ui, sans-serif`;
  ctx.fillText(title, x + w / 2, y + h / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${Math.min(14, w * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(sub, x + w / 2, y + h / 2 + 26);
}

function drawPassScreen(ctx: CanvasRenderingContext2D, s: UIState, cw: number, ch: number): void {
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(34, cw * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(`Pass to Player ${s.pendingReveal + 1}`, cw / 2, ch * 0.44);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 ${Math.min(18, cw * 0.045)}px system-ui, sans-serif`;
  ctx.fillText('Tap when ready', cw / 2, ch * 0.44 + 34);
  drawMiniPinwheel(ctx, cw / 2, ch * 0.44 - 70, Math.min(34, cw * 0.08));
}

function drawTopBar(ctx: CanvasRenderingContext2D, s: UIState, cw: number, _inset: number): void {
  void _inset;
  roundRect(ctx, 12, 10, 72, TOP - 20, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Menu', 48, TOP / 2 + 1);

  const turnLabel =
    s.game.turn === s.viewer
      ? 'Your turn'
      : s.mode === 'cpu' && s.cpuWait > 0
        ? 'Computer thinking...'
        : `${seatLabel(s.mode, s.humanIndex, s.game.turn)}'s turn`;
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOR_HEX[s.game.activeColor];
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(turnLabel, cw - 16, TOP / 2 + 1);
}

/**
 * The other player, drawn plainly: name/label, their hand shown ONLY as face-down backs (never
 * their real cards - that would leak the computer's hand to the human), and a highlighted
 * border the instant it is actually their turn (thinking, mid-beat, or genuinely playing).
 */
function drawOpponentPanel(ctx: CanvasRenderingContext2D, s: UIState, cw: number): void {
  const oppIdx = otherPlayer(s.viewer);
  const label = seatLabel(s.mode, s.humanIndex, oppIdx);
  const count = s.game.hands[oppIdx].length;
  const isTurn = s.game.turn === oppIdx;

  const x = 14;
  const y = TOP + 6;
  const w = cw - 28;
  const h = OPP_H - 12;

  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = isTurn ? 'rgba(245,199,90,0.14)' : 'rgba(255,255,255,0.05)';
  ctx.fill();
  ctx.lineWidth = isTurn ? 3 : 1;
  ctx.strokeStyle = isTurn ? '#ffd76a' : 'rgba(255,255,255,0.12)';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = isTurn ? '#ffd76a' : 'rgba(255,255,255,0.85)';
  ctx.font = `bold ${Math.min(16, w * 0.05)}px system-ui, sans-serif`;
  ctx.fillText(label, x + 14, y + h / 2 - 5);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText(isTurn ? 'Playing now...' : `${count} card${count === 1 ? '' : 's'}`, x + 14, y + h / 2 + 14);

  // Their hand, shown only as face-down backs - one per card, capped so a big hand does not
  // spill off screen (an overflow badge covers the rest).
  const maxShown = 7;
  const shown = Math.max(0, Math.min(count, maxShown));
  if (shown > 0) {
    const bw = Math.min(24, (w * 0.44) / Math.max(3, shown));
    const bh = bw * 1.34;
    const step = bw * 0.44;
    const totalW = bw + step * (shown - 1);
    const startX = x + w - 14 - totalW;
    const by = y + h / 2 - bh / 2;
    for (let i = 0; i < shown; i += 1) {
      drawCardBack(ctx, startX + i * step, by, bw, bh);
    }
    if (count > maxShown) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(`+${count - maxShown}`, startX + totalW + 15, by + bh / 2 + 4);
    }
  }
}

function drawPiles(ctx: CanvasRenderingContext2D, s: UIState, cw: number, ch: number, inset: number): void {
  const p = pileLayout(cw, ch, inset);
  // Draw pile: a small card back stack.
  drawCardBack(ctx, p.draw.x, p.draw.y, p.draw.w, p.draw.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText(`${s.game.drawPile.length} left`, p.draw.x + p.draw.w / 2, p.draw.y + p.draw.h + 16);

  // The discard's top card is the one thing everyone must be able to read at a glance, so it
  // gets a bright glow ring in the current color plus a big, boldly labelled color pill below
  // it - since a played wild's own face is colorless, the pill is the only place that names the
  // color that is actually in play. The pill pulses bigger for a moment right after a wild
  // changes it (s.colorFlash), calling out the change instead of letting it slip by quietly.
  const top = s.game.discard[s.game.discard.length - 1];
  ctx.save();
  ctx.shadowColor = COLOR_HEX[s.game.activeColor];
  ctx.shadowBlur = 16;
  drawCardFace(ctx, top, p.discard.x, p.discard.y, p.discard.w, p.discard.h, 1);
  ctx.restore();

  const flashScale = 1 + s.colorFlash * 0.3;
  const pillW = Math.min(140, p.discard.w * 1.7) * flashScale;
  const pillH = 28 * flashScale;
  const pillX = p.discard.x + p.discard.w / 2 - pillW / 2;
  const pillY = p.discard.y + p.discard.h + 12;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = COLOR_HEX[s.game.activeColor];
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = `bold ${13 * flashScale}px system-ui, sans-serif`;
  ctx.fillText(s.game.activeColor.toUpperCase(), pillX + pillW / 2, pillY + pillH / 2 + 5 * flashScale);
}

/** Draws the current player's fan. Playable cards sit raised and full-bright; the rest are dimmed. */
function drawHand(ctx: CanvasRenderingContext2D, slots: HandSlot[], nudge: Nudge | null): void {
  for (const slot of slots) {
    const shaking = nudge && nudge.cardId === slot.card.id;
    const shakeX = shaking ? Math.sin(nudge.t * 55) * 6 * Math.max(0, 1 - nudge.t / 0.3) : 0;
    ctx.save();
    ctx.translate(shakeX, 0);
    if (!slot.playable) ctx.globalAlpha = 0.5;
    drawCardFace(ctx, slot.card, slot.x, slot.y, slot.w, slot.h, 1);
    ctx.restore();
  }
}

/**
 * The visible beat for a play: the banner naming exactly what was played (and what it did),
 * plus - for an actual card, not a draw - that card flying from whoever played it toward the
 * discard pile. The computer's plays fly in from the opponent panel up top; the viewer's own
 * plays (and a 2p player's own plays, before the pass screen) fly in from their own hand at
 * the bottom, so the direction of motion itself hints at who just acted.
 */
function drawPlayAnim(ctx: CanvasRenderingContext2D, s: UIState, cw: number, ch: number, inset: number): void {
  const anim = s.anim;
  if (!anim) return;
  const pile = pileLayout(cw, ch, inset);

  if (anim.card) {
    const target = { x: pile.discard.x + pile.discard.w / 2, y: pile.discard.y + pile.discard.h / 2 };
    const origin = anim.fromOpponent ? { x: cw / 2, y: TOP + OPP_H / 2 } : { x: cw / 2, y: ch - inset - 86 };
    const travel = Math.min(1, anim.t / Math.max(0.3, anim.duration * 0.5));
    const eased = 1 - (1 - travel) * (1 - travel) * (1 - travel);
    const x = origin.x + (target.x - origin.x) * eased;
    const y = origin.y + (target.y - origin.y) * eased;
    const w = pile.discard.w * 0.78;
    const h = w * 1.4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((1 - eased) * 0.35 * (anim.fromOpponent ? -1 : 1));
    ctx.translate(-x, -y);
    drawCardFace(ctx, anim.card, x - w / 2, y - h / 2, w, h, 0.82 + eased * 0.18);
    ctx.restore();
  }

  drawPlayBanner(ctx, anim, cw);
}

/** Word-wraps banner text so a long "drew 4 and is skipped" message never runs off screen. */
function wrapBannerText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawPlayBanner(ctx: CanvasRenderingContext2D, anim: PlayAnim, cw: number): void {
  const fadeIn = Math.min(1, anim.t / 0.15);
  const remaining = anim.duration - anim.t;
  const fadeOut = remaining < 0.3 ? Math.max(0, remaining / 0.3) : 1;
  const alpha = Math.min(fadeIn, fadeOut);
  if (alpha <= 0) return;

  const lines = wrapBannerText(anim.text, 34);
  const w = Math.min(360, cw - 24);
  const h = 16 + lines.length * 20;
  const x = cw / 2 - w / 2;
  const y = TOP + OPP_H + 6;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '700 14px system-ui, sans-serif';
  lines.forEach((line, i) => ctx.fillText(line, cw / 2, y + 22 + i * 20));
  ctx.restore();
}

function drawOver(ctx: CanvasRenderingContext2D, s: UIState, cw: number, ch: number): void {
  const msg =
    s.mode === 'cpu'
      ? s.overWinner === s.humanIndex
        ? 'You win the round!'
        : 'Computer wins the round'
      : `Player ${(s.overWinner ?? 0) + 1} wins the round!`;
  ctx.textAlign = 'center';
  const y = ch - 46;
  roundRect(ctx, cw / 2 - 160, y - 26, 320, 52, 16);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(msg, cw / 2, y - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('Tap to play again', cw / 2, y + 16);
}

function drawColorPicker(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  colorButtonsRef: { current: { color: Color; x: number; y: number; w: number; h: number }[] },
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(0, 0, cw, ch);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.min(24, cw * 0.06)}px system-ui, sans-serif`;
  ctx.fillText('Choose a color', cw / 2, ch * 0.34);

  const bw = Math.min(120, cw * 0.32);
  const bh = bw;
  const gap = 16;
  const gridW = bw * 2 + gap;
  const startX = cw / 2 - gridW / 2;
  const startY = ch * 0.4;
  const buttons: { color: Color; x: number; y: number; w: number; h: number }[] = [];
  COLORS.forEach((color, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = startX + col * (bw + gap);
    const y = startY + row * (bh + gap);
    buttons.push({ color, x, y, w: bw, h: bh });
    roundRect(ctx, x, y, bw, bh, 18);
    ctx.fillStyle = COLOR_HEX[color];
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = `bold ${Math.min(16, bw * 0.14)}px system-ui, sans-serif`;
    ctx.fillText(color.toUpperCase(), x + bw / 2, y + bh / 2 + 6);
  });
  colorButtonsRef.current = buttons;
}

function drawMiniPinwheel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const cols = [COLOR_HEX.red, COLOR_HEX.blue, COLOR_HEX.green, COLOR_HEX.yellow];
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, (Math.PI / 2) * i - Math.PI / 4, (Math.PI / 2) * (i + 1) - Math.PI / 4);
    ctx.closePath();
    ctx.fillStyle = cols[i];
    ctx.fill();
  }
}

function drawCardBack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  roundRect(ctx, x, y, w, h, w * 0.14);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#2a1e3d');
  g.addColorStop(1, '#1a1530');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();
  drawMiniPinwheel(ctx, x + w / 2, y + h / 2, w * 0.24);
}

/** Draws one card face: colored background, a bold glyph, and a subtle scale for feedback. */
function drawCardFace(
  ctx: CanvasRenderingContext2D,
  card: Card,
  x: number,
  y: number,
  w: number,
  h: number,
  scale: number,
): void {
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  roundRect(ctx, x, y, w, h, w * 0.14);
  ctx.fillStyle = card.color ? COLOR_HEX[card.color] : WILD_BG;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (card.rank === 'wild' || card.rank === 'wild4') {
    drawMiniPinwheel(ctx, cx, cy, w * 0.32);
    if (card.rank === 'wild4') {
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.arc(cx, cy, w * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#211d33';
      ctx.font = `bold ${w * 0.22}px system-ui, sans-serif`;
      ctx.fillText('+4', cx, cy + 1);
    }
  } else if (card.rank === 'skip') {
    ctx.lineWidth = w * 0.09;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, w * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.2, cy - w * 0.2);
    ctx.lineTo(cx + w * 0.2, cy + w * 0.2);
    ctx.stroke();
  } else if (card.rank === 'reverse') {
    ctx.lineWidth = w * 0.08;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, cy);
    ctx.lineTo(cx + w * 0.26, cy);
    ctx.stroke();
    drawArrowHead(ctx, cx + w * 0.26, cy, 0, w * 0.12);
    drawArrowHead(ctx, cx - w * 0.26, cy, Math.PI, w * 0.12);
  } else if (card.rank === 'draw2') {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${w * 0.34}px system-ui, sans-serif`;
    ctx.fillText('+2', cx, cy + 1);
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${w * 0.44}px system-ui, sans-serif`;
    ctx.fillText(card.rank, cx, cy + 1);
  }
  ctx.restore();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.6);
  ctx.lineTo(-size, size * 0.6);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}

function dim(ctx: CanvasRenderingContext2D, cw: number, ch: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, cw, ch);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
