'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

export type Hair = 'curl' | 'spike' | 'bob' | 'wave';
export type Face = {
  id: string; name: string; skin: string; hair: Hair; hairColor: string; shirt: string;
  glasses: boolean; hat: boolean; smile: boolean; freckles: boolean;
};
export type QuestionId = 'glasses' | 'hat' | 'smile' | 'freckles' | 'curl' | 'spike' | 'bob' | 'warm-shirt';
export type QuestionCategory = 'ACCESSORIES' | 'EXPRESSION' | 'HAIR' | 'COLOR';
export type Question = {
  id: QuestionId; category: QuestionCategory; label: string; short: string; icon: string;
  test: (face: Face) => boolean;
};

/** Original procedural cast: no character art, title, or names are borrowed. */
export const FACES: Face[] = ([
  ['Ari','#9a5a3c','curl','#382318','#ff7b63',false,false,true,true], ['Bea','#f1bd91','bob','#59362b','#5ea6e8',true,false,false,false], ['Cal','#70422d','spike','#191c2d','#ffd14c',false,true,true,false], ['Dani','#c77c55','wave','#e3b553','#8d6bdb',false,false,false,true],
  ['Eli','#e0a47d','curl','#c85a39','#4cbf91',true,false,true,false], ['Faye','#6c392b','bob','#161823','#ff8575',false,true,false,true], ['Gus','#f4c49d','spike','#8c552a','#f0af36',true,false,true,true], ['Hana','#ad6347','wave','#301f1b','#4e8fdb',false,false,false,false],
  ['Ivo','#8d5138','curl','#d08a31','#d96ca4',false,true,true,false], ['Juno','#f5d0ad','bob','#c24537','#53b4a3',true,false,false,true], ['Kai','#623724','spike','#34251d','#e7d35d',false,false,true,false], ['Lumi','#d99268','wave','#26202a','#ef765b',true,true,false,false],
  ['Mika','#b66c4d','curl','#432b25','#62a9e5',false,false,true,true], ['Nico','#efbd91','bob','#e7b02d','#7e67cf',true,true,false,false], ['Omi','#79452f','spike','#252627','#4cbf91',false,false,true,true], ['Pax','#d7835a','wave','#6c3c26','#ffbd49',true,false,false,false],
  ['Quin','#9b573e','curl','#1d1b22','#db6ba4',false,true,true,false], ['Rae','#f1c9a5','bob','#60402c','#e66d99',true,false,false,true], ['Sol','#693a29','spike','#ba633b','#f17a5f',false,false,true,false], ['Tess','#ca805e','wave','#322217','#7abf80',true,true,false,true],
  ['Uma','#a45d42','curl','#e2a42d','#edbd4c',false,false,true,false], ['Vale','#edb78e','bob','#24202a','#9b77d3',true,true,false,true], ['Wren','#71412d','spike','#4b3026','#e66d99',false,false,true,true], ['Zia','#d98d68','wave','#b84536','#e66d99',true,false,false,false],
] as Array<[string, string, Hair, string, string, boolean, boolean, boolean, boolean]>)
  .map(([name, skin, hair, hairColor, shirt, glasses, hat, smile, freckles]) =>
    ({ id: name.toLowerCase(), name, skin, hair, hairColor, shirt, glasses, hat, smile, freckles }));

export const QUESTIONS: Question[] = [
  { id: 'glasses', category: 'ACCESSORIES', label: 'Are they wearing glasses?', short: 'GLASSES', icon: '◉', test: (f) => f.glasses },
  { id: 'hat', category: 'ACCESSORIES', label: 'Are they wearing a hat?', short: 'HAT', icon: '⌂', test: (f) => f.hat },
  { id: 'smile', category: 'EXPRESSION', label: 'Are they smiling?', short: 'SMILING', icon: '⌣', test: (f) => f.smile },
  { id: 'freckles', category: 'EXPRESSION', label: 'Do they have freckles?', short: 'FRECKLES', icon: '∴', test: (f) => f.freckles },
  { id: 'curl', category: 'HAIR', label: 'Do they have curly hair?', short: 'CURLY HAIR', icon: '≈', test: (f) => f.hair === 'curl' },
  { id: 'spike', category: 'HAIR', label: 'Do they have spiky hair?', short: 'SPIKY HAIR', icon: '▲', test: (f) => f.hair === 'spike' },
  { id: 'bob', category: 'HAIR', label: 'Do they have a bob haircut?', short: 'BOB HAIR', icon: '▰', test: (f) => f.hair === 'bob' },
  { id: 'warm-shirt', category: 'COLOR', label: 'Are they wearing a warm-color top?', short: 'WARM TOP', icon: '●', test: (f) => ['#ff7b63','#ff8575','#ef765b','#f17a5f','#e66d99','#db6ba4'].includes(f.shirt) },
];

