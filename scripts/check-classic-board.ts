import { newReversi, flipsFor, legalReversiMoves, playReversi } from '../components/games/Reversi';
import { BG_CHECKERS, INK_BAR, WHITE_BAR, allCheckersHome, bgLegalMoves, bgTurnOptions, bgTurnSequences, canBearOff, newBackgammon, playBg } from '../components/games/Backgammon';
import { seaBoard, seaCpuShot, seaWon, shootSea } from '../components/games/SeaBattle';

function ok(value: boolean, message: string) { if (!value) throw new Error(message); }

const reversi = newReversi();
ok(legalReversiMoves(reversi, 1).length === 4, 'Reversi opening moves');
ok(flipsFor(reversi, 1, 19).length === 1, 'Reversi flip');
ok(playReversi(reversi, 1, 19)[27] === 1, 'Reversi applies flip');

const board = newBackgammon();
ok(board.points.length === 24, 'Backgammon uses a 24-point board');
ok(BG_CHECKERS === 15, 'Backgammon uses 15 checkers per player');
ok(board.points.filter((value) => value > 0).reduce((sum, value) => sum + value, 0) === 15, 'Ivory has the standard 15-checker setup');
ok(board.points.filter((value) => value < 0).reduce((sum, value) => sum - value, 0) === 15, 'Crimson has the standard 15-checker setup');
ok(board.points[23] === 2 && board.points[12] === 5 && board.points[7] === 3 && board.points[5] === 5, 'Ivory starts on the standard 24/13/8/6 points');
ok(board.points[0] === -2 && board.points[11] === -5 && board.points[16] === -3 && board.points[18] === -5, 'Crimson mirrors the standard setup');
ok(bgLegalMoves(board, 0, 1).length > 0, 'Backgammon has legal opening moves');
const opening = bgLegalMoves(board, 0, 1)[0];
ok(playBg(board, 0, opening[0], 1) !== board, 'Backgammon applies a legal move');
ok(!allCheckersHome(board, 0), 'Backgammon cannot bear off from the opening setup');

const empty = () => ({ ...newBackgammon(), points: Array(24).fill(0), bar: [0, 0] as [number, number], off: [0, 0] as [number, number] });
const home = empty(); home.points[0] = 5; home.points[2] = 5; home.points[5] = 5;
ok(allCheckersHome(home, 0), 'Backgammon recognizes all 15 checkers in the home board');
ok(bgLegalMoves(home, 0, 1).some(([, to]) => to < 0), 'Backgammon allows exact bearing off');
const overshoot = empty(); overshoot.points[0] = 8; overshoot.points[2] = 7;
ok(canBearOff(overshoot, 0, 2, 4) && !canBearOff(overshoot, 0, 0, 4), 'Only the farthest checker may use an oversized bear-off die');

const blocked = empty(); blocked.points[8] = 1; blocked.points[7] = -2;
ok(bgLegalMoves(blocked, 0, 1).length === 0, 'Two opposing checkers block a point');
const blot = empty(); blot.points[8] = 1; blot.points[7] = -1;
const hit = playBg(blot, 0, 8, 1);
ok(hit.points[7] === 1 && hit.bar[1] === 1, 'Landing on a blot sends the opponent to the bar');

const barFirst = { ...board, points: [...board.points], bar: [1, 0] as [number, number] };
ok(bgLegalMoves(barFirst, 0, 1).every(([from]) => from === WHITE_BAR), 'Ivory must enter from the bar first');
const blockedEntry = empty(); blockedEntry.bar = [1, 0]; blockedEntry.points[23] = -2;
ok(bgLegalMoves(blockedEntry, 0, 1).length === 0, 'Ivory cannot enter on a blocked opponent home point');
const inkEntry = empty(); inkEntry.bar = [0, 1];
ok(bgLegalMoves(inkEntry, 1, 1).every(([from, to]) => from === INK_BAR && to === 0), 'Crimson enters from the opposite bar edge');

const doubles = empty(); doubles.points[10] = 15; doubles.remaining = [2, 2, 2, 2]; doubles.dice = [2, 2, 2, 2];
ok(bgTurnSequences(doubles, 0).every((sequence) => sequence.length === 4), 'Doubles grant four moves when all four are playable');
const partialDouble = empty(); partialDouble.points[5] = 1; partialDouble.points[1] = -2; partialDouble.remaining = [2, 2, 2, 2]; partialDouble.dice = [2, 2, 2, 2];
ok(bgTurnSequences(partialDouble, 0)[0].length === 1, 'Doubles use the maximum playable number of moves');

const higherDie = empty(); higherDie.bar = [1, 0]; higherDie.points[17] = -2; higherDie.remaining = [2, 5]; higherDie.dice = [2, 5];
ok(bgTurnOptions(higherDie, 0).every((move) => move.die === 5), 'When only one die can be played, the higher die is mandatory');

const sea = seaBoard([[0, 1], [7]]);
ok(shootSea(sea, 0).hit, 'Sea hit');
ok(!shootSea(shootSea(sea, 0).board, 0).legal, 'Sea prevents repeat');
ok(seaCpuShot(sea) !== null, 'Sea CPU chooses an unknown square');
let finishedSea = sea; [0, 1, 7].forEach((index) => { finishedSea = shootSea(finishedSea, index).board; });
ok(seaWon(finishedSea), 'Sea win');

console.log('Classic board rules passed: full 24-point backgammon, Reversi, and Sea Battle.');
