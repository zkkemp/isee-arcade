'use client';

import { useEffect, useRef } from 'react';
import type { Difficulty } from '@/lib/difficulty';
import type { GameCanvasProps } from '@/lib/games';
import { playSound } from '@/lib/sound';
import { useCanvasGame } from '@/lib/useCanvasGame';

export type Hair = 'curl' | 'spike' | 'bob' | 'wave';
export type Face = { id: string; name: string; skin: string; hair: Hair; hairColor: string; shirt: string; glasses: boolean; hat: boolean; smile: boolean; freckles: boolean };
export type QuestionId = 'glasses' | 'hat' | 'smile' | 'freckles' | 'curl' | 'spike' | 'bob' | 'warm-shirt';
export type Question = { id: QuestionId; label: string; short: string; test: (face: Face) => boolean };

/** Original procedural cast: no character art or names are borrowed from any game. */
export const FACES: Face[] = ([
  ['Ari','#9a5a3c','curl','#382318','#ff7b63',false,false,true,true], ['Bea','#f1bd91','bob','#59362b','#5ea6e8',true,false,false,false], ['Cal','#70422d','spike','#191c2d','#ffd14c',false,true,true,false], ['Dani','#c77c55','wave','#e3b553','#8d6bdb',false,false,false,true],
  ['Eli','#e0a47d','curl','#c85a39','#4cbf91',true,false,true,false], ['Faye','#6c392b','bob','#161823','#ff8575',false,true,false,true], ['Gus','#f4c49d','spike','#8c552a','#f0af36',true,false,true,true], ['Hana','#ad6347','wave','#301f1b','#4e8fdb',false,false,false,false],
  ['Ivo','#8d5138','curl','#d08a31','#d96ca4',false,true,true,false], ['Juno','#f5d0ad','bob','#c24537','#53b4a3',true,false,false,true], ['Kai','#623724','spike','#34251d','#e7d35d',false,false,true,false], ['Lumi','#d99268','wave','#26202a','#ef765b',true,true,false,false],
  ['Mika','#b66c4d','curl','#432b25','#62a9e5',false,false,true,true], ['Nico','#efbd91','bob','#e7b02d','#7e67cf',true,true,false,false], ['Omi','#79452f','spike','#252627','#4cbf91',false,false,true,true], ['Pax','#d7835a','wave','#6c3c26','#ffbd49',true,false,false,false],
  ['Quin','#9b573e','curl','#1d1b22','#db6ba4',false,true,true,false], ['Rae','#f1c9a5','bob','#60402c','#e66d99',true,false,false,true], ['Sol','#693a29','spike','#ba633b','#f17a5f',false,false,true,false], ['Tess','#ca805e','wave','#322217','#7abf80',true,true,false,true],
  ['Uma','#a45d42','curl','#e2a42d','#edbd4c',false,false,true,false], ['Vale','#edb78e','bob','#24202a','#9b77d3',true,true,false,true], ['Wren','#71412d','spike','#4b3026','#e66d99',false,false,true,true], ['Zia','#d98d68','wave','#b84536','#e66d99',true,false,false,false],
] as Array<[string, string, Hair, string, string, boolean, boolean, boolean, boolean]>).map(([name, skin, hair, hairColor, shirt, glasses, hat, smile, freckles]) => ({ id: name.toLowerCase(), name, skin, hair, hairColor, shirt, glasses, hat, smile, freckles }));

export const QUESTIONS: Question[] = [
  { id: 'glasses', label: 'wearing glasses?', short: 'GLASSES', test: (f) => f.glasses }, { id: 'hat', label: 'wearing a hat?', short: 'HAT', test: (f) => f.hat },
  { id: 'smile', label: 'smiling?', short: 'SMILE', test: (f) => f.smile }, { id: 'freckles', label: 'freckles?', short: 'FRECKLES', test: (f) => f.freckles },
  { id: 'curl', label: 'curly hair?', short: 'CURLS', test: (f) => f.hair === 'curl' }, { id: 'spike', label: 'spiky hair?', short: 'SPIKES', test: (f) => f.hair === 'spike' },
  { id: 'bob', label: 'a bob haircut?', short: 'BOB', test: (f) => f.hair === 'bob' }, { id: 'warm-shirt', label: 'a warm-color shirt?', short: 'WARM TOP', test: (f) => ['#ff7b63','#ff8575','#ef765b','#f17a5f','#e66d99','#db6ba4'].includes(f.shirt) },
];

