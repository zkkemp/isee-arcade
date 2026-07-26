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

export const COLOR_HEX: Record<Color, string> = {
  red: '#ff5a5a',
  blue: '#4ea8ff',
  green: '#3ddc84',
  yellow: '#ffd75e',
};
const WILD_BG = '#211d33';

type HandSlot = { card: Card; x: number; y: number; w: number; h: number; playable: boolean };

function layoutHand(hand: Card[], top: Card, activeColor: Color, cw: number, ch: number, inset: number): HandSlot[] {
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
    const playable = isLegalPlay(card, top, activeColor);
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

function pileLayout(cw: number, ch: number, inset: number): { draw: PileRect; discard: PileRect } {
  const w = Math.min(64, cw * 0.16);
  const h = w * 1.4;
  const y = TOP + (ch - inset - TOP - h) / 2 - 30;
  return {
    draw: { x: cw / 2 - w - 10, y, w, h },
    discard: { x: cw / 2 + 10, y, w, h },
  };
}

function insideRect(r: PileRect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// --- component state -----------------------------------------------------------

type Banner = { text: string; t: number };
type Nudge = { cardId: number; t: number };

type UIState = {
  mode: Mode;
  phase: Phase;
  game: GameState;
  /** Which hand index is the human's, in cpu mode. Alternates each round. */
  humanIndex: 0 | 1;
  /** Whose turn the pass gate is about to reveal (2p mode). */
  pendingReveal: 0 | 1;
  pendingWild: Card | null;
  cpuWait: number;
  nudge: Nudge | null;
  banner: Banner | null;
  overWinner: 0 | 1 | null;
  time: number;
};

function initialState(): UIState {
  return {
    mode: 'cpu',
    phase: 'menu',
    game: newGame(lcg(1)),
    humanIndex: 1, // flips to 0 on the first cpu match, so the child opens.
    pendingReveal: 0,
    pendingWild: null,
    cpuWait: 0,
    nudge: null,
    banner: null,
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
  s.banner = null;
  s.overWinner = null;
  if (mode === 'cpu') {
    s.humanIndex = s.humanIndex === 0 ? 1 : 0;
    s.phase = 'play';
    if (s.game.turn !== s.humanIndex) s.cpuWait = CPU_THINK[difficulty];
  } else {
    s.pendingReveal = s.game.turn;
    s.phase = 'pass';
  }
}

function effectLabel(effect: PlayEffect, opponentDrew: number, opponentName: string): string | null {
  switch (effect) {
    case 'skip':
      return `Skip! ${opponentName} loses a turn.`;
    case 'reverse':
      return 'Reverse!';
    case 'draw2':
      return `${opponentName} draws ${opponentDrew} and is skipped!`;
    case 'wild4':
      return `${opponentName} draws ${opponentDrew} and is skipped!`;
    default:
      return null;
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

  const opponentName = (s: UIState, forPlayer: 0 | 1): string => {
    if (s.mode === 'cpu') return forPlayer === s.humanIndex ? 'Computer' : 'You';
    return `Player ${forPlayer + 1}`;
  };

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

  /** Commits a resolved PlayResult: applies effects, checks for a winner, advances turn/phase. */
  const commitPlay = (s: UIState, result: PlayResult, actingPlayer: 0 | 1, api: GameApi): void => {
    s.game = result.state;
    playSound('click');
    const label = effectLabel(result.effect, result.opponentDrew, opponentName(s, otherPlayer(actingPlayer)));
    if (label) s.banner = { text: label, t: 0 };
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
      // and that player is the computer - it goes again after a short beat.
      s.cpuWait = CPU_THINK[difficulty];
    }
  };

  const playCard = (s: UIState, player: 0 | 1, card: Card, chosenColor: Color | null, api: GameApi): void => {
    const result = applyPlay(s.game, player, card, chosenColor, rngRef.current);
    commitPlay(s, result, player, api);
  };

  const attemptDraw = (s: UIState, player: 0 | 1, api: GameApi): void => {
    void api;
    s.game = drawCard(s.game, player, rngRef.current);
    playSound('brick');
    const who = otherPlayerLabel(s.mode, s.humanIndex, player);
    s.banner = { text: `${s.mode === '2p' ? who : player === s.humanIndex ? 'You' : 'Computer'} drew a card.`, t: 0 };
    // Simplified house rule (kept deliberately for a young audience): drawing
    // always ends the turn, rather than allowing an immediate follow-up play.
    s.game = { ...s.game, turn: otherPlayer(player) };
    if (s.mode === '2p') {
      s.pendingReveal = s.game.turn;
      s.phase = 'pass';
    } else if (s.game.turn !== s.humanIndex) {
      s.cpuWait = CPU_THINK[difficulty];
    }
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
    if (sx < 96 && sy < TOP) {
      s.phase = 'menu';
      playSound('click');
      return;
    }

    const current = s.game.turn;
    if (s.mode === 'cpu' && current !== s.humanIndex) return; // computer's turn

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
        if (s.banner) {
          s.banner.t += dt;
          if (s.banner.t > 1.4) s.banner = null;
        }
        if (s.nudge) {
          s.nudge.t += dt;
          if (s.nudge.t > 0.3) s.nudge = null;
        }

        if (
          s.phase === 'play' &&
          s.mode === 'cpu' &&
          s.game.turn !== s.humanIndex &&
          !s.pendingWild &&
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
        handSlotsRef.current = layoutHand(
          s.game.hands[s.game.turn],
          top,
          s.game.activeColor,
          cw,
          ch,
          controlsInset,
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

function otherPlayerLabel(mode: Mode, humanIndex: 0 | 1, player: 0 | 1): string {
  if (mode === 'cpu') return player === humanIndex ? 'You' : 'Computer';
  return `Player ${player + 1}`;
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
  drawPiles(ctx, s, cw, ch, inset);
  if (!s.pendingWild) drawHand(ctx, handSlots, s.nudge);
  if (s.banner) drawBanner(ctx, s.banner, cw);
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

  const current = s.game.turn;
  const turnLabel =
    s.mode === 'cpu'
      ? current === s.humanIndex
        ? 'Your turn'
        : 'Computer thinking...'
      : `Player ${current + 1}'s turn`;
  ctx.textAlign = 'right';
  ctx.fillStyle = COLOR_HEX[s.game.activeColor];
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText(turnLabel, cw - 16, TOP / 2 - 5);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 13px system-ui, sans-serif';
  const oppIdx = otherPlayer(current);
  const oppCount = s.game.hands[oppIdx].length;
  const oppLabel = otherPlayerLabel(s.mode, s.humanIndex, oppIdx);
  ctx.fillText(`${oppLabel}: ${oppCount} cards`, cw - 16, TOP / 2 + 13);
}

function drawPiles(ctx: CanvasRenderingContext2D, s: UIState, cw: number, ch: number, inset: number): void {
  const p = pileLayout(cw, ch, inset);
  // Draw pile: a small card back stack.
  drawCardBack(ctx, p.draw.x, p.draw.y, p.draw.w, p.draw.h);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.fillText(`${s.game.drawPile.length} left`, p.draw.x + p.draw.w / 2, p.draw.y + p.draw.h + 16);

  const top = s.game.discard[s.game.discard.length - 1];
  drawCardFace(ctx, top, p.discard.x, p.discard.y, p.discard.w, p.discard.h, 1);
  // Active color swatch under the discard, since a played wild's own color is null.
  ctx.beginPath();
  ctx.fillStyle = COLOR_HEX[s.game.activeColor];
  ctx.arc(p.discard.x + p.discard.w / 2, p.discard.y + p.discard.h + 10, 7, 0, Math.PI * 2);
  ctx.fill();
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

function drawBanner(ctx: CanvasRenderingContext2D, banner: Banner, cw: number): void {
  const alpha = banner.t < 1.1 ? 1 : Math.max(0, 1 - (banner.t - 1.1) / 0.3);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  roundRect(ctx, cw / 2 - 170, TOP + 8, 340, 34, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(banner.text, cw / 2, TOP + 8 + 22);
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
