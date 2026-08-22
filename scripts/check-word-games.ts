import * as WordGames from '../lib/wordGames';

const { ALPHABET, scrambleWord, wordForRound, WORD_BANKS } = WordGames;

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

assert(ALPHABET.length === 26 && new Set(ALPHABET).size === 26, 'alphabet is incomplete');
const genericBands = [
  'k',
  'grade1',
  'grade2',
  'grade3',
  'grade4',
  'grade5',
  'grade6',
  'grade7',
  'grade8',
] as const;
const iseeWords = new Set(WORD_BANKS.isee.map((card) => card.word));
for (const band of genericBands) {
  const overlap = WORD_BANKS[band].filter((card) => iseeWords.has(card.word));
  assert(overlap.length === 0, `${band} leaked ISEE words: ${overlap.map((card) => card.word).join(', ')}`);
}
const layoutForWord = Reflect.get(WordGames, 'hangmanWordLayout') as
  | ((length: number) => { columns: number; gapPx: number; fontSizePx: number })
  | undefined;
assert(typeof layoutForWord === 'function', 'Hangman needs a responsive one-row word layout');
for (const length of [3, 11, 14]) {
  const layout = layoutForWord(length);
  assert(layout.columns === length, `${length}-letter words must keep every slot in one row`);
  assert(layout.gapPx >= 2, `${length}-letter words need visible space between slots`);
  assert(layout.fontSizePx >= 16, `${length}-letter words must remain readable on an iPhone`);
}
for (const [band, bank] of Object.entries(WORD_BANKS)) {
  assert(bank.length >= 16, `${band} needs at least 16 words`);
  assert(new Set(bank.map((card) => card.word)).size === bank.length, `${band} repeats a word`);
  for (const card of bank) {
    assert(/^[A-Z]+$/.test(card.word), `${card.word} has unsupported characters`);
    for (let seed = 1; seed <= 20; seed += 1) {
      const scrambled = scrambleWord(card.word, seed);
      assert(scrambled.join('') !== card.word, `${card.word} did not scramble`);
      assert([...scrambled].sort().join('') === [...card.word].sort().join(''), `${card.word} lost letters`);
    }
  }
  for (let round = 1; round <= 30; round += 1) {
    assert(bank.includes(wordForRound(band as keyof typeof WORD_BANKS, 'normal', round)), `${band} picker escaped its bank`);
  }
}
console.log('Word games audit: adaptive banks, alphabet, scrambling, and 30-round selection passed.');
