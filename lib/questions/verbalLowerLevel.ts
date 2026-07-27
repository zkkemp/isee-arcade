import type { Question } from './types';

export const LOWER_LEVEL_VERBAL_BLUEPRINT = {
  synonym: 17,
  singleWordCompletion: 11,
  phraseCompletion: 6,
  total: 34,
} as const;

export const LOWER_LEVEL_COMPLETION_TOPICS = {
  singleWord: 'sentence completion: single word',
  phrase: 'sentence completion: phrase',
} as const;

/**
 * Original ISEE Lower Level sentence-completion practice.
 *
 * ERB describes Lower Level answers as either words or short phrases. The
 * original bank had single-word answers only, so this set deliberately balances
 * twelve of each. Clue words do real work, and every explanation shows a child
 * which clue controls the blank.
 */
export const LOWER_LEVEL_VERBAL_QUESTIONS: Question[] = [
  {
    id: 'vbll-001', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 1,
    prompt: 'Since the puppy had never met us, it was ------ and stayed close to its owner.',
    choices: ['eager', 'wary', 'noisy', 'sleepy'], answer: 1,
    explain: 'Since tells us why the puppy stayed close. A wary puppy is careful around people it does not know.',
  },
  {
    id: 'vbll-002', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 1,
    prompt: 'The museum guard asked us to speak ------ so we would not disturb the other visitors.',
    choices: ['softly', 'honestly', 'often', 'suddenly'], answer: 0,
    explain: 'Not disturbing visitors is the clue. Speaking softly means using a quiet voice.',
  },
  {
    id: 'vbll-003', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 1,
    prompt: 'Although the backpack looked small, it was ------ enough to hold all of Lena\'s camping gear.',
    choices: ['ancient', 'fragile', 'spacious', 'costly'], answer: 2,
    explain: 'Although signals a surprise: the small-looking bag had lots of room. Spacious means roomy.',
  },
  {
    id: 'vbll-004', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 1,
    prompt: 'The directions were so ------ that every group reached the nature center without getting lost.',
    choices: ['lengthy', 'secret', 'cheerful', 'clear'], answer: 3,
    explain: 'Every group arrived without getting lost, so the directions must have been clear and easy to follow.',
  },
  {
    id: 'vbll-005', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 2,
    prompt: 'Because the two accounts of the game did not match, the reporter tried to ------ what had really happened.',
    choices: ['decorate', 'verify', 'postpone', 'imitate'], answer: 1,
    explain: 'The stories disagree, so the reporter must check the facts. Verify means find out whether something is true.',
  },
  {
    id: 'vbll-006', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 2,
    prompt: 'Mira gave a ------ summary, mentioning only the three most important events.',
    choices: ['brief', 'vivid', 'confusing', 'ordinary'], answer: 0,
    explain: 'Only three important events were included. Brief means short and focused.',
  },
  {
    id: 'vbll-007', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 2,
    prompt: 'The creek seemed shallow, but its swift current made crossing it ------.',
    choices: ['pleasant', 'simple', 'perilous', 'popular'], answer: 2,
    explain: 'But warns that the creek is not as safe as it looks. Perilous means dangerous.',
  },
  {
    id: 'vbll-008', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 2,
    prompt: 'When the final vote was tied, the club president had to make the ------ decision.',
    choices: ['careless', 'earliest', 'quietest', 'decisive'], answer: 3,
    explain: 'A tied vote needs one choice that settles the result. Decisive means able to decide the matter.',
  },
  {
    id: 'vbll-009', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 3,
    prompt: 'The scientist remained ------, refusing to accept the surprising result until the test was repeated.',
    choices: ['grateful', 'skeptical', 'restless', 'fortunate'], answer: 1,
    explain: 'Refusing to accept a result without another test shows doubt. Skeptical means not yet convinced.',
  },
  {
    id: 'vbll-010', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 3,
    prompt: 'Rather than answer every objection, the speaker chose to ------ the strongest one directly.',
    choices: ['address', 'scatter', 'borrow', 'predict'], answer: 0,
    explain: 'The clue is directly answering an objection. To address an objection is to deal with it.',
  },
  {
    id: 'vbll-011', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 3,
    prompt: 'The twins look alike, but their interests are ------: one loves music while the other prefers machines.',
    choices: ['hidden', 'trivial', 'distinct', 'temporary'], answer: 2,
    explain: 'But introduces a contrast, and the examples show different interests. Distinct means clearly different.',
  },
  {
    id: 'vbll-012', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_word', topic: 'sentence completion: single word', difficulty: 3,
    prompt: 'By checking several trustworthy sources, Amari was able to ------ the rumor.',
    choices: ['announce', 'repeat', 'collect', 'disprove'], answer: 3,
    explain: 'Trustworthy sources can show that a rumor is false. Disprove means show that something is not true.',
  },
  {
    id: 'vbll-013', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 1,
    prompt: 'The rain stopped just before the picnic, so the change in weather was ------.',
    choices: ['a lucky break', 'a strict rule', 'a hidden cost', 'a long delay'], answer: 0,
    explain: 'The picnic could happen because the rain stopped at the right time. A lucky break is a helpful piece of good luck.',
  },
  {
    id: 'vbll-014', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 1,
    prompt: 'When Kai saw the empty bird feeder, he knew that filling it should be ------.',
    choices: ['out of reach', 'his first task', 'a rare mistake', 'the final result'], answer: 1,
    explain: 'The feeder is empty, so it needs attention now. His first task means the job he should do before the others.',
  },
  {
    id: 'vbll-015', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 1,
    prompt: 'Nora practiced the speech many times, and by Friday she knew it ------.',
    choices: ['at a distance', 'without a reason', 'by heart', 'under a table'], answer: 2,
    explain: 'Practicing many times can make the words easy to remember. Knowing something by heart means knowing it from memory.',
  },
  {
    id: 'vbll-016', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 1,
    prompt: 'The class finished cleaning the park ahead of schedule because everyone ------.',
    choices: ['changed the subject', 'missed the point', 'waited in line', 'pitched in'], answer: 3,
    explain: 'Finishing early happened because everyone helped. Pitched in means joined the work.',
  },
  {
    id: 'vbll-017', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 2,
    prompt: 'The first design failed, but the engineers went ------ and tried a different plan.',
    choices: ['back to the drawing board', 'under the weather', 'around the corner', 'over the moon'], answer: 0,
    explain: 'A failed design means they must start planning again. Back to the drawing board means returning to the planning stage.',
  },
  {
    id: 'vbll-018', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 2,
    prompt: 'Instead of choosing quickly, the judges decided to ------ before naming a winner.',
    choices: ['raise the roof', 'weigh the evidence', 'break the news', 'miss the boat'], answer: 1,
    explain: 'Judges should study the facts before deciding. Weigh the evidence means consider the information carefully.',
  },
  {
    id: 'vbll-019', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 2,
    prompt: 'Since the trail signs were missing, the hikers had to ------ and study their map.',
    choices: ['take a bow', 'make a scene', 'get their bearings', 'keep a secret'], answer: 2,
    explain: 'Missing signs can make hikers unsure of their location. Get their bearings means figure out where they are.',
  },
  {
    id: 'vbll-020', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 2,
    prompt: 'When the team captain admitted her own mistake, she helped ------ during the argument.',
    choices: ['change the rules', 'hide the facts', 'waste some time', 'clear the air'], answer: 3,
    explain: 'Admitting a mistake can remove bad feelings. Clear the air means settle tension by speaking honestly.',
  },
  {
    id: 'vbll-021', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 3,
    prompt: 'The new evidence seemed unimportant at first, but it eventually proved to be ------.',
    choices: ['the missing link', 'a narrow escape', 'a passing fancy', 'an open secret'], answer: 0,
    explain: 'But shows the evidence became important. The missing link is the piece that connects the other facts.',
  },
  {
    id: 'vbll-022', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 3,
    prompt: 'Leila did not copy her mentor\'s painting; instead, she used it as ------ for a style of her own.',
    choices: ['a warning sign', 'a point of departure', 'a finished product', 'a false alarm'], answer: 1,
    explain: 'Instead shows Leila began with the idea but went somewhere new. A point of departure is a starting place.',
  },
  {
    id: 'vbll-023', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 3,
    prompt: 'The committee could not fix every problem at once, so it chose to ------ by repairing the unsafe stairs.',
    choices: ['read between the lines', 'leave no stone unturned', 'set a clear priority', 'take the blame'], answer: 2,
    explain: 'They had to choose the most urgent job first. Set a clear priority means decide what matters most right now.',
  },
  {
    id: 'vbll-024', subject: 'verbal', kind: 'sentence_completion',
    verbalSkill: 'sentence_completion_phrase', topic: 'sentence completion: phrase', difficulty: 3,
    prompt: 'The mayor promised a quick solution, but the complicated problem was not something she could solve ------.',
    choices: ['at first glance', 'for good reason', 'in plain sight', 'at the stroke of a pen'], answer: 3,
    explain: 'But tells us the solution cannot be instant. At the stroke of a pen means by one quick, simple action.',
  },
];