export const lcg = (seed: number): [number, number] => { const next = (Math.imul(seed >>> 0, 1103515245) + 12345) >>> 0; return [next, next / 4294967296]; };
export function ask(secret: Face, question: QuestionId): boolean { return QUESTIONS.find((q) => q.id === question)?.test(secret) ?? false; }
export function remainingFaces(eliminated: boolean[]): Face[] { return FACES.filter((_, i) => !eliminated[i]); }
export function eliminateInconsistent(eliminated: boolean[], question: QuestionId, answer: boolean): boolean[] { const q = QUESTIONS.find((item) => item.id === question); return eliminated.map((gone, i) => gone || (q ? q.test(FACES[i]) !== answer : false)); }
export function isSolvableWithAllQuestions(): boolean { return FACES.every((face, i) => FACES.every((other, j) => i === j || QUESTIONS.some((q) => q.test(face) !== q.test(other)))); }
/** The smallest set of questions whose answer pattern identifies this face alone. */
export function minimumClueSet(secretIndex: number): QuestionId[] {
  const secret = FACES[secretIndex];
  if (!secret) return [];
  let best: QuestionId[] = QUESTIONS.map((q) => q.id);
  for (let mask = 1; mask < 2 ** QUESTIONS.length; mask += 1) {
    const count = QUESTIONS.reduce((sum, _, i) => sum + ((mask >> i) & 1), 0);
    if (count >= best.length) continue;
    const chosen = QUESTIONS.filter((_, i) => (mask & (1 << i)) !== 0);
    const unique = FACES.every((other, otherIndex) =>
      otherIndex === secretIndex || chosen.some((q) => q.test(secret) !== q.test(other)));
    if (unique) best = chosen.map((q) => q.id);
  }
  return best;
}
export function clueBudgetFor(secretIndex: number, level: number, difficulty: Difficulty): number {
  const base = difficulty === 'easy' ? 8 : difficulty === 'normal' ? 7 : 6;
  const planned = Math.max(3, base - Math.floor((level - 1) / 3));
  return Math.max(planned, minimumClueSet(secretIndex).length);
}
export function roundFor(seed: number, level: number, difficulty: Difficulty): { secret: number; clues: number; seed: number } {
  const [next, random] = lcg(seed);
  const secret = Math.floor(random * FACES.length);
  return { secret, clues: clueBudgetFor(secret, level, difficulty), seed: next };
}

type Phase = 'intro' | 'play' | 'guess' | 'won' | 'lost';
type State = { seed: number; level: number; secret: number; clues: number; clueBudget: number; asked: QuestionId[]; eliminated: boolean[]; selected: number | null; phase: Phase; message: string; detail: string; pulse: number; answer: boolean | null };
function fresh(difficulty: Difficulty): State { const r = roundFor(98631, 1, difficulty); return { seed: r.seed, level: 1, secret: r.secret, clues: r.clues, clueBudget: r.clues, asked: [], eliminated: Array(FACES.length).fill(false), selected: null, phase: 'intro', message: 'MEET THE MYSTERY CREW!', detail: 'Ask yes-or-no questions, cross out faces, then make one smart guess.', pulse: 0, answer: null }; }
function nextRound(s: State, difficulty: Difficulty): void { const r = roundFor(s.seed, s.level + 1, difficulty); s.seed = r.seed; s.level += 1; s.secret = r.secret; s.clues = r.clues; s.clueBudget = r.clues; s.asked = []; s.eliminated = Array(FACES.length).fill(false); s.selected = null; s.answer = null; s.phase = 'intro'; s.message = `CASE ${s.level}: NEW MYSTERY`; s.detail = 'Tap to open the question book.'; }

