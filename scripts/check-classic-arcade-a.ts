import { SWING_SWEET_SPOT, hitQuality } from '../components/games/DiamondDerby';
import { LANES, clampLane, obstacleHits } from '../components/games/PaperRoute';
import { PYRAMID_ROWS, complete, hop, tileIndex } from '../components/games/PyramidHop';
function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
assert(hitQuality(.5)==='homer' && hitQuality(.5+SWING_SWEET_SPOT+.03)==='single' && hitQuality(.9)==='miss','bat timing bands');
assert(clampLane(-2)===0 && clampLane(8)===LANES-1 && obstacleHits(1,1,.85) && !obstacleHits(1,0,.85),'lane bounds and collision window');
assert(tileIndex(4,4)===14 && hop(0,0,'left')?.r===1 && hop(0,0,'up')===null,'pyramid hop bounds');
assert(!complete(Array(15).fill(0)) && complete(Array(PYRAMID_ROWS*(PYRAMID_ROWS+1)/2).fill(1)),'pyramid completion');
console.log('Classic arcade A: batting timing, delivery lanes, and pyramid hop rules passed.');
