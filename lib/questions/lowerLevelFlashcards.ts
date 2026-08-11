import type { VocabularyMastery } from '../progress';
import { VERBAL_QUESTIONS } from './verbal';
import { LOWER_LEVEL_VERBAL_QUESTIONS } from './verbalLowerLevel';
import { VOCAB_AB } from './vocab/ab';
import { VOCAB_CD } from './vocab/cd';
import { VOCAB_EH } from './vocab/eh';
import { VOCAB_IM } from './vocab/im';
import { VOCAB_NR } from './vocab/nr';
import { VOCAB_SZ } from './vocab/sz';
import { LOWER_LEVEL_FLASHCARD_DETAILS } from './lowerLevelFlashcardDetails';
import type { Question } from './types';

export type FlashcardPartOfSpeech = 'noun' | 'verb' | 'adjective' | 'adverb' | 'word';

export type LowerLevelFlashcard = {
  /** Stable source-deck id, ordered exactly like the supplied 100-page PDF. */
  id: string;
  /** Existing question id when the word was already present; otherwise the source-deck id. */
  questionId: string;
  word: string;
  partOfSpeech: FlashcardPartOfSpeech;
  /** The source deck's single closest synonym, retained as the quiz answer. */
  meaning: string;
  /** Several same-sense memory links shown after the card is revealed. */
  synonyms: string[];
  /** Plain-language meaning for a Lower Level learner. */
  definition: string;
  /** Natural sentence using this exact sense of the word. */
  example: string;
};

/**
 * The 200 headwords from "Lower Level ISEE Synonyms Flashcards" (two per page).
 * Meanings are the deck's primary synonym, with a few obvious source errors
 * corrected. The source typo "tempermental" is taught as "temperamental", and
 * "façade" uses its accepted ASCII spelling so search and iPhone keyboards agree.
 */
const SOURCE_DECK = `
ambition|n|goal
avoid|v|shun
apparent|a|obvious
appeal|n|request
approximate|v|estimate
arise|v|emerge
assert|v|declare
assess|v|evaluate
assist|v|help
astound|v|amaze
attest|v|prove
authority|n|power
beneficial|a|helpful
bountiful|a|plentiful
channel|v|guide
chaos|n|disorder
characteristic|n|feature
chronic|a|long-standing
clarity|n|clearness
commotion|n|uproar
compensate|v|repay
complement|v|complete
compose|v|create
conceal|v|hide
concept|n|idea
confirm|v|verify
consent|v|permit
contagious|a|infectious
contemporary|a|modern
contribute|v|donate
counsel|v|advise
crucial|a|important
current|a|present
dank|a|damp
decline|v|decrease
deceit|n|deception
devastate|v|destroy
dedicate|v|commit
deficient|a|lacking
demolish|v|destroy
deprive|v|deny
detrimental|a|harmful
devotion|n|loyalty
dispute|v|argue
distort|v|twist
dismay|n|alarm
diversity|n|variety
docile|a|obedient
dock|v|anchor
donate|v|give
drizzle|v|sprinkle
dwindle|v|diminish
effect|n|result
effective|a|successful
elevate|v|raise
elongate|v|lengthen
emaciated|a|skeletal
embark|v|begin
empower|v|authorize
encompass|v|surround
enhance|v|improve
enlist|v|recruit
enrich|v|improve
enthusiasm|n|excitement
entirety|n|whole
escalate|v|intensify
exhaust|v|deplete
facade|n|appearance
falter|v|hesitate
farce|n|mockery
fathom|v|understand
finalize|v|complete
flattery|n|praise
flicker|v|glimmer
fluctuate|v|vary
forage|v|search
forgo|v|go without
fragment|n|piece
frenzy|n|excitement
friction|n|resistance
frigid|a|freezing
frivolous|a|trivial
fugitive|n|runaway
fundamental|a|basic
fury|n|rage
glare|v|scowl
gleam|v|shine
glean|v|gather
hazard|n|danger
humble|a|modest
humid|a|damp
ideal|a|perfect
ignorant|a|unaware
illogical|a|unreasonable
illuminate|v|brighten
immaculate|a|spotless
immense|a|enormous
immerse|v|submerge
impersonate|v|imitate
implement|v|carry out
impression|n|belief
incandescent|a|glowing
industrious|a|hardworking
infer|v|conclude
innovate|v|invent
insight|n|understanding
integrate|v|combine
intuitive|a|instinctive
irate|a|angry
jagged|a|uneven
jumble|n|mishmash
lack|n|shortage
kin|n|relative
level|a|even
liberate|v|free
lunacy|n|foolishness
lush|a|abundant
luxury|n|extravagance
malicious|a|harmful
mar|v|damage
marginal|a|slight
meld|v|merge
mentor|n|adviser
method|n|procedure
mischief|n|trouble
modify|v|change
monitor|v|observe
mound|n|heap
moral|a|ethical
mortal|n|human
muted|a|softened
narrate|v|describe
nourish|v|feed
nutritive|a|nourishing
objective|n|goal
omit|v|exclude
optimum|a|best
perplexed|a|confused
persist|v|continue
plume|n|feather
portion|n|part
portly|a|stout
postpone|v|delay
practical|a|useful
precise|a|exact
profound|a|deep
propose|v|suggest
puzzled|a|confused
pursue|v|chase
quantity|n|amount
radiate|v|emit
realization|n|awareness
reassure|v|comfort
reasonable|a|fair
reconsider|v|rethink
recreation|n|amusement
recur|v|repeat
remote|a|distant
repel|v|drive away
resemble|v|look like
reside|v|live
resonate|v|echo
restrict|v|limit
retain|v|keep
robust|a|strong
salvage|v|save
satisfy|v|please
saturate|v|soak
sensible|a|reasonable
scorn|v|mock
sedated|a|calm
skeptical|a|doubtful
simplify|v|clarify
solemn|a|serious
sporadic|a|irregular
sprawl|v|spread
spite|n|malice
straightforward|a|direct
sustain|v|support
sympathy|n|compassion
tantrum|n|outburst
temperate|a|mild
temperamental|a|moody
thrifty|a|frugal
timid|a|shy
tonic|n|medicine
tread|v|walk
truce|n|peace
tyrant|n|dictator
unearth|v|discover
uniform|a|consistent
vengeance|n|revenge
vigilance|n|watchfulness
virtue|n|goodness
vital|a|essential
validate|v|verify
wistful|a|yearning
withered|a|shriveled
unity|n|union
cackle|n|laugh
`.trim();