export default function MysteryFaces({ paused, input, api, restartToken, difficulty, controlsInset }: GameCanvasProps) {
  const ref = useRef(fresh(difficulty));
  useEffect(() => { ref.current = fresh(difficulty); }, [restartToken, difficulty]);
  const { canvasRef } = useCanvasGame({ active: !paused, step: (ctx, dt, w, ch) => {
    const s = ref.current; const h = Math.max(330, ch - controlsInset); s.pulse = Math.max(0, s.pulse - dt);
    const pressed = input.consumePointerPress(); const jump = input.consumeJump(); const dir = input.consumeTap();
    const px = input.pointerX ?? 0.5; const py = input.pointerY ?? 0.5;
    if (s.phase === 'intro') { if (pressed || jump) { s.phase = 'play'; s.message = 'ASK A CLUE'; s.detail = `${s.clues} questions available. Then choose GUESS.`; playSound('click'); } }
    else if (s.phase === 'won') { if (pressed || jump) nextRound(s, difficulty); }
    else if (s.phase === 'lost') { if (pressed || jump) { s.phase = 'play'; s.message = 'TRY THE CLUES AGAIN'; s.detail = `Fresh start: all ${s.clueBudget} questions are available again.`; s.clues = s.clueBudget; s.eliminated = Array(FACES.length).fill(false); s.asked = []; s.selected = null; s.answer = null; } }
    else if (s.phase === 'play' || s.phase === 'guess') {
      if (dir === 'left' && s.selected !== null) s.selected = Math.max(0, s.selected - 1);
      if (dir === 'right' && s.selected !== null) s.selected = Math.min(FACES.length - 1, s.selected + 1);
      // Header: question chips in two rows, plus a clearly separate guess button.
      if (pressed && py > 0.19 && py < 0.36 && s.phase === 'play') {
        const q = QUESTIONS[Math.min(7, Math.floor(px * 4) + (py > 0.255 ? 4 : 0))];
        if (!s.asked.includes(q.id) && s.clues > 0) { const answer = ask(FACES[s.secret], q.id); s.asked.push(q.id); s.clues -= 1; s.answer = answer; if (difficulty === 'easy') s.eliminated = eliminateInconsistent(s.eliminated, q.id, answer); s.message = answer ? `YES — ${q.label.toUpperCase()}` : `NO — NOT ${q.label.toUpperCase()}`; s.detail = difficulty === 'easy' ? 'Helpful mode crossed out the impossible faces. You can restore any face.' : 'Tap faces to cross out the impossible ones.'; s.pulse = .6; playSound(answer ? 'correct' : 'wrong'); }
      } else if ((pressed && py < 0.17 && px > 0.64) || (jump && s.selected !== null)) { s.phase = 'guess'; s.message = 'FINAL GUESS'; s.detail = 'Tap the face you believe is the secret.'; }
      else if (pressed && py >= 0.39) {
        const col = clamp(Math.floor(px * 4), 0, 3); const row = clamp(Math.floor((py - 0.39) / 0.1), 0, 5); const index = row * 4 + col;
        if (s.phase === 'guess') { if (index === s.secret) { s.phase = 'won'; s.message = `CASE CLOSED — IT WAS ${FACES[index].name}!`; s.detail = 'Great deduction! Tap after your celebration to open the next case.'; s.pulse = 1; api.addScore(40 + s.clues * 5); api.requestGate(`Mystery Faces case ${s.level} solved!`); playSound('levelClear'); } else { s.phase = 'lost'; s.message = `NOT ${FACES[index].name}`; s.detail = 'No penalty — review the clues and try again.'; playSound('wrong'); } }
        else { s.eliminated[index] = !s.eliminated[index]; s.selected = index; playSound(s.eliminated[index] ? 'click' : 'pass'); }
      }
    }
    draw(ctx, s, w, h);
  }});
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-label="Mystery Faces deduction game" />;
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)); }
function faceArt(ctx: CanvasRenderingContext2D, f: Face, x: number, y: number, size: number, faded: boolean, selected: boolean): void {
  ctx.save(); ctx.globalAlpha = faded ? .22 : 1; ctx.translate(x, y); const r = size * .31;
  ctx.fillStyle = selected ? '#ffe27a' : '#163958'; ctx.roundRect(-size*.43,-size*.48,size*.86,size*.96,size*.12); ctx.fill();
  ctx.fillStyle = f.shirt; ctx.fillRect(-r*.78,r*.62,r*1.56,r*.5);
  ctx.fillStyle = f.skin; ctx.beginPath(); ctx.arc(0, -r*.02, r, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = f.hairColor; if (f.hair === 'bob') ctx.fillRect(-r*1.05,-r*.72,r*2.1,r*1.28); else if (f.hair === 'spike') { ctx.beginPath(); ctx.moveTo(-r,-r*.35); ctx.lineTo(-r*.7,-r*1.05); ctx.lineTo(-r*.25,-r*.62); ctx.lineTo(0,-r*1.12); ctx.lineTo(r*.32,-r*.62); ctx.lineTo(r*.78,-r*1.05); ctx.lineTo(r,-r*.28); ctx.fill(); } else { for (let i=-2;i<=2;i+=1) { ctx.beginPath(); ctx.arc(i*r*.36,-r*.52,r*.38,0,Math.PI*2); ctx.fill(); } }
  if (f.hat) { ctx.fillStyle='#3c578a'; ctx.fillRect(-r*1.05,-r*.9,r*2.1,r*.25); ctx.beginPath(); ctx.arc(0,-r*.9,r*.72,Math.PI,0); ctx.fill(); }
  ctx.fillStyle='#142033'; [-r*.38,r*.38].forEach((ex)=>{ctx.beginPath();ctx.arc(ex,-r*.02,r*.09,0,Math.PI*2);ctx.fill();});
  if(f.glasses){ctx.strokeStyle='#1c2c43';ctx.lineWidth=Math.max(1,size*.035);ctx.strokeRect(-r*.68,-r*.22,r*.45,r*.34);ctx.strokeRect(r*.23,-r*.22,r*.45,r*.34);ctx.beginPath();ctx.moveTo(-r*.23,-r*.05);ctx.lineTo(r*.23,-r*.05);ctx.stroke();}
  if(f.freckles){ctx.fillStyle='#9b583e';[-.35,-.18,.18,.35].forEach(v=>{ctx.beginPath();ctx.arc(v*r,r*.28,r*.045,0,7);ctx.fill();});}
  ctx.strokeStyle='#6b3540';ctx.lineWidth=Math.max(1,size*.025);ctx.beginPath(); if(f.smile)ctx.arc(0,r*.31,r*.32,0.1,Math.PI-.1);else{ctx.moveTo(-r*.26,r*.43);ctx.lineTo(r*.26,r*.43);}ctx.stroke();
  ctx.restore();
}
function draw(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#152a52');bg.addColorStop(1,'#5a2e69');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  for(let i=0;i<42;i+=1){ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect((i*79)%w,70+(i*47)%(h-70),2,2);}
  ctx.fillStyle='#fff4c8';ctx.font='900 18px ui-rounded,system-ui';ctx.textAlign='left';ctx.fillText(`MYSTERY FACES  •  CASE ${s.level}`,12,24);
  ctx.font='800 12px system-ui';ctx.fillStyle='#bce8ff';ctx.fillText(`LEFT: ${remainingFaces(s.eliminated).length}   CLUES: ${s.clues}`,12,43);
  ctx.fillStyle=s.phase==='guess'?'#ffdb69':'#5fd3b3';ctx.roundRect(w*.66,10,w*.3,40,12);ctx.fill();ctx.fillStyle='#17304f';ctx.font='900 12px system-ui';ctx.textAlign='center';ctx.fillText(s.phase==='guess'?'CHOOSE FACE':'MAKE GUESS',w*.81,35);
  ctx.fillStyle=s.pulse?'#fff276':'#fff';ctx.font='900 15px ui-rounded,system-ui';ctx.fillText(s.message,w/2,72);ctx.fillStyle='#d7e8ff';ctx.font='700 11px system-ui';ctx.fillText(s.detail,w/2,89);
  QUESTIONS.forEach((q,i)=>{const x=8+(i%4)*(w-20)/4;const y=h*.19+Math.floor(i/4)*h*.075;const used=s.asked.includes(q.id);ctx.fillStyle=used?'rgba(119,154,195,.38)':'#f6d56b';ctx.roundRect(x,y,(w-30)/4,h*.06,8);ctx.fill();ctx.fillStyle=used?'#d6e4ef':'#17304f';ctx.font='900 9px system-ui';ctx.textAlign='center';ctx.fillText(q.short,x+(w-30)/8,y+h*.038);});
  const top=h*.39;const cellH=(h-top-5)/6;const cellW=w/4;FACES.forEach((f,i)=>{const col=i%4,row=Math.floor(i/4);const x=col*cellW+cellW/2,y=top+row*cellH+cellH/2;faceArt(ctx,f,x,y,Math.min(cellW,cellH)*.88,s.eliminated[i],s.selected===i);ctx.fillStyle=s.eliminated[i]?'rgba(255,255,255,.3)':'#fff';ctx.font='800 9px system-ui';ctx.textAlign='center';ctx.fillText(f.name,x,y+Math.min(cellW,cellH)*.43);if(s.eliminated[i]){ctx.strokeStyle='#ff7782';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-cellW*.3,y-cellH*.29);ctx.lineTo(x+cellW*.3,y+cellH*.29);ctx.stroke();}});
  ctx.textAlign='left';
}
