import { awardsReturnScore, freshDuel, paddleBounce, touchSide } from '../components/games/PaddleDuel';

function assert(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`Paddle Duel check failed: ${message}`); }

const duel = freshDuel();
assert(duel.bottom === 0 && duel.top === 0 && duel.round === 1, 'a new match must begin scoreless');
assert(touchSide(.15) === 'top' && touchSide(.85) === 'bottom', 'simultaneous iPad fingers must map to separate paddle halves');
assert(paddleBounce(180, 180, 210).vy < 0 && paddleBounce(180, 180, -210).vy > 0, 'each paddle must return the ball toward its opponent');
assert(Math.abs(paddleBounce(220, 180, 425).vy) <= 430, 'long rallies must cap the ball speed instead of tunnelling through paddles');
assert(awardsReturnScore('solo', 'bottom'), 'the human bottom paddle should earn solo rally points');
assert(!awardsReturnScore('solo', 'top'), 'the CPU paddle must not earn solo rally points');
assert(!awardsReturnScore('duo', 'bottom') && !awardsReturnScore('duo', 'top'), 'local two-player returns must not inflate the solo score');

console.log('Paddle Duel verified: mode-ready state, two-touch sides, human-only solo returns, angled returns, and safe rally speed.');
