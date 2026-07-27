import { awardsReturnScore, DUEL_SPEED_SCALE, freshDuel, markServeReady, paddleBounce, touchSide } from '../components/games/PaddleDuel';

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`Paddle Duel check failed: ${message}`); }

const duel = freshDuel();
assert(duel.bottom === 0 && duel.top === 0 && duel.round === 1, 'a new match must begin scoreless');
assert(touchSide(.15) === 'top' && touchSide(.85) === 'bottom', 'simultaneous iPad fingers must map to separate paddle halves');
assert(paddleBounce(180, 180, 210).vy < 0 && paddleBounce(180, 180, -210).vy > 0, 'each paddle must return the ball toward its opponent');
assert(Math.abs(paddleBounce(220, 180, 425).vy) <= 430, 'long rallies must cap the ball speed instead of tunnelling through paddles');
assert(awardsReturnScore('solo', 'bottom'), 'the human bottom paddle should earn solo rally points');
assert(!awardsReturnScore('solo', 'top'), 'the CPU paddle must not earn solo rally points');
assert(!awardsReturnScore('duo', 'bottom') && !awardsReturnScore('duo', 'top'), 'local two-player returns must not inflate the solo score');
assert(duel.awaitingServe, 'a new match must wait for player readiness');
assert(!markServeReady(duel, 'duo', 'top') && duel.readyTop && !duel.readyBottom, 'pink alone must not start a two-player serve');
assert(markServeReady(duel, 'duo', 'bottom') && !duel.awaitingServe, 'both players ready must start a two-player serve');
const soloServe = freshDuel();
assert(markServeReady(soloServe, 'solo', 'bottom'), 'one human ready must start a solo serve');
assert(DUEL_SPEED_SCALE.chill < DUEL_SPEED_SCALE.classic && DUEL_SPEED_SCALE.classic < DUEL_SPEED_SCALE.turbo, 'speed choices must be ordered');

console.log('Paddle Duel verified: opening setup, ordered speeds, two-touch sides, both-player readiness, human-only solo returns, angled returns, and safe rally speed.');
