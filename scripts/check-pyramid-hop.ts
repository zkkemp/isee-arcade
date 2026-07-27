import { PYRAMID_ROWS, bugStep, complete, enemyInterval, hop, tileIndex } from '../components/games/PyramidHop';

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`Pyramid Hop check failed: ${message}`); }

assert(tileIndex(4, 4) === 14, 'the board must contain fifteen addressable tiles');
assert(hop(0, 0, 'left')?.r === 1 && hop(0, 0, 'right')?.c === 1, 'left/right must descend to the visible child slopes');
assert(hop(0, 0, 'up') === null && hop(0, 0, 'down') === null, 'the apex must reject invalid climbs');
assert(hop(PYRAMID_ROWS - 1, 0, 'left') === null, 'the base must reject invalid descents');
assert(!complete(Array(15).fill(0)) && complete(Array(15).fill(1)), 'level completion must require every tile');
assert(enemyInterval(1, 'easy') > enemyInterval(1, 'hard'), 'hard difficulty must move the bug faster');
assert(enemyInterval(8, 'normal') < enemyInterval(1, 'normal'), 'later levels must ramp the bug pace');
const escape = bugStep({ r: 1, c: 0 }, { r: 0, c: 0 }, 0, true);
assert(escape.r !== 0 || escape.c !== 0, 'the bug must not cause an unavoidable immediate respawn collision when another move exists');
const chase = bugStep({ r: 1, c: 0 }, { r: 0, c: 0 }, 0);
assert(chase.r === 0 && chase.c === 0, 'the bug must become a real threat after the restart shield expires');

console.log('Pyramid Hop verified: triangular directions, completion, safe enemy routing, and difficulty ramp.');
