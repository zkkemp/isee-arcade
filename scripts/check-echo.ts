/**
 * Headless proof for Echo's rules: the seeded pattern generator, growth,
 * and the prefix/completion checks that decide whether a round was played
 * correctly.
 *
 * Drives the exact pure functions the game runs (generateSequence / appendStep /
 * matchesPrefix / isRoundComplete / roundScore / flashDuration). The failure that
 * would quietly ruin this genre is the shown pattern drifting from what the
 * checker thinks was shown - a generator that isn't reproducible from its seed,
 * a growth step that rewrites history instead of only appending, or a
 * completion check that fires on length alone - so each is proven directly.
 *
 * Each self-test at the end sabotages a check and confirms it would fail, so a
 * check that has quietly stopped testing anything is caught.
 */
import {
  appendStep,
  flashDuration,
  generateSequence,
  isRoundComplete,
  lcg,
  matchesPrefix,
  PAD_COUNT,
  roundScore,
} from '../components/games/Echo';

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures += 1;
    console.error(`  FAIL: ${msg}`);
  }
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// 1) The generator is deterministic per seed: the same seed produces the
// exact same pattern every time, and different runs of the same seed never
// drift from each other however many times they are drawn from.
{
  const a = generateSequence(lcg(42), 20);
  const b = generateSequence(lcg(42), 20);
  assert(arraysEqual(a, b), 'generateSequence(lcg(42), 20) was not reproducible from its seed');

  // Drawing in two smaller calls from the same seed must equal one big call -
  // proves the stream itself (not just the wrapper) is what is deterministic.
  const rngA = lcg(7);
  const first = generateSequence(rngA, 3);
  const second = generateSequence(rngA, 3);
  const whole = generateSequence(lcg(7), 6);
  assert(
    arraysEqual([...first, ...second], whole),
    'two sequential draws from a seed did not equal one draw of the combined length',
  );
}

// 2) Every drawn value is a legal pad index, across many seeds and lengths.
{
  let allInRange = true;
  for (let seed = 1; seed <= 40; seed += 1) {
    const seq = generateSequence(lcg(seed * 977), 25);
    for (const v of seq) if (!Number.isInteger(v) || v < 0 || v >= PAD_COUNT) allInRange = false;
  }
  assert(allInRange, `generateSequence produced a value outside 0..${PAD_COUNT - 1}`);
}

// 3) matchesPrefix: a correct prefix is accepted, a wrong one is rejected, and
// an input longer than the target is always rejected.
{
  const target = [0, 1, 2, 3];
  assert(matchesPrefix(target, []), 'the empty input was rejected as a prefix');
  assert(matchesPrefix(target, [0]), 'a correct 1-step prefix was rejected');
  assert(matchesPrefix(target, [0, 1, 2]), 'a correct 3-step prefix was rejected');
  assert(matchesPrefix(target, [0, 1, 2, 3]), 'the full correct sequence was rejected as a prefix');
  assert(!matchesPrefix(target, [1]), 'a wrong first tap was accepted');
  assert(!matchesPrefix(target, [0, 2]), 'a wrong second tap was accepted');
  assert(!matchesPrefix(target, [0, 1, 2, 3, 0]), 'an input longer than the target was accepted');
}

// 4) isRoundComplete is true exactly at full length, and only when the full
// input is correct - never a bare length check.
{
  const target = [0, 1, 2, 3];
  assert(!isRoundComplete(target, []), 'an empty input read as a completed round');
  assert(!isRoundComplete(target, [0, 1, 2]), 'a partial (if correct) input read as a completed round');
  assert(isRoundComplete(target, [0, 1, 2, 3]), 'the correct full-length input was not read as complete');
  assert(!isRoundComplete(target, [0, 1, 2, 9]), 'a full-length but wrong input read as a completed round');
  assert(!isRoundComplete(target, [0, 1, 2, 3, 1]), 'an over-long input read as a completed round');
}

