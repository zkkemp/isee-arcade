import type { Difficulty } from './difficulty';
import type { GradeBand } from './questions';

export type WordCard = {
  word: string;
  hint: string;
  picture?: string;
};

export type HangmanWordLayout = {
  columns: number;
  gapPx: number;
  fontSizePx: number;
};

/** Keeps every Hangman word on one readable row, including 14-letter words on a phone. */
export function hangmanWordLayout(length: number): HangmanWordLayout {
  const columns = Math.max(1, Math.floor(length));
  if (columns >= 13) return { columns, gapPx: 2, fontSizePx: 16 };
  if (columns >= 10) return { columns, gapPx: 3, fontSizePx: 18 };
  if (columns >= 8) return { columns, gapPx: 4, fontSizePx: 21 };
  return { columns, gapPx: 8, fontSizePx: 28 };
}

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

const GRADE_2_WORDS: WordCard[] = [
  { word: 'BRAVE', hint: 'Ready to face something difficult', picture: '🦁' },
  { word: 'CHEER', hint: 'To shout encouragement or show happiness', picture: '📣' },
  { word: 'CLOUD', hint: 'A white or gray shape made of tiny drops in the sky', picture: '☁️' },
  { word: 'DANCE', hint: 'To move your body to music', picture: '💃' },
  { word: 'DREAM', hint: 'A story your mind makes while you sleep', picture: '💭' },
  { word: 'EARTH', hint: 'The planet where we live', picture: '🌎' },
  { word: 'FLOAT', hint: 'To stay on top of water or move gently through air', picture: '🎈' },
  { word: 'FOREST', hint: 'A large area filled with trees', picture: '🌲' },
  { word: 'GENTLE', hint: 'Kind, calm, and not rough', picture: '🪶' },
  { word: 'GROWTH', hint: 'The process of becoming bigger or developing', picture: '🌱' },
  { word: 'INSECT', hint: 'A small animal with six legs', picture: '🐞' },
  { word: 'LEARN', hint: 'To gain knowledge or a new skill', picture: '📚' },
  { word: 'NATURE', hint: 'Plants, animals, weather, and the outdoor world', picture: '🌿' },
  { word: 'QUICK', hint: 'Moving or happening fast', picture: '⚡' },
  { word: 'REASON', hint: 'A fact that explains why something happens', picture: '💡' },
  { word: 'SHADOW', hint: 'A dark shape made when light is blocked', picture: '👤' },
];

const GRADE_4_WORDS: WordCard[] = [
  { word: 'ACCURATE', hint: 'Correct and free from mistakes' },
  { word: 'APPROACH', hint: 'A way of doing something or moving closer' },
  { word: 'CONCLUDE', hint: 'To decide after thinking about the evidence' },
  { word: 'CONSIDER', hint: 'To think carefully about something' },
  { word: 'CONTEXT', hint: 'The words or situation around an idea that help explain it' },
  { word: 'DESCRIBE', hint: 'To tell what someone or something is like' },
  { word: 'EVIDENCE', hint: 'Facts or details that support an answer' },
  { word: 'FREQUENT', hint: 'Happening often' },
  { word: 'INCREASE', hint: 'To become or make something greater' },
  { word: 'METHOD', hint: 'A planned way of doing something' },
  { word: 'OBSERVE', hint: 'To watch carefully and notice details' },
  { word: 'PATTERN', hint: 'Something that repeats in a predictable way' },
  { word: 'PURPOSE', hint: 'The reason something exists or is done' },
  { word: 'RESULT', hint: 'What happens because of an action or event' },
  { word: 'SIMILAR', hint: 'Alike in important ways but not exactly the same' },
  { word: 'SUMMARY', hint: 'A short statement of the most important ideas' },
];

