'use client';

import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';

/** Mini backgammon: 12 points, one die per turn. Positive checkers travel up,
 * negative checkers travel down; a lone opposing checker is hit to the bar. */
export type BgBoard = number[];
export type BgState = { points: BgBoard; bar: [number, number]; off: [number, number]; turn: 0 | 1; die: number };
export function newBackgammon(): BgState { const p=Array(12).fill(0); p[0]=3;p[3]=2;p[8]=-2;p[11]=-3; return {points:p,bar:[0,0],off:[0,0],turn:0,die:1}; }
export function allCheckersHome(s: BgState, player: 0 | 1): boolean {
  if (s.bar[player] > 0) return false;
  const sign = player === 0 ? 1 : -1;
  return s.points.every((value, point) => value * sign <= 0 || (player === 0 ? point >= 9 : point <= 2));
}
export function bgLegalMoves(s: BgState, player: 0|1, die=s.die): Array<[number,number]> {
  const sign=player===0?1:-1, bar=s.bar[player];
  const froms=bar?[player===0?-1:12]:s.points.map((v,i)=>v*sign>0?i:-99).filter(i=>i>=0);
  return froms.filter(f=>{
    const t=f+sign*die;
    if(t<0||t>11)return allCheckersHome(s,player);
    return s.points[t]*sign>=0||Math.abs(s.points[t])===1;
  }).map(f=>[f,f+sign*die]);
}
export function playBg(s: BgState, player:0|1, from:number, die=s.die): BgState { const legal=bgLegalMoves(s,player,die); if(!legal.some(([f])=>f===from)) return s; const n:BgState={points:s.points.slice(),bar:[...s.bar] as [number,number],off:[...s.off] as [number,number],turn:s.turn,die};const sign=player===0?1:-1,t=from+sign*die;if(from===-1||from===12)n.bar[player]--;else n.points[from]-=sign;if(t<0||t>11)n.off[player]++;else {if(n.points[t]*sign<0)n.bar[player===0?1:0]++;n.points[t]=sign;} return n; }
export function chooseBgCpu(s:BgState):number|null{return bgLegalMoves(s,1).sort((a,b)=>b[0]-a[0])[0]?.[0]??null;}

type BackgammonView = { s: BgState; sel: number; wait: number };
const freshBackgammonView = (): BackgammonView => ({ s: newBackgammon(), sel: -99, wait: 0 });

export default function Backgammon({paused,api,difficulty,restartToken}:GameCanvasProps){
  const ref=useRef<BackgammonView>(freshBackgammonView());
  useEffect(()=>{ref.current=freshBackgammonView();},[restartToken]);
  const roll=()=>1+Math.floor(Math.random()*6);
  const tap=(x:number,w:number)=>{
    const q=ref.current;
    if(paused||q.s.turn!==0)return;
    const col=Math.floor((x-12)/((w-24)/12));
    if(col<0||col>11)return;
    if(q.sel===-99){
      const moves=bgLegalMoves(q.s,0);
      if(moves.some(([f])=>f===-1))q.sel=-1;
      else if(moves.some(([f])=>f===col))q.sel=col;
    }else{
      const before=q.s;
      q.s=playBg(q.s,0,q.sel);
      q.sel=-99;
      if(q.s!==before){
        api.addScore(2);
        if(q.s.off[0]>=5){
          api.addScore(50);
          ref.current=freshBackgammonView();
          api.requestGate('Backgammon race won!');
        }else{
          q.s.turn=1;
          q.wait=difficulty==='easy'?1:.4;
        }
      }
    }
  };
  const {canvasRef}=useCanvasGame({active:true,step:(ctx,dt,w,h)=>{
    const q=ref.current;
    if(!paused&&q.s.turn===1){
      q.wait-=dt;
      if(q.wait<=0){
        const f=chooseBgCpu(q.s);
        if(f!==null)q.s=playBg(q.s,1,f);
        if(q.s.off[1]>=5){
          ref.current=freshBackgammonView();
          api.died('The opponent bore off every checker');
        }else{
          q.s.turn=0;
          q.s.die=roll();
        }
      }
    }
    ctx.fillStyle='#331d18';ctx.fillRect(0,0,w,h);ctx.fillStyle='#f6d69b';ctx.font='bold 18px system-ui';ctx.fillText('Mini Backgammon',14,27);ctx.font='13px system-ui';ctx.fillText(q.s.turn===0?`Your die: ${q.s.die}. Tap a checker, then its move.`:'Opponent rolls...',14,47);
    const cw=(w-24)/12,top=70,bh=h-100;
    for(let i=0;i<12;i++){
      const xx=12+i*cw;ctx.fillStyle=i%2?'#d86a48':'#f0c278';ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx+cw,top);ctx.lineTo(xx+cw/2,top+bh);ctx.fill();
      const n=q.s.points[i],count=Math.abs(n);
      for(let k=0;k<count;k++){ctx.beginPath();ctx.arc(xx+cw/2,top+18+k*24,10,0,7);ctx.fillStyle=n>0?'#fff8e7':'#25213b';ctx.fill();}
    }
  }});
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();tap(e.clientX-r.left,r.width)}}/>
}
