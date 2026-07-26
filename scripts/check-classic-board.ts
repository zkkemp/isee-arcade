import { newReversi, flipsFor, legalReversiMoves, playReversi } from '../components/games/Reversi';
import { allCheckersHome, newBackgammon, bgLegalMoves, playBg } from '../components/games/Backgammon';
import { seaBoard, seaCpuShot, seaWon, shootSea } from '../components/games/SeaBattle';
function ok(v:boolean,m:string){if(!v)throw new Error(m)}
const r=newReversi();ok(legalReversiMoves(r,1).length===4,'Reversi opening moves');const f=flipsFor(r,1,19);ok(f.length===1,'Reversi flip');ok(playReversi(r,1,19)[27]===1,'Reversi applies flip');
const b=newBackgammon();ok(bgLegalMoves(b,0,1).length>0,'Backgammon opening move');const m=bgLegalMoves(b,0,1)[0];ok(playBg(b,0,m[0],1)!==b,'Backgammon applies legal move');
ok(!allCheckersHome(b,0),'Backgammon cannot bear off from the opening setup');
const home={...newBackgammon(),points:Array(12).fill(0),bar:[0,0] as [number,number]};home.points[11]=5;
ok(allCheckersHome(home,0),'Backgammon recognizes a complete home board');
ok(bgLegalMoves(home,0,1).some(([,to])=>to>11),'Backgammon allows bearing off from home');
const s=seaBoard([[0,1],[7]]);ok(shootSea(s,0).hit,'Sea hit');ok(!shootSea(shootSea(s,0).board,0).legal,'Sea prevents repeat');ok(seaCpuShot(s)!==null,'Sea CPU chooses an unknown square');let q=s;[0,1,7].forEach(i=>q=shootSea(q,i).board);ok(seaWon(q),'Sea win');console.log('Classic board rules passed.');
