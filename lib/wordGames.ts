import type { Difficulty } from './difficulty';
import type { GradeBand } from './questions';

export type WordCard = {
  word: string;
  hint: string;
  picture?: string;
};

const BASE_WORD_BANKS = {
  k: [
    { word: 'CAT', hint: 'A pet that says meow', picture: '🐱' },
    { word: 'DOG', hint: 'A pet that can bark', picture: '🐶' },
    { word: 'SUN', hint: 'It shines in the sky', picture: '☀️' },
    { word: 'HAT', hint: 'You wear it on your head', picture: '🧢' },
    { word: 'PIG', hint: 'A pink farm animal', picture: '🐷' },
    { word: 'BUS', hint: 'A big ride to school', picture: '🚌' },
    { word: 'BED', hint: 'Where you sleep', picture: '🛏️' },
    { word: 'CUP', hint: 'You drink from it', picture: '🥤' },
    { word: 'FOX', hint: 'A clever animal with a bushy tail', picture: '🦊' },
    { word: 'MAP', hint: 'It helps you find a place', picture: '🗺️' },
    { word: 'FISH', hint: 'It swims in water', picture: '🐟' },
    { word: 'FROG', hint: 'It hops and says ribbit', picture: '🐸' },
    { word: 'STAR', hint: 'A bright shape in the night sky', picture: '⭐' },
    { word: 'CAKE', hint: 'A sweet birthday treat', picture: '🎂' },
    { word: 'DUCK', hint: 'A bird that quacks', picture: '🦆' },
    { word: 'MOON', hint: 'It glows at night', picture: '🌙' },
  ],
  grade1: [
    { word: 'APPLE', hint: 'A crunchy red or green fruit', picture: '🍎' },
    { word: 'RABBIT', hint: 'An animal with long ears', picture: '🐰' },
    { word: 'SCHOOL', hint: 'A place to learn', picture: '🏫' },
    { word: 'HAPPY', hint: 'How you feel when you smile', picture: '😄' },
    { word: 'TURTLE', hint: 'A slow animal with a shell', picture: '🐢' },
    { word: 'GARDEN', hint: 'A place where flowers grow', picture: '🌻' },
    { word: 'PENCIL', hint: 'You write and erase with it', picture: '✏️' },
    { word: 'WINTER', hint: 'The coldest season', picture: '❄️' },
    { word: 'YELLOW', hint: 'The color of a bright lemon', picture: '🍋' },
    { word: 'FRIEND', hint: 'Someone you like to play with', picture: '🤝' },
    { word: 'BASKET', hint: 'It can carry a picnic', picture: '🧺' },
    { word: 'PLANET', hint: 'A world that travels around a star', picture: '🪐' },
    { word: 'BUTTON', hint: 'You may press it or fasten a shirt with it', picture: '🔘' },
    { word: 'RAINBOW', hint: 'Colors that can appear after rain', picture: '🌈' },
    { word: 'COOKIE', hint: 'A small baked treat', picture: '🍪' },
    { word: 'ROCKET', hint: 'It blasts into space', picture: '🚀' },
  ],
  grade3: [
    { word: 'JOURNEY', hint: 'A trip from one place to another', picture: '🧭' },
    { word: 'VOLCANO', hint: 'A mountain that can erupt', picture: '🌋' },
    { word: 'WHISPER', hint: 'To speak very quietly', picture: '🤫' },
    { word: 'CURIOUS', hint: 'Eager to learn or know', picture: '🔎' },
    { word: 'HABITAT', hint: 'The natural home of a plant or animal', picture: '🌿' },
    { word: 'COMPASS', hint: 'A tool that shows direction', picture: '🧭' },
    { word: 'FRAGILE', hint: 'Easy to break', picture: '📦' },
    { word: 'ENERGY', hint: 'The power to do work or move', picture: '⚡' },
    { word: 'ANCIENT', hint: 'Very, very old', picture: '🏛️' },
    { word: 'DISCOVER', hint: 'To find something for the first time', picture: '💡' },
    { word: 'MIGRATE', hint: 'To move from one region to another', picture: '🦋' },
    { word: 'CLIMATE', hint: 'The usual weather of a place', picture: '🌦️' },
    { word: 'FRACTION', hint: 'A number that names part of a whole', picture: '½' },
    { word: 'MEASURE', hint: 'To find size, length, or amount', picture: '📏' },
    { word: 'PREDICT', hint: 'To say what you think will happen', picture: '🔮' },
    { word: 'EXPLAIN', hint: 'To make an idea clear', picture: '💬' },
  ],
  isee: [
    { word: 'ABUNDANT', hint: 'Plentiful; more than enough' },
    { word: 'CAUTIOUS', hint: 'Careful to avoid danger or mistakes' },
    { word: 'TRANQUIL', hint: 'Peaceful and calm' },
    { word: 'VORACIOUS', hint: 'Having an enormous appetite' },
    { word: 'PECULIAR', hint: 'Strange or unusual' },
    { word: 'DILIGENT', hint: 'Careful and hardworking' },
    { word: 'RELUCTANT', hint: 'Unwilling or hesitant' },
    { word: 'FORMIDABLE', hint: 'Very powerful or difficult to face' },
    { word: 'BENEVOLENT', hint: 'Kind and generous' },
    { word: 'METICULOUS', hint: 'Extremely careful about details' },
    { word: 'AMBIGUOUS', hint: 'Having more than one possible meaning' },
    { word: 'RESILIENT', hint: 'Able to recover after difficulty' },
    { word: 'CONSPICUOUS', hint: 'Easy to notice' },
    { word: 'INEVITABLE', hint: 'Certain to happen' },
    { word: 'PRUDENT', hint: 'Showing wise and careful judgment' },
    { word: 'SCRUTINIZE', hint: 'To examine very closely' },
    { word: 'VERSATILE', hint: 'Able to do many different things well' },
    { word: 'EXUBERANT', hint: 'Full of lively excitement' },
    { word: 'IMPARTIAL', hint: 'Fair; not favoring either side' },
    { word: 'TENACIOUS', hint: 'Not giving up easily' },
  ],
} satisfies Record<'k' | 'grade1' | 'grade3' | 'isee', WordCard[]>;