// 5) appendStep grows the sequence by exactly one step and keeps every prior
// step untouched, and never mutates the array handed in.
{
  const rng = lcg(99);
  const seq = generateSequence(rng, 5);
  const before = [...seq];
  const grown = appendStep(seq, rng);
  assert(grown.length === seq.length + 1, `appendStep grew length by ${grown.length - seq.length}, not 1`);
  assert(
    arraysEqual(grown.slice(0, seq.length), seq),
    'appendStep changed a step that was already in the sequence',
  );
  assert(arraysEqual(seq, before), 'appendStep mutated the array it was given');
  assert(grown[grown.length - 1] >= 0 && grown[grown.length - 1] < PAD_COUNT, 'the appended step was out of range');

  // Repeated growth: ten steps of appendStep from length 1 must leave the
  // original prefix intact at every stage, not just the last.
  let running = generateSequence(lcg(3), 1);
  const rng2 = lcg(3);
  generateSequence(rng2, 1); // burn the same one draw freshState() would have made
  for (let i = 0; i < 10; i += 1) {
    const prev = [...running];
    running = appendStep(running, rng2);
    assert(
      arraysEqual(running.slice(0, prev.length), prev),
      `appendStep step ${i} lost part of the sequence built so far`,
    );
  }
  assert(running.length === 11, `ten rounds of appendStep from length 1 ended at length ${running.length}, not 11`);
}

// 6) roundScore is strictly increasing in length and never negative.
{
  let increasing = true;
  let neverNegative = true;
  let prev = -Infinity;
  for (let len = 1; len <= 40; len += 1) {
    const v = roundScore(len);
    if (v < 0) neverNegative = false;
    if (v <= prev) increasing = false;
    prev = v;
  }
  assert(increasing, 'roundScore was not strictly increasing in pattern length');
  assert(neverNegative, 'roundScore returned a negative value');
}

// 7) flashDuration shortens (or holds at the floor) as the pattern grows, and
// hard is always faster than easy at the same length.
{
  let neverGrows = true;
  let prevEasy = Infinity;
  for (let len = 1; len <= 60; len += 1) {
    const v = flashDuration(len, 'easy');
    if (v > prevEasy + 1e-9) neverGrows = false;
    prevEasy = v;
  }
  assert(neverGrows, 'flashDuration grew as the pattern got longer under easy difficulty');

  let hardFaster = true;
  for (let len = 1; len <= 30; len += 5) {
    if (flashDuration(len, 'hard') >= flashDuration(len, 'easy')) hardFaster = false;
  }
  assert(hardFaster, 'hard difficulty was not faster than easy at the same pattern length');

  assert(flashDuration(500, 'hard') > 0, 'flashDuration reached zero or below on a very long pattern');
}

console.log(
  'Echo: seeded pattern generation, growth, prefix/completion checks, scoring, and pacing all verified.',
);

// --- self-tests: each sabotages a check and confirms it would fail ----------
let selfFails = 0;
function expectFail(name: string, run: () => boolean): void {
  // run() returns true when the sabotage is correctly detected as broken.
  if (run()) {
    console.log(`  ok  ${name}`);
  } else {
    selfFails += 1;
    console.error(`  SELF-TEST BROKEN: ${name} did not catch the sabotage`);
  }
}

expectFail('an out-of-order prefix is caught', () => {
  // A broken checker that ignores order (compares as multisets) would wrongly
  // accept a scrambled prefix. The real matchesPrefix must disagree with it.
  const target = [0, 1, 2, 3];
  const scrambledInput = [1, 0]; // same two values as target[0..1], wrong order
  const brokenIgnoresOrder = (t: number[], inp: number[]): boolean => {
    const st = [...t].sort();
    const si = [...inp].sort();
    return si.every((v, i) => v === st[i]);
  };
  return matchesPrefix(target, scrambledInput) !== brokenIgnoresOrder(target, scrambledInput);
});

expectFail('a wrong-but-full-length input is not a completed round', () => {
  // A broken "completion" check that only compares lengths would wrongly clear
  // this round; the real isRoundComplete must say no.
  const target = [0, 1, 2, 3];
  const wrongFull = [0, 1, 2, 9];
  const brokenLengthOnly = wrongFull.length === target.length;
  return isRoundComplete(target, wrongFull) !== brokenLengthOnly;
});

expectFail('appendStep dropping a step is caught', () => {
  // A broken "append" that drops the first step instead of adding one at the
  // end must fail the same prefix-preservation property the real appendStep
  // satisfies: length grew by exactly one, and every prior step survived.
  const seq = generateSequence(lcg(11), 4);
  const real = appendStep(seq, lcg(22));
  const brokenDropsFirst = seq.slice(1);
  const preservesPrefix = (out: number[]): boolean =>
    out.length === seq.length + 1 && arraysEqual(out.slice(0, seq.length), seq);
  return preservesPrefix(real) && !preservesPrefix(brokenDropsFirst);
});

if (failures > 0 || selfFails > 0) {
  console.error(`\nFAILED: ${failures} assertion(s), ${selfFails} broken self-test(s).`);
  process.exit(1);
}
console.log('\nEcho: all checks and self-tests passed.');
