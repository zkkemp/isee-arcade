'use client';
import { useEffect, useRef } from 'react';
import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';

export const SEA=6;
export type SeaCell=0|1|2|3; // water, ship, miss, hit
export function seaBoard(ships:number[][]):SeaCell[]{const b=Array(SEA*SEA).fill(0) as SeaCell[];ships.flat().forEach(i=>b[i]=1);return b;}
export function shootSea(b:SeaCell[], i:number):{board:SeaCell[];hit:boolean;legal:boolean}{if(i<0||i>=b.length||b[i]>1)return{board:b,hit:false,legal:false};const n=b.slice() as SeaCell[];const hit=n[i]===1;n[i]=hit?3:2;return{board:n,hit,legal:true};}
export function seaWon(b:SeaCell[]):boolean{return !b.includes(1);}
export function seaCpuShot(b:SeaCell[]):number|null{
  const unknown=b.map((value,index)=>value<2?index:-1).filter(index=>index>=0);
  if(!unknown.length)return null;
  const fired=b.length-unknown.length;
  return unknown[(fired*11+7)%unknown.length];
}
const PLAYER=seaBoard([[0,1,2],[12,18],[28,34]]), CPU=seaBoard([[5,11,17],[20,21],[31,37]]);
type SeaView={you:SeaCell[];cpu:SeaCell[];turn:0|1;wait:number;msg:string};
const freshSea=():SeaView=>({you:PLAYER.slice() as SeaCell[],cpu:CPU.slice() as SeaCell[],turn:0,wait:0,msg:'Tap the right ocean to fire!'});
export default function SeaBattle({paused,api,difficulty,restartToken}:GameCanvasProps){
  const ref=useRef<SeaView>(freshSea());
  useEffect(()=>{ref.current=freshSea();},[restartToken]);
  const tap=(x:number,y:number,w:number,h:number)=>{
    const s=ref.current;if(paused||s.turn)return;
    const col=Math.floor((x-w/2-8)/((w/2-20)/SEA));
    const row=Math.floor((y-66)/((h-86)/SEA));
    if(col<0||col>=SEA||row<0||row>=SEA)return;
    const cell=col+SEA*row;
    const r=shootSea(s.cpu,cell);if(!r.legal)return;
    s.cpu=r.board;s.msg=r.hit?'Splash! You found a ship!':'Splash! Miss.';
    if(r.hit)api.addScore(8);
    if(seaWon(s.cpu)){api.addScore(50);ref.current=freshSea();api.requestGate('Enemy fleet found!');return;}
    s.turn=1;s.wait=difficulty==='easy'?1:.45;
  };
  const {canvasRef}=useCanvasGame({active:true,step:(ctx,dt,w,h)=>{
    const s=ref.current;
    if(!paused&&s.turn){
      s.wait-=dt;
      if(s.wait<=0){
        const i=seaCpuShot(s.you);
        if(i!==null)s.you=shootSea(s.you,i).board;
        s.turn=0;s.msg='Your turn: choose a square.';
        if(seaWon(s.you)){ref.current=freshSea();api.died('The other fleet found yours');}
      }
    }
    ctx.fillStyle='#0c2840';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.font='bold 18px system-ui';ctx.fillText('Sea Battle',14,27);ctx.font='13px system-ui';ctx.fillText(s.msg,14,47);
    const draw=(b:SeaCell[],ox:number,label:string)=>{
      const z=Math.min((w/2-20)/SEA,(h-86)/SEA);ctx.fillStyle='#bdeaff';ctx.fillText(label,ox,64);
      for(let i=0;i<36;i++){const xx=ox+(i%SEA)*z,yy=68+Math.floor(i/SEA)*z;ctx.fillStyle='#2379a8';ctx.fillRect(xx,yy,z-2,z-2);if(b[i]===1&&label==='Your fleet')ctx.fillStyle='#8e9aaa';if(b[i]===2)ctx.fillStyle='#e9f3ff';if(b[i]===3)ctx.fillStyle='#ff785f';if(b[i]>0&&(b[i]!==1||label==='Your fleet')){ctx.beginPath();ctx.arc(xx+z/2,yy+z/2,z*.22,0,Math.PI*2);ctx.fill();}}
    };
    draw(s.you,10,'Your fleet');draw(s.cpu,w/2+8,'Enemy ocean');
  }});
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();tap(e.clientX-r.left,e.clientY-r.top,r.width,r.height)}}/>
}
