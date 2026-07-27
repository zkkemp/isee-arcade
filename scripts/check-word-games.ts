import { ALPHABET, scrambleWord, wordForRound, WORD_BANKS } from '../lib/wordGames';

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

assert(ALPHABET.length === 26 && new Set(ALPHABET).size === 26, 'alphabet is incomplete');
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