const POS: Record<string, FlashcardPartOfSpeech> = {
  n: 'noun',
  v: 'verb',
  a: 'adjective',
  r: 'adverb',
};

const EXISTING_SYNONYMS = [
  ...VERBAL_QUESTIONS,
  ...LOWER_LEVEL_VERBAL_QUESTIONS,
  ...VOCAB_AB,
  ...VOCAB_CD,
  ...VOCAB_EH,
  ...VOCAB_IM,
  ...VOCAB_NR,
  ...VOCAB_SZ,
].filter((question) => question.kind === 'synonym');

// These words already existed by spelling, but their older question teaches a
// different sense or part of speech than the supplied deck. Reusing that id
// would make the correct choice contradict the new flashcard explanation.
const SOURCE_SENSE_REQUIRES_OWN_QUESTION = new Set([
  'decline',
  'dispute',
  'exhaust',
  'jumble',
]);

function normalizedWord(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const existingByWord = new Map(
  EXISTING_SYNONYMS
    .filter((question) => !SOURCE_SENSE_REQUIRES_OWN_QUESTION.has(normalizedWord(question.prompt)))
    .map((question) => [normalizedWord(question.prompt), question]),
);

const seeds = SOURCE_DECK.split('\n').map((row, index) => {
  const [word, pos, meaning] = row.split('|');
  if (!word || !meaning) throw new Error(`Broken Lower Level flashcard row ${index + 1}`);
  const detail = LOWER_LEVEL_FLASHCARD_DETAILS.get(word);
  if (!detail) throw new Error(`Missing learning detail for Lower Level flashcard “${word}”`);
  return {
    id: `llfc-${String(index + 1).padStart(3, '0')}`,
    word,
    partOfSpeech: POS[pos] ?? 'word',
    meaning,
    ...detail,
  };
});

export const LOWER_LEVEL_FLASHCARDS: LowerLevelFlashcard[] = seeds.map((seed) => ({
  ...seed,
  questionId: existingByWord.get(normalizedWord(seed.word))?.id ?? seed.id,
}));

const flashcardByQuestionId = new Map(
  LOWER_LEVEL_FLASHCARDS.map((card) => [card.questionId, card]),
);

function teachingExplanation(card: LowerLevelFlashcard, correctAnswer: string): string {
  return [
    `1. The best answer is “${correctAnswer}.”`,
    `2. “${card.word}” means ${card.definition}.`,
    `3. Similar words: ${card.synonyms.join(', ')}.`,
    `4. Example: ${card.example}`,
  ].join('\n');
}

/** Adds the full teaching answer to both new and previously existing source words. */
export function enrichLowerLevelFlashcardQuestion(question: Question): Question {
  const card = flashcardByQuestionId.get(question.id);
  return card
    ? { ...question, explain: teachingExplanation(card, question.choices[question.answer]) }
    : question;
}

export const LOWER_LEVEL_FLASHCARD_QUESTION_IDS = new Set(
  LOWER_LEVEL_FLASHCARDS.map((card) => card.questionId),
);

/**
 * Most short questions inside an ISEE Lower Level game block come from this
 * source deck until the learner knows it. Reading passages keep their own lane,
 * and the remaining draws preserve a broad curriculum mix.
 */
export const LOWER_LEVEL_GAME_PRIORITY_RATE = 0.72;

/**
 * Returns one source-deck question that needs attention, or null when every
 * available source word is mastered/not yet due. Missed words beat unseen
 * words, which beat once-known words whose short spacing delay has elapsed.
 */
export function pickLowerLevelGameQuestionId(
  availableQuestionIds: ReadonlySet<string>,
  vocabulary: Record<string, VocabularyMastery>,
  vocabularyClock: number,
  recentQuestionIds: string[] = [],
  random: () => number = Math.random,
): string | null {
  const available = LOWER_LEVEL_FLASHCARDS.filter((card) =>
    availableQuestionIds.has(card.questionId),
  );
  const mastery = (card: LowerLevelFlashcard) => vocabulary[card.questionId];
  const tiers = [
    available.filter((card) => (mastery(card)?.misses ?? 0) > 0),
    available.filter((card) => !mastery(card)),
    available.filter((card) => {
      const state = mastery(card);
      return state && state.correctStreak < 2 && state.dueAt <= vocabularyClock;
    }),
  ];
  const recent = new Set(recentQuestionIds.slice(-3));
  const tier = tiers
    .map((candidates) => candidates.filter((card) => !recent.has(card.questionId)))
    .find((candidates) => candidates.length > 0);
  if (!tier) return null;
  return tier[Math.floor(random() * tier.length)].questionId;
}

function distractorsFor(index: number): string[] {
  const seed = seeds[index];
  const samePart = seeds.filter(
    (candidate) =>
      candidate.partOfSpeech === seed.partOfSpeech &&
      candidate.meaning !== seed.meaning &&
      Math.abs(candidate.meaning.length - seed.meaning.length) <= 7,
  );
  const pool = samePart.length >= 3 ? samePart : seeds.filter((candidate) => candidate.meaning !== seed.meaning);
  const picked: string[] = [];
  let cursor = (index * 37 + 19) % pool.length;
  while (picked.length < 3) {
    const candidate = pool[cursor].meaning;
    if (!picked.includes(candidate) && candidate !== seed.meaning) picked.push(candidate);
    cursor = (cursor + 1) % pool.length;
  }
  return picked;
}

/**
 * The 165 absent words plus four words whose legacy question uses another
 * sense/part of speech. Those four need a dedicated source-deck question.
 */
export const LOWER_LEVEL_FLASHCARD_QUESTIONS: Question[] = seeds.flatMap((seed, index) => {
  if (existingByWord.has(normalizedWord(seed.word))) return [];
  const answer = index % 4;
  const choices = distractorsFor(index);
  choices.splice(answer, 0, seed.meaning);
  return [
    {
      id: seed.id,
      subject: 'verbal',
      kind: 'synonym',
      verbalSkill: 'synonym',
      topic: 'Lower Level flashcard vocabulary',
      prompt: seed.word.toUpperCase(),
      choices,
      answer,
      explain: teachingExplanation({
        ...seed,
        questionId: seed.id,
      }, seed.meaning),
      difficulty: seed.word.length >= 10 ? 3 : seed.word.length >= 7 ? 2 : 1,
    },
  ];
});

/**
 * Missed cards recur first, unseen cards fill the rest of the opening pass, and
 * twice-known cards wait until due. Recent ids prevent an annoying immediate loop.
 */
export function pickLowerLevelFlashcard(
  vocabulary: Record<string, VocabularyMastery>,
  vocabularyClock: number,
  recentQuestionIds: string[] = [],
  random: () => number = Math.random,
): LowerLevelFlashcard {
  const recent = new Set(recentQuestionIds.slice(-3));
  const available = LOWER_LEVEL_FLASHCARDS.filter((card) => !recent.has(card.questionId));
  const pool = available.length > 0 ? available : LOWER_LEVEL_FLASHCARDS;
  const state = (card: LowerLevelFlashcard) => vocabulary[card.questionId];
  const tiers = [
    pool.filter((card) => (state(card)?.misses ?? 0) > 0),
    pool.filter((card) => !state(card)),
    pool.filter((card) => {
      const mastery = state(card);
      return mastery && mastery.correctStreak < 2 && mastery.dueAt <= vocabularyClock;
    }),
    pool.filter((card) => {
      const mastery = state(card);
      return mastery && mastery.correctStreak >= 2 && mastery.dueAt <= vocabularyClock;
    }),
  ];
  const selected = tiers.find((tier) => tier.length > 0) ?? pool;
  return selected[Math.floor(random() * selected.length)];
}