export const lcg = (seed: number): [number, number] => {
  const next = (Math.imul(seed >>> 0, 1103515245) + 12345) >>> 0;
  return [next, next / 4294967296];
};
export function ask(secret: Face, question: QuestionId): boolean {
  return QUESTIONS.find((q) => q.id === question)?.test(secret) ?? false;
}
export function remainingFaces(eliminated: boolean[]): Face[] {
  return FACES.filter((_, i) => !eliminated[i]);
}
export function candidateIndices(eliminated: boolean[]): number[] {
  return FACES.flatMap((_, i) => eliminated[i] ? [] : [i]);
}
export function eliminateInconsistent(eliminated: boolean[], question: QuestionId, answer: boolean): boolean[] {
  const q = QUESTIONS.find((item) => item.id === question);
  return eliminated.map((gone, i) => gone || (q ? q.test(FACES[i]) !== answer : false));
}
export function isSolvableWithAllQuestions(): boolean {
  return FACES.every((face, i) => FACES.every((other, j) =>
    i === j || QUESTIONS.some((q) => q.test(face) !== q.test(other))));
}

/**
 * Deterministic clue coach: minimize the larger side of the yes/no split.
 * Stable question order resolves ties, so tests and kids see consistent advice.
 */
export function bestQuestionFor(candidates: number[], asked: QuestionId[]): QuestionId | null {
  if (candidates.length <= 1) return null;
  const available = QUESTIONS.filter((q) => !asked.includes(q.id));
  let best: { id: QuestionId; worst: number; spread: number } | null = null;
  for (const q of available) {
    const yes = candidates.filter((i) => q.test(FACES[i])).length;
    const no = candidates.length - yes;
    if (yes === 0 || no === 0) continue;
    const result = { id: q.id, worst: Math.max(yes, no), spread: Math.abs(yes - no) };
    if (!best || result.worst < best.worst || (result.worst === best.worst && result.spread < best.spread)) best = result;
  }
  return best?.id ?? null;
}
export function coachPathForSecret(secretIndex: number): QuestionId[] {
  if (!FACES[secretIndex]) return [];
  let eliminated = Array(FACES.length).fill(false); const asked: QuestionId[] = [];
  while (candidateIndices(eliminated).length > 1 && asked.length < QUESTIONS.length) {
    const question = bestQuestionFor(candidateIndices(eliminated), asked);
    if (!question) break;
    asked.push(question);
    eliminated = eliminateInconsistent(eliminated, question, ask(FACES[secretIndex], question));
  }
  return asked;
}

/** The smallest question set whose answer pattern identifies this face alone. */
export function minimumClueSet(secretIndex: number): QuestionId[] {
  const secret = FACES[secretIndex];
  if (!secret) return [];
  let best: QuestionId[] = QUESTIONS.map((q) => q.id);
  for (let mask = 1; mask < 2 ** QUESTIONS.length; mask += 1) {
    const chosen = QUESTIONS.filter((_, i) => (mask & (1 << i)) !== 0);
    if (chosen.length >= best.length) continue;
    const unique = FACES.every((other, otherIndex) =>
      otherIndex === secretIndex || chosen.some((q) => q.test(secret) !== q.test(other)));
    if (unique) best = chosen.map((q) => q.id);
  }
  return best;
}
export function clueBudgetFor(secretIndex: number, level: number, difficulty: Difficulty): number {
  const base = difficulty === 'easy' ? 8 : difficulty === 'normal' ? 7 : 6;
  const planned = Math.max(3, base - Math.floor((level - 1) / 3));
  return Math.max(planned, minimumClueSet(secretIndex).length, coachPathForSecret(secretIndex).length);
}
export function roundFor(seed: number, level: number, difficulty: Difficulty): { secret: number; clues: number; seed: number } {
  const [next, random] = lcg(seed); const secret = Math.floor(random * FACES.length);
  return { secret, clues: clueBudgetFor(secret, level, difficulty), seed: next };
}