const GRADE_5_WORDS: WordCard[] = [
  { word: 'ACCOMPLISH', hint: 'To finish something successfully' },
  { word: 'ADAPT', hint: 'To change so something works in a new situation' },
  { word: 'CONSEQUENCE', hint: 'A result that follows an action or decision' },
  { word: 'CONTRIBUTE', hint: 'To give or add something to a shared effort' },
  { word: 'EMPHASIZE', hint: 'To give special importance or attention to something' },
  { word: 'ESSENTIAL', hint: 'Completely necessary or very important' },
  { word: 'ESTIMATE', hint: 'A close calculation made without exact information' },
  { word: 'FORMULATE', hint: 'To develop an idea or plan carefully' },
  { word: 'INFLUENCE', hint: 'The power to affect what happens or how someone thinks' },
  { word: 'INTERPRET', hint: 'To explain the meaning of something' },
  { word: 'PERSPECTIVE', hint: 'A particular way of seeing or thinking about something' },
  { word: 'PRIORITY', hint: 'Something important that should be handled first' },
  { word: 'RECOGNIZE', hint: 'To identify something because you have seen or learned it before' },
  { word: 'REQUIRE', hint: 'To need or make necessary' },
  { word: 'STRUCTURE', hint: 'The way parts are organized to form a whole' },
  { word: 'SUMMARIZE', hint: 'To state the main ideas briefly' },
];

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

const GRADE_7_WORDS: WordCard[] = [
  { word: 'ACCUMULATE', hint: 'To gather or build up over time' },
  { word: 'ALTERNATIVE', hint: 'Another choice or possibility' },
  { word: 'ANTICIPATE', hint: 'To expect and prepare for something' },
  { word: 'COMPONENT', hint: 'One part of a larger system or whole' },
  { word: 'CONVENTION', hint: 'A commonly accepted practice or way of doing something' },
  { word: 'CRITERIA', hint: 'Standards used to judge or decide something' },
  { word: 'DEMONSTRATE', hint: 'To show clearly through evidence or an example' },
  { word: 'DISTINGUISH', hint: 'To recognize or explain the difference between things' },
  { word: 'EVALUATE', hint: 'To judge quality or importance using evidence' },
  { word: 'FUNCTION', hint: 'The purpose or job of something' },
  { word: 'INTEGRATE', hint: 'To combine parts into a complete whole' },
  { word: 'MAINTAIN', hint: 'To keep something in a particular condition' },
  { word: 'OBJECTIVE', hint: 'A goal, or a view based on facts rather than feelings' },
  { word: 'PRINCIPLE', hint: 'A basic rule, truth, or belief' },
  { word: 'PROPORTION', hint: 'A relationship showing how quantities compare' },
  { word: 'VARIABLE', hint: 'A quantity or factor that can change' },
];

const GRADE_8_WORDS: WordCard[] = [
  { word: 'ABSTRACT', hint: 'Based on ideas rather than a physical object' },
  { word: 'ADVOCATE', hint: 'To publicly support a cause or idea' },
  { word: 'ANALOGY', hint: 'A comparison used to explain a relationship' },
  { word: 'ASSUMPTION', hint: 'Something accepted as true without complete proof' },
  { word: 'CAPACITY', hint: 'The ability or maximum amount something can hold or do' },
  { word: 'COMPREHENSIVE', hint: 'Including nearly every important part or detail' },
  { word: 'CONTRADICTION', hint: 'A statement or fact that conflicts with another' },
  { word: 'DISTRIBUTE', hint: 'To divide and give out among several people or places' },
  { word: 'EQUIVALENT', hint: 'Equal in value, meaning, or effect' },
  { word: 'INNOVATE', hint: 'To introduce a useful new idea or method' },
  { word: 'INTERPRETATION', hint: 'An explanation of what something means' },
  { word: 'PRELIMINARY', hint: 'Coming before the main or final part' },
  { word: 'REINFORCE', hint: 'To strengthen an idea, structure, or behavior' },
  { word: 'SUBSEQUENT', hint: 'Coming after something else in time or order' },
  { word: 'VALIDATE', hint: 'To confirm that something is accurate or reasonable' },
  { word: 'SYNTHESIS', hint: 'A new whole formed by combining several ideas' },
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
  grade2: GRADE_2_WORDS,
  grade3: BASE_WORD_BANKS.grade3,
  grade4: GRADE_4_WORDS,
  grade5: GRADE_5_WORDS,
  grade6: MIDDLE_WORDS,
  grade7: GRADE_7_WORDS,
  grade8: GRADE_8_WORDS,
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