const MIDDLE_WORDS: WordCard[] = [
  { word: 'ANALYZE', hint: 'To examine something carefully and explain its parts' },
  { word: 'COHERENT', hint: 'Logical, connected, and easy to understand' },
  { word: 'CONTRAST', hint: 'To show how two things are different' },
  { word: 'DEDUCE', hint: 'To reach an answer by using evidence and reasoning' },
  { word: 'EXPLICIT', hint: 'Stated clearly and directly' },
  { word: 'FEASIBLE', hint: 'Possible and practical to accomplish' },
  { word: 'HYPOTHESIS', hint: 'A testable explanation or prediction' },
  { word: 'IMPLICIT', hint: 'Suggested without being stated directly' },
  { word: 'INFER', hint: 'To figure out what is likely true from clues' },
  { word: 'JUSTIFY', hint: 'To support an answer with reasons or evidence' },
  { word: 'PRECISE', hint: 'Exact and carefully stated' },
  { word: 'RELEVANT', hint: 'Closely connected to the topic or question' },
  { word: 'SEQUENCE', hint: 'A set of things arranged in a particular order' },
  { word: 'SIGNIFICANT', hint: 'Important enough to matter' },
  { word: 'SYNTHESIZE', hint: 'To combine ideas into a new understanding' },
  { word: 'VALID', hint: 'Well-supported or logically sound' },
];

const UPPER_WORDS: WordCard[] = [
  { word: 'ABERRATION', hint: 'Something that departs from what is normal or expected' },
  { word: 'BOLSTER', hint: 'To support, strengthen, or improve' },
  { word: 'CANDID', hint: 'Truthful and direct, even when the truth is uncomfortable' },
  { word: 'CONCISE', hint: 'Brief but complete and clear' },
  { word: 'DISPARATE', hint: 'So different that comparison is difficult' },
  { word: 'EMPIRICAL', hint: 'Based on observation or experiment' },
  { word: 'EQUIVOCAL', hint: 'Uncertain or open to more than one interpretation' },
  { word: 'EXACERBATE', hint: 'To make a problem or condition worse' },
  { word: 'INCONGRUOUS', hint: 'Out of place or not in harmony with its surroundings' },
  { word: 'LUCID', hint: 'Clear and easy to understand' },
  { word: 'MITIGATE', hint: 'To make something harmful less severe' },
  { word: 'NUANCED', hint: 'Showing subtle distinctions or fine shades of meaning' },
  { word: 'PRAGMATIC', hint: 'Focused on practical results rather than theory' },
  { word: 'REFUTE', hint: 'To prove a statement or argument wrong' },
  { word: 'SUBSTANTIATE', hint: 'To support a claim with evidence' },
  { word: 'TENUOUS', hint: 'Weak, slight, or not strongly supported' },
];

export const WORD_BANKS: Record<GradeBand, WordCard[]> = {
  k: BASE_WORD_BANKS.k,
  grade1: BASE_WORD_BANKS.grade1,
  grade2: [...BASE_WORD_BANKS.grade1, ...BASE_WORD_BANKS.grade3.slice(0, 8)],
  grade3: BASE_WORD_BANKS.grade3,
  grade4: [...BASE_WORD_BANKS.grade3, ...BASE_WORD_BANKS.isee.slice(0, 8)],
  grade5: [...BASE_WORD_BANKS.grade3.slice(8), ...BASE_WORD_BANKS.isee],
  grade6: [...BASE_WORD_BANKS.isee, ...MIDDLE_WORDS.slice(0, 8)],
  grade7: [...BASE_WORD_BANKS.isee, ...MIDDLE_WORDS],
  grade8: [...MIDDLE_WORDS, ...UPPER_WORDS.slice(0, 8)],
  isee: BASE_WORD_BANKS.isee,
  iseeMiddle: [...BASE_WORD_BANKS.isee, ...MIDDLE_WORDS],
  iseeUpper: [...MIDDLE_WORDS, ...UPPER_WORDS],
};

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function wordForRound(
  band: GradeBand,
  difficulty: Difficulty,
  round: number,
  salt = 0,
): WordCard {
  const bank = WORD_BANKS[band];
  const ramp = round + (difficulty === 'hard' ? 5 : difficulty === 'normal' ? 2 : 0);
  const sorted = [...bank].sort((a, b) => a.word.length - b.word.length);
  const minimumIndex = Math.min(Math.max(0, Math.floor(ramp / 3) - 1), Math.max(0, sorted.length - 6));
  const pool = sorted.slice(minimumIndex);
  return pool[(hash(`${band}:${round}:${salt}`) + round * 7) % pool.length];
}

export function scrambleWord(word: string, seed: number): string[] {
  const letters = word.split('');
  let value = (seed ^ hash(word)) >>> 0;
  for (let index = letters.length - 1; index > 0; index -= 1) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    const swap = value % (index + 1);
    [letters[index], letters[swap]] = [letters[swap], letters[index]];
  }
  if (letters.join('') === word && letters.length > 1) {
    letters.push(letters.shift() as string);
  }
  return letters;
}

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