type Phase = 'setup' | 'board' | 'clues' | 'guess' | 'won' | 'lost';
type State = {
  seed: number; level: number; secret: number; clues: number; clueBudget: number; asked: QuestionId[];
  eliminated: boolean[]; selected: number | null; phase: Phase; message: string; detail: string;
  pulse: number; answer: boolean | null; newlyEliminated: number[]; revealT: number;
};
function fresh(difficulty: Difficulty): State {
  const r = roundFor(98631, 1, difficulty);
  return {
    seed: r.seed, level: 1, secret: r.secret, clues: r.clues, clueBudget: r.clues, asked: [],
    eliminated: Array(FACES.length).fill(false), selected: null, phase: 'setup',
    message: 'READY, DETECTIVE?', detail: 'Find the hidden crew member with smart yes-or-no clues.',
    pulse: 0, answer: null, newlyEliminated: [], revealT: 0,
  };
}
function nextRound(s: State, difficulty: Difficulty): void {
  const r = roundFor(s.seed, s.level + 1, difficulty);
  Object.assign(s, {
    seed: r.seed, level: s.level + 1, secret: r.secret, clues: r.clues, clueBudget: r.clues,
    asked: [], eliminated: Array(FACES.length).fill(false), selected: null, answer: null,
    phase: 'setup', message: `CASE ${s.level + 1}`, detail: 'A new crew member is hiding.',
    newlyEliminated: [], revealT: 0,
  });
}
export function retryCase(s: { clueBudget: number }): { clues: number; asked: QuestionId[]; eliminated: boolean[] } {
  return { clues: s.clueBudget, asked: [], eliminated: Array(FACES.length).fill(false) };
}

export default function MysteryFaces({ paused, input, api, restartToken, difficulty }: GameCanvasProps) {
  const ref = useRef(fresh(difficulty));
  useEffect(() => { ref.current = fresh(difficulty); }, [restartToken, difficulty]);
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, w, h) => {
    const s = ref.current; s.pulse = Math.max(0, s.pulse - dt); s.revealT = Math.max(0, s.revealT - dt);
    const pressed = input.consumePointerPress(); const jump = input.consumeJump();
    const x = (input.pointerX ?? .5) * w; const y = (input.pointerY ?? .5) * h;

    if (s.phase === 'setup' && (pressed || jump)) {
      s.phase = 'board'; s.message = 'ASK YOUR FIRST CLUE'; s.detail = 'The clue coach marks a strong question for you.'; playSound('pass');
    } else if (s.phase === 'won' && (pressed || jump)) {
      nextRound(s, difficulty); playSound('pass');
    } else if (s.phase === 'lost' && (pressed || jump)) {
      const retry = retryCase(s); s.clues = retry.clues; s.asked = retry.asked; s.eliminated = retry.eliminated;
      s.selected = null; s.answer = null; s.newlyEliminated = []; s.phase = 'board';
      s.message = 'FRESH CLUE BOOK'; s.detail = `All ${s.clueBudget} clues are ready. The hidden face stays the same.`; playSound('pass');
    } else if (s.phase === 'board' && pressed) {
      if (y < 142 && x < w * .6) {
        if (s.clues > 0) { s.phase = 'clues'; s.message = 'CHOOSE A YES-OR-NO CLUE'; s.detail = 'Clue Coach marks the question that splits the remaining faces best.'; playSound('click'); }
        else { s.message = 'CLUE BOOK EMPTY'; s.detail = 'Use the answers you have and make your best guess.'; playSound('wrong'); }
      } else if (y < 142 && x >= w * .6) {
        s.phase = 'guess'; s.message = 'FINAL GUESS'; s.detail = 'Tap one face. Check every clue before you choose.'; playSound('click');
      } else {
        const index = faceIndexAt(x, y, w, h);
        if (index !== null && !s.eliminated[index]) { s.selected = index; s.message = FACES[index].name.toUpperCase(); s.detail = 'Candidate selected. Keep asking clues or make your final guess.'; playSound('click'); }
      }
    } else if (s.phase === 'clues' && pressed) {
      if (y < 83) {
        s.phase = 'board'; s.message = 'BACK TO THE BOARD'; s.detail = 'Ask a clue or review who is still in the case.'; playSound('click');
      } else {
        const questionIndex = questionIndexAt(x, y, w, h);
        if (questionIndex !== null) {
          const q = QUESTIONS[questionIndex];
          if (!s.asked.includes(q.id) && s.clues > 0) {
            const answer = ask(FACES[s.secret], q.id); const before = s.eliminated;
            const after = eliminateInconsistent(before, q.id, answer);
            s.newlyEliminated = after.flatMap((gone, i) => gone && !before[i] ? [i] : []);
            s.eliminated = after; s.asked.push(q.id); s.clues -= 1; s.answer = answer; s.phase = 'board'; s.revealT = .9; s.pulse = .6;
            const left = candidateIndices(after).length;
            s.message = answer ? `YES — ${q.short}` : `NO — NOT ${q.short}`;
            s.detail = `${s.newlyEliminated.length} ruled out. ${left} ${left === 1 ? 'face remains' : 'faces remain'}.`;
            playSound(answer ? 'correct' : 'wrong');
          }
        }
      }
    } else if (s.phase === 'guess' && pressed) {
      if (y < 142) {
        s.phase = 'board'; s.message = 'KEEP INVESTIGATING'; s.detail = 'You can ask another clue before guessing.'; playSound('click');
      } else {
        const index = faceIndexAt(x, y, w, h);
        if (index !== null && !s.eliminated[index]) {
          s.selected = index;
          if (index === s.secret) {
            s.phase = 'won'; s.message = `CASE CLOSED — ${FACES[index].name.toUpperCase()}!`; s.detail = 'Excellent deduction. Tap for the next mystery.'; s.pulse = 1;
            api.addScore(50 + s.clues * 8); api.requestGate(`Mystery Faces case ${s.level} solved!`); playSound('levelClear');
          } else {
            s.phase = 'lost'; s.message = `NOT ${FACES[index].name.toUpperCase()}`; s.detail = `Tap to retry this case with all ${s.clueBudget} clues restored.`; playSound('wrong');
          }
        }
      }
    }
    draw(ctx, s, w, h);
  }});
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Mystery Faces original deduction game" />;
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function boardMetrics(w: number, h: number) {
  const top = 154; const bottom = h - 12; const cellW = w / 4; const cellH = (bottom - top) / 6;
  return { top, bottom, cellW, cellH };
}
function faceIndexAt(x: number, y: number, w: number, h: number): number | null {
  const b = boardMetrics(w, h); if (y < b.top || y >= b.bottom) return null;
  const col = clamp(Math.floor(x / b.cellW), 0, 3); const row = clamp(Math.floor((y - b.top) / b.cellH), 0, 5);
  return row * 4 + col;
}
function cluePanelMetrics(w: number, h: number) {
  const top = 102; const gap = 9; const side = 12; const cardW = (w - side * 2 - gap) / 2;
  const cardH = Math.max(55, (h - top - 20 - gap * 3) / 4);
  return { top, gap, side, cardW, cardH };
}
function questionIndexAt(x: number, y: number, w: number, h: number): number | null {
  const m = cluePanelMetrics(w, h); const col = x < w / 2 ? 0 : 1;
  const row = Math.floor((y - m.top) / (m.cardH + m.gap));
  if (row < 0 || row > 3) return null;
  const cardX = m.side + col * (m.cardW + m.gap); const cardY = m.top + row * (m.cardH + m.gap);
  if (x < cardX || x > cardX + m.cardW || y < cardY || y > cardY + m.cardH) return null;
  return row * 2 + col;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function faceArt(ctx: CanvasRenderingContext2D, f: Face, x: number, y: number, size: number, faded: boolean, selected: boolean, flash: boolean): void {
  ctx.save(); ctx.globalAlpha = faded ? .24 : 1; ctx.translate(x, y); const r = size * .3;
  ctx.shadowColor = selected ? '#ffe174' : 'rgba(0,0,0,.25)'; ctx.shadowBlur = selected ? 13 : 5;
  roundRect(ctx, -size * .43, -size * .48, size * .86, size * .96, size * .12, flash ? '#70495e' : selected ? '#244f6d' : '#173b58', selected ? '#ffe174' : '#4d7995');
  ctx.shadowBlur = 0; ctx.fillStyle = f.shirt; ctx.beginPath(); ctx.ellipse(0, r * .93, r * .82, r * .48, 0, 0, Math.PI * 2); ctx.fill();
  if (f.hair === 'bob') { ctx.fillStyle = f.hairColor; ctx.beginPath(); ctx.arc(0, -r * .06, r * 1.1, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(-r * 1.08, -r * .08, r * 2.16, r * .92); }
  ctx.fillStyle = f.skin; ctx.beginPath(); ctx.arc(0, -r * .04, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = f.hairColor;
  if (f.hair === 'spike') { ctx.beginPath(); ctx.moveTo(-r,-r*.35); ctx.lineTo(-r*.7,-r*1.05); ctx.lineTo(-r*.25,-r*.62); ctx.lineTo(0,-r*1.12); ctx.lineTo(r*.32,-r*.62); ctx.lineTo(r*.78,-r*1.05); ctx.lineTo(r,-r*.28); ctx.fill(); }
  else if (f.hair !== 'bob') for (let i = -2; i <= 2; i += 1) { ctx.beginPath(); ctx.arc(i * r * .36, -r * .55, r * (f.hair === 'curl' ? .4 : .34), 0, Math.PI * 2); ctx.fill(); }
  if (f.hat) { ctx.fillStyle='#4a65a1'; ctx.fillRect(-r*1.05,-r*.9,r*2.1,r*.25); ctx.beginPath(); ctx.arc(0,-r*.9,r*.72,Math.PI,0); ctx.fill(); }
  ctx.fillStyle='#142033'; [-r*.38,r*.38].forEach((ex)=>{ctx.beginPath();ctx.arc(ex,-r*.02,r*.09,0,Math.PI*2);ctx.fill();});
  if(f.glasses){ctx.strokeStyle='#1c2c43';ctx.lineWidth=Math.max(1,size*.035);ctx.strokeRect(-r*.68,-r*.22,r*.45,r*.34);ctx.strokeRect(r*.23,-r*.22,r*.45,r*.34);ctx.beginPath();ctx.moveTo(-r*.23,-r*.05);ctx.lineTo(r*.23,-r*.05);ctx.stroke();}
  if(f.freckles){ctx.fillStyle='#9b583e';[-.35,-.18,.18,.35].forEach(v=>{ctx.beginPath();ctx.arc(v*r,r*.28,r*.045,0,7);ctx.fill();});}
  ctx.strokeStyle='#6b3540';ctx.lineWidth=Math.max(1,size*.025);ctx.beginPath();if(f.smile)ctx.arc(0,r*.31,r*.32,.1,Math.PI-.1);else{ctx.moveTo(-r*.26,r*.43);ctx.lineTo(r*.26,r*.43);}ctx.stroke();
  if (faded) { ctx.globalAlpha = .88; ctx.strokeStyle = '#ff7d87'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-size*.32,-size*.34); ctx.lineTo(size*.32,size*.34); ctx.moveTo(size*.32,-size*.34); ctx.lineTo(-size*.32,size*.34); ctx.stroke(); }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#102b48'); g.addColorStop(.55, '#1d4261'); g.addColorStop(1, '#4e315f'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(154,217,238,.07)'; ctx.lineWidth = 1;
  for (let x = -h; x < w + h; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke(); }
}
function drawHeader(ctx: CanvasRenderingContext2D, s: State, w: number): void {
  roundRect(ctx, 8, 8, w - 16, 70, 17, 'rgba(7,20,39,.86)', '#466f8b');
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffe27d'; ctx.font = `900 ${w < 370 ? 16 : 19}px ui-rounded,system-ui`; ctx.fillText(`MYSTERY FACES  ·  CASE ${s.level}`, 20, 33);
  ctx.fillStyle = '#bfe9ff'; ctx.font = '800 11px system-ui'; ctx.fillText(`${candidateIndices(s.eliminated).length} SUSPECTS  ·  ${s.clues}/${s.clueBudget} CLUES`, 20, 55);
  const feedback = `${s.message} · ${s.detail}`; const limit = Math.max(28, Math.floor((w - 45) / 5.4));
  ctx.fillStyle = s.pulse > 0 ? '#fff0a3' : '#9fc8dc'; ctx.font = '700 8px system-ui';
  ctx.fillText(feedback.length > limit ? `${feedback.slice(0, limit - 1)}…` : feedback, 20, 69);
  if (s.answer !== null) { roundRect(ctx, w - 78, 18, 57, 40, 12, s.answer ? '#54d4a0' : '#ff8b91'); ctx.fillStyle = '#10263d'; ctx.font = '900 17px system-ui'; ctx.textAlign = 'center'; ctx.fillText(s.answer ? 'YES' : 'NO', w - 49.5, 44); }
}
function drawToolbar(ctx: CanvasRenderingContext2D, s: State, w: number): void {
  const leftW = w * .6 - 12; const rightX = w * .6 + 4;
  roundRect(ctx, 8, 88, leftW, 50, 14, s.clues ? '#f4c85b' : '#667384', s.clues ? '#fff0a3' : '#88929d');
  ctx.fillStyle = '#17304a'; ctx.font = `900 ${w < 370 ? 12 : 14}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(s.clues ? `?  ASK A CLUE  (${s.clues})` : 'CLUES USED', 8 + leftW / 2, 119);
  roundRect(ctx, rightX, 88, w - rightX - 8, 50, 14, '#63d6b2', '#aff7df'); ctx.fillStyle = '#14324b'; ctx.fillText('✓  GUESS', rightX + (w - rightX - 8) / 2, 119);
}
function drawBoard(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const b = boardMetrics(w, h);
  FACES.forEach((f, i) => {
    const col = i % 4; const row = Math.floor(i / 4); const x = col * b.cellW + b.cellW / 2; const y = b.top + row * b.cellH + b.cellH / 2;
    const size = Math.min(b.cellW, b.cellH) * .88; const freshElimination = s.revealT > 0 && s.newlyEliminated.includes(i);
    faceArt(ctx, f, x, y - 2, size, s.eliminated[i], s.selected === i, freshElimination);
    ctx.fillStyle = s.eliminated[i] ? 'rgba(255,255,255,.35)' : '#fff'; ctx.font = `900 ${Math.max(8, Math.min(11, b.cellH * .13))}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(f.name.toUpperCase(), x, y + size * .42);
  });
}
function drawClues(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  drawBackground(ctx, w, h); roundRect(ctx, 8, 8, w - 16, 70, 17, 'rgba(7,20,39,.9)', '#6e91a8');
  ctx.fillStyle = '#ffe27d'; ctx.font = `900 ${w < 370 ? 17 : 20}px ui-rounded,system-ui`; ctx.textAlign = 'left'; ctx.fillText('←  CLUE BOOK', 20, 35);
  ctx.fillStyle = '#c7e9fb'; ctx.font = '700 10px system-ui'; ctx.fillText('Tap a large question card. “COACH PICK” is the best split.', 20, 57);
  const m = cluePanelMetrics(w, h); const candidates = candidateIndices(s.eliminated); const coach = bestQuestionFor(candidates, s.asked);
  QUESTIONS.forEach((q, i) => {
    const col = i % 2; const row = Math.floor(i / 2); const x = m.side + col * (m.cardW + m.gap); const y = m.top + row * (m.cardH + m.gap);
    const used = s.asked.includes(q.id); const recommended = q.id === coach;
    roundRect(ctx, x, y, m.cardW, m.cardH, 15, used ? 'rgba(67,89,111,.72)' : recommended ? '#f8d66c' : '#f3f7f1', recommended ? '#fff1a5' : '#85a8b9');
    ctx.textAlign = 'left'; ctx.fillStyle = used ? '#9daebb' : '#17324a'; ctx.font = `900 ${Math.min(22, m.cardH * .3)}px system-ui`; ctx.fillText(q.icon, x + 12, y + 29);
    ctx.font = '900 8px system-ui'; ctx.fillStyle = used ? '#aab7c0' : '#527087'; ctx.fillText(q.category, x + 42, y + 18);
    ctx.font = `900 ${w < 370 ? 10 : 11}px system-ui`; ctx.fillStyle = used ? '#aab7c0' : '#163149'; ctx.fillText(used ? 'ALREADY ASKED' : q.short, x + 42, y + 36);
    if (used) {
      ctx.fillStyle = ask(FACES[s.secret], q.id) ? '#81e7bc' : '#ff9ca2'; ctx.font = '900 9px system-ui';
      ctx.fillText(`ANSWER: ${ask(FACES[s.secret], q.id) ? 'YES' : 'NO'}`, x + 12, y + m.cardH - 10);
    } else {
      const yes = candidates.filter((candidate) => q.test(FACES[candidate])).length; const no = candidates.length - yes;
      ctx.fillStyle = recommended ? '#9b5a19' : '#567187'; ctx.font = '900 8px system-ui';
      ctx.fillText(recommended ? `★ COACH PICK  ·  ${yes} YES / ${no} NO` : `${yes} YES  ·  ${no} NO`, x + 12, y + m.cardH - 10);
    }
  });
}
function drawSetup(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  drawBackground(ctx, w, h); ctx.textAlign = 'center'; ctx.fillStyle = '#ffe27d'; ctx.font = `900 ${w < 380 ? 27 : 34}px ui-rounded,system-ui`; ctx.fillText('MYSTERY FACES', w / 2, 54);
  ctx.fillStyle = '#c9ecff'; ctx.font = '800 12px system-ui'; ctx.fillText(`DETECTIVE CASE ${s.level}`, w / 2, 78);
  const sampleSize = Math.min(100, w * .24); [FACES[2], FACES[9], FACES[20]].forEach((f, i) => faceArt(ctx, f, w / 2 + (i - 1) * sampleSize * .9, 139, sampleSize, false, i === 1, false));
  const steps = [
    ['1', 'ASK', 'Choose a yes-or-no clue.'],
    ['2', 'CROSS OUT', 'Wrong matches fold away automatically.'],
    ['3', 'SOLVE', 'When you are sure, make one final guess.'],
  ];
  const stepStart = Math.min(205, Math.max(170, h - 280)); const stepGap = Math.min(72, Math.max(60, (h - stepStart - 92) / 3));
  steps.forEach((step, i) => { const y = stepStart + i * stepGap; roundRect(ctx, 18, y, w - 36, 55, 16, 'rgba(11,29,52,.82)', '#4f7891'); roundRect(ctx, 29, y + 9, 38, 38, 12, '#f2cb61'); ctx.fillStyle = '#17304a'; ctx.font = '900 18px system-ui'; ctx.fillText(step[0], 48, y + 35); ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 12px system-ui'; ctx.fillText(step[1], 80, y + 24); ctx.fillStyle = '#bfe1f1'; ctx.font = '700 10px system-ui'; ctx.fillText(step[2], 80, y + 41); ctx.textAlign = 'center'; });
  roundRect(ctx, 28, h - 78, w - 56, 56, 18, '#61d8b2', '#b7fbe5'); ctx.fillStyle = '#123049'; ctx.font = '900 15px system-ui'; ctx.fillText('TAP TO OPEN THE CASE', w / 2, h - 43);
}
function drawOverlay(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  ctx.fillStyle = 'rgba(5,12,28,.72)'; ctx.fillRect(0, 0, w, h);
  const cardY = h * .29; roundRect(ctx, 24, cardY, w - 48, 215, 25, 'rgba(18,42,66,.96)', s.phase === 'won' ? '#ffe27d' : '#ff8b91');
  ctx.textAlign = 'center'; ctx.fillStyle = s.phase === 'won' ? '#ffe27d' : '#ff9ca2'; ctx.font = `900 ${w < 380 ? 22 : 27}px ui-rounded,system-ui`; ctx.fillText(s.message, w / 2, cardY + 48);
  const shown = s.phase === 'won' ? FACES[s.secret] : FACES[s.selected ?? 0]; faceArt(ctx, shown, w / 2, cardY + 113, 94, s.phase === 'lost', true, false);
  ctx.fillStyle = '#d9effa'; ctx.font = '700 11px system-ui'; ctx.fillText(s.detail, w / 2, cardY + 177);
  ctx.fillStyle = '#fff'; ctx.font = '900 12px system-ui'; ctx.fillText(s.phase === 'won' ? 'TAP FOR NEXT CASE' : 'TAP FOR A FRESH CLUE BOOK', w / 2, cardY + 202);
}
function draw(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  if (s.phase === 'setup') { drawSetup(ctx, s, w, h); return; }
  if (s.phase === 'clues') { drawClues(ctx, s, w, h); return; }
  drawBackground(ctx, w, h); drawHeader(ctx, s, w);
  if (s.phase === 'guess') {
    roundRect(ctx, 8, 88, w - 16, 50, 14, '#63d6b2', '#b7fbe5'); ctx.fillStyle = '#14324b'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText('← CANCEL GUESS     ·     TAP ONE FACE', w / 2, 119);
  } else drawToolbar(ctx, s, w);
  drawBoard(ctx, s, w, h);
  if (s.phase === 'won' || s.phase === 'lost') drawOverlay(ctx, s, w, h);
}
