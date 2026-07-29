import type { Question, QuestionKind, Subject } from './types';

export type ElementaryBand = 'k' | 'grade1' | 'grade2' | 'grade3';

type QuestionSpec = {
  id: string;
  subject: Subject;
  kind: QuestionKind;
  topic: string;
  prompt: string;
  correct: string;
  distractors: string[];
  explain: string;
  difficulty: 1 | 2 | 3;
};

function stableAnswerIndex(id: string): 0 | 1 | 2 | 3 {
  let total = 0;
  for (const character of id) total += character.charCodeAt(0);
  return (total % 4) as 0 | 1 | 2 | 3;
}

function fixedQuestion(spec: QuestionSpec): Question {
  const normalizedCorrect = spec.correct.trim().toLowerCase();
  const distractors = spec.distractors
    .filter((choice, index, all) => {
      const normalized = choice.trim().toLowerCase();
      return (
        normalized !== normalizedCorrect &&
        all.findIndex((candidate) => candidate.trim().toLowerCase() === normalized) === index
      );
    })
    .slice(0, 3);
  if (distractors.length !== 3) {
    throw new Error(`${spec.id} needs three unique distractors`);
  }
  const answer = stableAnswerIndex(spec.id);
  const choices = [...distractors];
  choices.splice(answer, 0, spec.correct);
  return {
    id: spec.id,
    subject: spec.subject,
    kind: spec.kind,
    topic: spec.topic,
    prompt: spec.prompt,
    choices,
    answer,
    explain: spec.explain,
    difficulty: spec.difficulty,
  };
}

function numberDistractors(correct: number): string[] {
  const values: number[] = [];
  for (const offset of [1, -1, 2, -2, 10, -10, 5, -5, 3, -3]) {
    const candidate = correct + offset;
    if (candidate >= 0 && candidate !== correct && !values.includes(candidate)) {
      values.push(candidate);
    }
    if (values.length === 3) break;
  }
  return values.map(String);
}

function numberQuestion(
  id: string,
  subject: Subject,
  kind: QuestionKind,
  topic: string,
  prompt: string,
  correct: number,
  explain: string,
  difficulty: 1 | 2 | 3,
): Question {
  return fixedQuestion({
    id,
    subject,
    kind,
    topic,
    prompt,
    correct: String(correct),
    distractors: numberDistractors(correct),
    explain,
    difficulty,
  });
}

function buildKindergartenMath(): Question[] {
  const questions: Question[] = [];
  for (let number = 0; number <= 20; number += 1) {
    questions.push(
      numberQuestion(
        `elk-next-${String(number).padStart(2, '0')}`,
        'math',
        'math_achievement',
        'Number order · What comes next',
        `What number comes right after ${number}?`,
        number + 1,
        `Count forward one step from ${number}. The next number is ${number + 1}.`,
        1,
      ),
    );
  }
  for (let number = 1; number <= 20; number += 1) {
    questions.push(
      numberQuestion(
        `elk-before-${String(number).padStart(2, '0')}`,
        'math',
        'math_achievement',
        'Number order · What comes before',
        `What number comes right before ${number}?`,
        number - 1,
        `Count back one step from ${number}. The number before it is ${number - 1}.`,
        number <= 10 ? 1 : 2,
      ),
    );
  }
  for (let first = 0; first <= 5; first += 1) {
    for (let second = 0; second <= 5; second += 1) {
      const total = first + second;
      questions.push(
        numberQuestion(
          `elk-add-${first}-${second}`,
          'math',
          'math_achievement',
          'Addition facts · Within ten',
          `What is ${first} plus ${second}?`,
          total,
          `Start with ${first} and count ${second} more. That makes ${total}.`,
          total <= 5 ? 1 : 2,
        ),
      );
    }
  }
  for (let total = 1; total <= 10; total += 1) {
    for (let take = 0; take <= Math.min(total, 5); take += 1) {
      const left = total - take;
      questions.push(
        numberQuestion(
          `elk-sub-${total}-${take}`,
          'math',
          'math_achievement',
          'Subtraction facts · Within ten',
          `You have ${total}. Take away ${take}. How many are left?`,
          left,
          `${total} take away ${take} leaves ${left}.`,
          total <= 5 ? 1 : 2,
        ),
      );
    }
  }
  for (let smaller = 0; smaller <= 9; smaller += 1) {
    for (let larger = smaller + 1; larger <= Math.min(10, smaller + 3); larger += 1) {
      questions.push(
        numberQuestion(
          `elk-more-${smaller}-${larger}`,
          'quantitative',
          'quant_reasoning',
          'Compare numbers · More and fewer',
          `Which number is more: ${smaller} or ${larger}?`,
          larger,
          `${larger} is farther along when we count, so it is more than ${smaller}.`,
          1,
        ),
      );
    }
  }
  for (let start = 0; start <= 17; start += 1) {
    questions.push(
      numberQuestion(
        `elk-missing-${String(start).padStart(2, '0')}`,
        'quantitative',
        'quant_reasoning',
        'Counting patterns · Missing number',
        `What number is missing? ${start}, ${start + 1}, blank, ${start + 3}`,
        start + 2,
        `The numbers count up by one: ${start}, ${start + 1}, ${start + 2}, ${start + 3}.`,
        start < 9 ? 1 : 2,
      ),
    );
  }
  return questions;
}

const RHYME_GROUPS = [
  ['cat', 'hat', 'bat', 'mat'],
  ['dog', 'log', 'frog', 'hog'],
  ['sun', 'fun', 'run', 'bun'],
  ['pig', 'wig', 'dig', 'fig'],
  ['hen', 'pen', 'ten', 'den'],
  ['bed', 'red', 'sled', 'fed'],
  ['car', 'star', 'jar', 'far'],
  ['moon', 'spoon', 'tune', 'June'],
  ['ball', 'tall', 'wall', 'fall'],
  ['fish', 'dish', 'wish', 'swish'],
] as const;

const FIRST_SOUND_GROUPS = [
  ['ball', 'bat', 'bear', 'bell'],
  ['cat', 'cow', 'cup', 'cap'],
  ['dog', 'duck', 'doll', 'desk'],
  ['fish', 'fox', 'frog', 'fan'],
  ['hat', 'hen', 'horse', 'house'],
  ['kite', 'key', 'king', 'kid'],
  ['map', 'mud', 'milk', 'moon'],
  ['pig', 'pen', 'pot', 'pan'],
  ['rat', 'run', 'rug', 'rain'],
  ['sun', 'sock', 'soap', 'seed'],
] as const;

const OPPOSITES = [
  ['big', 'small'],
  ['hot', 'cold'],
  ['up', 'down'],
  ['fast', 'slow'],
  ['day', 'night'],
  ['happy', 'sad'],
  ['open', 'closed'],
  ['full', 'empty'],
  ['inside', 'outside'],
  ['wet', 'dry'],
  ['light', 'dark'],
  ['loud', 'quiet'],
  ['hard', 'soft'],
  ['tall', 'short'],
  ['near', 'far'],
  ['start', 'finish'],
  ['push', 'pull'],
  ['same', 'different'],
  ['more', 'less'],
  ['above', 'below'],
] as const;

function buildKindergartenLanguage(): Question[] {
  const questions: Question[] = [];
  const allRhymes = RHYME_GROUPS.flat();
  RHYME_GROUPS.forEach((group, groupIndex) => {
    group.forEach((word, wordIndex) => {
      const correct = group[(wordIndex + 1) % group.length];
      questions.push(
        fixedQuestion({
          id: `elk-rhyme-${groupIndex}-${wordIndex}`,
          subject: 'verbal',
          kind: 'synonym',
          topic: 'Language · Rhyming words',
          prompt: `Which word rhymes with ${word}?`,
          correct,
          distractors: [
            allRhymes[((groupIndex + 1) * 4) % allRhymes.length],
            allRhymes[((groupIndex + 3) * 4) % allRhymes.length],
            allRhymes[((groupIndex + 6) * 4) % allRhymes.length],
          ],
          explain: `${word} and ${correct} rhyme because their ending sounds match.`,
          difficulty: 1,
        }),
      );
    });
  });
  const allFirstSounds = FIRST_SOUND_GROUPS.flat();
  FIRST_SOUND_GROUPS.forEach((group, groupIndex) => {
    group.forEach((word, wordIndex) => {
      const correct = group[(wordIndex + 1) % group.length];
      questions.push(
        fixedQuestion({
          id: `elk-sound-${groupIndex}-${wordIndex}`,
          subject: 'verbal',
          kind: 'synonym',
          topic: 'Language · Beginning sounds',
          prompt: `Which word starts with the same sound as ${word}?`,
          correct,
          distractors: [
            allFirstSounds[((groupIndex + 2) * 4) % allFirstSounds.length],
            allFirstSounds[((groupIndex + 5) * 4) % allFirstSounds.length],
            allFirstSounds[((groupIndex + 8) * 4) % allFirstSounds.length],
          ],
          explain: `${word} and ${correct} begin with the same sound.`,
          difficulty: 1,
        }),
      );
    });
  });
  OPPOSITES.forEach((pair, pairIndex) => {
    const [word, correct] = pair;
    const distractors = [1, 4, 7].map(
      (jump) => OPPOSITES[(pairIndex + jump) % OPPOSITES.length][1],
    );
    questions.push(
      fixedQuestion({
        id: `elk-opposite-${String(pairIndex).padStart(2, '0')}`,
        subject: 'verbal',
        kind: 'sentence_completion',
        topic: 'Language · Opposites',
        prompt: `Which word means the opposite of ${word}?`,
        correct,
        distractors,
        explain: `${correct} is the opposite of ${word}.`,
        difficulty: pairIndex < 10 ? 1 : 2,
      }),
    );
  });
  return questions;
}

type StemFact = readonly [
  minimumGrade: 0 | 1 | 2 | 3,
  theme: string,
  prompt: string,
  correct: string,
  distractors: readonly [string, string, string],
  explain: string,
];

const STEM_FACTS: readonly StemFact[] = [
  [0, 'Weather', 'What falls from clouds when water drops get heavy?', 'rain', ['sand', 'smoke', 'leaves'], 'Rain is made of water drops that fall from clouds.'],
  [0, 'Weather', 'Which tool keeps rain off your head?', 'umbrella', ['spoon', 'pillow', 'comb'], 'An umbrella opens above you and helps keep rain off.'],
  [0, 'Weather', 'Which weather feels moving against your skin?', 'wind', ['shadow', 'darkness', 'silence'], 'Wind is moving air, so you can feel it blow.'],
  [0, 'Weather', 'What bright object warms Earth during the day?', 'the Sun', ['the Moon', 'a cloud', 'a starfish'], 'The Sun gives Earth light and warmth during the day.'],
  [0, 'Living things', 'Which one is a living thing?', 'a tree', ['a rock', 'a cup', 'a chair'], 'A tree grows and needs water and light, so it is living.'],
  [0, 'Living things', 'What does a plant need to grow?', 'water', ['plastic', 'paint', 'glass'], 'Plants need water to stay alive and grow.'],
  [0, 'Animals', 'Which animal begins life as a caterpillar?', 'butterfly', ['frog', 'fish', 'puppy'], 'A caterpillar changes into a butterfly.'],
  [0, 'Animals', 'Which body part helps a bird fly?', 'wings', ['fins', 'hooves', 'paws'], 'Birds use their wings to move through the air.'],
  [0, 'Earth and sky', 'Where do fish live?', 'in water', ['in clouds', 'in trees', 'in nests'], 'Fish have bodies made for living in water.'],
  [0, 'Earth and sky', 'When can you usually see the Moon most clearly?', 'at night', ['inside a box', 'under water', 'at lunch'], 'The Moon is usually easiest to see in the darker night sky.'],
  [0, 'Materials', 'Which object is most likely to float in water?', 'a leaf', ['a brick', 'a coin', 'a rock'], 'A light leaf usually stays on the water while heavier solid objects sink.'],
  [0, 'Materials', 'Which material can you see through?', 'clear glass', ['wood', 'stone', 'cardboard'], 'Clear glass lets light pass through, so you can see through it.'],
  [0, 'Forces', 'What happens when you push a toy car?', 'it moves away', ['it becomes food', 'it turns into water', 'it grows'], 'A push is a force that can make an object move away.'],
  [0, 'Senses', 'Which sense do you use to hear music?', 'hearing', ['taste', 'smell', 'touch'], 'Your ears give you the sense of hearing.'],
  [0, 'Senses', 'Which body part helps you smell a flower?', 'nose', ['knee', 'elbow', 'foot'], 'Your nose detects smells in the air.'],
  [0, 'Engineering', 'Which shape makes a strong wheel?', 'circle', ['triangle', 'square', 'star'], 'A circle rolls smoothly because it has no corners.'],
  [1, 'Weather', 'What is frozen rain that falls as soft flakes?', 'snow', ['fog', 'dew', 'steam'], 'Snow forms from frozen water crystals in clouds.'],
  [1, 'Weather', 'What should you do first when you hear thunder outside?', 'go indoors', ['stand under a tree', 'hold a metal pole', 'stay in a pool'], 'A sturdy building is a safer place during a thunderstorm.'],
  [1, 'Weather', 'Which tool measures how warm or cold the air is?', 'thermometer', ['ruler', 'clock', 'magnifying glass'], 'A thermometer measures temperature.'],
  [1, 'Weather', 'Fog is a cloud that forms where?', 'near the ground', ['inside the Sun', 'under the ocean floor', 'inside a rock'], 'Fog is made of tiny water drops floating close to the ground.'],
  [1, 'Plants', 'Which part of a plant takes in water from soil?', 'roots', ['flowers', 'fruit', 'petals'], 'Roots absorb water and help hold the plant in place.'],
  [1, 'Animals', 'Why do many birds build nests?', 'to protect eggs and chicks', ['to grow leaves', 'to store rainbows', 'to make sunlight'], 'A nest gives eggs and young birds a protected place.'],
  [1, 'Light and sound', 'What makes a shadow?', 'light being blocked', ['sound getting louder', 'water freezing', 'air moving'], 'A shadow forms when an object blocks light.'],
  [1, 'Engineering', 'Why does a ramp help move a heavy box upward?', 'it spreads the lift over a longer distance', ['it removes the box’s weight', 'it turns the box into air', 'it stops gravity'], 'A ramp is a simple machine that lets you lift gradually over a longer path.'],
  [2, 'Weather', 'What is a weather forecast?', 'a prediction of future weather', ['a map of every road', 'a list of birthdays', 'a record of old books'], 'A forecast uses weather observations to predict what may happen next.'],
  [2, 'Weather', 'Which instrument measures rainfall?', 'rain gauge', ['compass', 'balance', 'stopwatch'], 'A rain gauge collects and measures fallen rain.'],
  [2, 'Weather', 'Why do dark clouds sometimes bring rain?', 'they hold many water droplets', ['they are made of smoke', 'they pull water from rivers with ropes', 'they block gravity'], 'Cloud droplets join and fall when they become heavy enough.'],
  [2, 'Weather', 'What powers the water cycle?', 'energy from the Sun', ['light from streetlamps', 'sound from thunder', 'rocks underground'], 'Sunlight warms water and drives evaporation in the water cycle.'],
  [2, 'Life science', 'Which animal has a backbone?', 'frog', ['worm', 'jellyfish', 'octopus'], 'A frog is a vertebrate, which means it has a backbone.'],
  [2, 'Life science', 'What do bees move from flower to flower?', 'pollen', ['pebbles', 'feathers', 'snow'], 'Bees carry pollen, helping flowering plants make seeds.'],
  [2, 'Matter', 'What happens to an ice cube in a warm room?', 'it melts into liquid water', ['it becomes wood', 'it turns into sand', 'it grows roots'], 'Heat changes solid ice into liquid water.'],
  [2, 'Engineering', 'Why do builders test a bridge model?', 'to find weak spots before building', ['to change its color', 'to make it invisible', 'to stop measuring'], 'Testing helps engineers discover and improve weak parts of a design.'],
  [3, 'Weather', 'What causes most wind?', 'uneven heating of Earth’s surface', ['the Moon blinking', 'trees waving their branches', 'ocean fish swimming'], 'Uneven heating creates air-pressure differences that make air move.'],
  [3, 'Weather', 'What does a barometer measure?', 'air pressure', ['rainfall', 'wind direction', 'ground temperature'], 'A barometer measures the pressure of the air.'],
  [3, 'Weather', 'Why can warm air hold more water vapor than cold air?', 'its faster-moving particles leave more room for vapor', ['warm air has no particles', 'cold air destroys water', 'warm air is always heavier'], 'Warmer air has faster-moving particles and can contain more water vapor before condensation.'],
  [3, 'Earth science', 'What process slowly breaks rock into smaller pieces?', 'weathering', ['pollination', 'migration', 'germination'], 'Weathering breaks rock down through water, wind, temperature changes, and living things.'],
  [3, 'Life science', 'What job do decomposers perform in an ecosystem?', 'break down dead material', ['make sunlight', 'stop all plant growth', 'remove oxygen'], 'Decomposers return nutrients from dead material to the ecosystem.'],
  [3, 'Forces', 'Why does a bicycle slow down when you stop pedaling?', 'friction and air resistance', ['gravity disappears', 'the wheels lose their shape', 'the road moves backward'], 'Friction and air resistance act against the bicycle’s motion.'],
  [3, 'Technology', 'What is an algorithm?', 'a step-by-step set of instructions', ['a type of battery', 'a weather cloud', 'a metal tool'], 'An algorithm is an ordered set of steps for solving a problem or completing a task.'],
  [3, 'Engineering', 'Why are triangles often used in bridges?', 'they hold their shape under force', ['they are always lighter than air', 'they remove gravity', 'they cannot touch other shapes'], 'A triangle is rigid, so triangular supports help spread forces through a structure.'],
] as const;

function stemQuestionsForGrade(maximumGrade: 0 | 1 | 2 | 3): Question[] {
  return STEM_FACTS.flatMap((fact, index) => {
    const [minimumGrade, theme, prompt, correct, distractors, explain] = fact;
    if (minimumGrade > maximumGrade) return [];
    return [
      fixedQuestion({
        id: `el-stem-${String(index + 1).padStart(3, '0')}`,
        subject: 'reading',
        kind: 'sentence_completion',
        topic: `STEM · ${theme}`,
        prompt,
        correct,
        distractors: [...distractors],
        explain,
        difficulty: minimumGrade <= 1 ? 1 : minimumGrade === 2 ? 2 : 3,
      }),
    ];
  });
}

function buildFirstGradeMath(): Question[] {
  const questions: Question[] = [];
  for (let first = 0; first <= 10; first += 1) {
    for (let second = first; second <= 10; second += 1) {
      const total = first + second;
      questions.push(
        numberQuestion(
          `el1-add-${first}-${second}`,
          'math',
          'math_achievement',
          'Addition fluency · Within twenty',
          `What is ${first} plus ${second}?`,
          total,
          `${first} plus ${second} equals ${total}.`,
          total <= 10 ? 1 : 2,
        ),
      );
    }
  }
  for (let total = 10; total <= 20; total += 1) {
    for (let take = 0; take <= 10; take += 1) {
      if ((total + take) % 2 !== 0) continue;
      const left = total - take;
      questions.push(
        numberQuestion(
          `el1-sub-${total}-${take}`,
          'math',
          'math_achievement',
          'Subtraction fluency · Within twenty',
          `What is ${total} minus ${take}?`,
          left,
          `${total} take away ${take} leaves ${left}.`,
          left >= 0 && total <= 15 ? 1 : 2,
        ),
      );
    }
  }
  for (let number = 10; number <= 97; number += 3) {
    const tens = Math.floor(number / 10);
    const ones = number % 10;
    questions.push(
      numberQuestion(
        `el1-place-${number}`,
        'quantitative',
        'quant_reasoning',
        'Place value · Tens and ones',
        `${tens} tens and ${ones} ones make what number?`,
        number,
        `${tens} tens are ${tens * 10}. Add ${ones} ones to make ${number}.`,
        number < 50 ? 1 : 2,
      ),
    );
  }
  for (let hour = 1; hour <= 12; hour += 1) {
    questions.push(
      fixedQuestion({
        id: `el1-time-hour-${hour}`,
        subject: 'math',
        kind: 'math_achievement',
        topic: 'Time · Hours',
        prompt: `The hour hand points to ${hour} and the minute hand points to 12. What time is it?`,
        correct: `${hour}:00`,
        distractors: [`${hour}:30`, `${hour === 12 ? 1 : hour + 1}:00`, `${hour}:15`],
        explain: `When the minute hand points to 12, it is exactly ${hour}:00.`,
        difficulty: 1,
      }),
      fixedQuestion({
        id: `el1-time-half-${hour}`,
        subject: 'math',
        kind: 'math_achievement',
        topic: 'Time · Half hours',
        prompt: `The hour is ${hour} and thirty minutes have passed. What time is it?`,
        correct: `${hour}:30`,
        distractors: [`${hour}:00`, `${hour}:15`, `${hour}:45`],
        explain: `Thirty minutes after ${hour}:00 is ${hour}:30.`,
        difficulty: 2,
      }),
    );
  }
  for (let smaller = 11; smaller <= 30; smaller += 1) {
    const larger = smaller + 7;
    questions.push(
      numberQuestion(
        `el1-compare-${smaller}`,
        'quantitative',
        'quant_reasoning',
        'Compare two-digit numbers',
        `Which number is greater: ${smaller} or ${larger}?`,
        larger,
        `${larger} has the greater value, so it is greater than ${smaller}.`,
        2,
      ),
    );
  }
  return questions;
}

function buildSecondGradeMath(): Question[] {
  const questions: Question[] = [];
  for (let first = 10; first <= 46; first += 4) {
    for (let second = 10; second <= 37; second += 3) {
      const total = first + second;
      questions.push(
        numberQuestion(
          `el2-add-${first}-${second}`,
          'math',
          'math_achievement',
          'Two-digit addition · Fluency',
          `What is ${first} plus ${second}?`,
          total,
          `Add tens and ones: ${first} + ${second} = ${total}.`,
          total < 70 ? 1 : 2,
        ),
      );
    }
  }
  for (let total = 30; total <= 75; total += 5) {
    for (let take = 10; take <= 25; take += 3) {
      const left = total - take;
      questions.push(
        numberQuestion(
          `el2-sub-${total}-${take}`,
          'math',
          'math_achievement',
          'Two-digit subtraction · Fluency',
          `What is ${total} minus ${take}?`,
          left,
          `Subtract ${take} from ${total}. The difference is ${left}.`,
          take % 5 === 0 ? 1 : 2,
        ),
      );
    }
  }
  for (const factor of [2, 5, 10]) {
    for (let groups = 1; groups <= 10; groups += 1) {
      const product = factor * groups;
      questions.push(
        numberQuestion(
          `el2-multiply-${factor}-${groups}`,
          'math',
          'math_achievement',
          'Equal groups · Early multiplication',
          `${groups} groups have ${factor} in each group. How many altogether?`,
          product,
          `${groups} groups of ${factor} make ${groups} times ${factor}, which is ${product}.`,
          factor === 10 ? 1 : 2,
        ),
      );
    }
  }
  for (let number = 105; number <= 960; number += 45) {
    const hundreds = Math.floor(number / 100);
    questions.push(
      numberQuestion(
        `el2-hundreds-${number}`,
        'quantitative',
        'quant_reasoning',
        'Place value · Hundreds',
        `What digit is in the hundreds place in ${number}?`,
        hundreds,
        `In ${number}, the hundreds digit is ${hundreds}.`,
        2,
      ),
    );
  }
  return questions;
}

const GRADE_2_LANGUAGE = [
  ['Birds ___ nests for their eggs.', 'build', ['sleep', 'blue', 'quietly'], 'Build is the action word that completes the sentence.'],
  ['The puppy is very ___.', 'playful', ['play', 'quickly', 'yard'], 'Playful describes the puppy, so it is an adjective.'],
  ['Maya ___ to school yesterday.', 'walked', ['walk', 'walking', 'walks'], 'Yesterday signals past time, so walked is correct.'],
  ['Two boxes are called two ___.', 'boxes', ['boxs', 'boxies', 'box'], 'Words ending in x usually add es to become plural.'],
  ['“Cannot” can be shortened to which contraction?', 'can’t', ['cant', 'cann’t', 'can not’t'], 'Can’t joins can and not with an apostrophe.'],
  ['Which word is a noun?', 'garden', ['jump', 'bright', 'slowly'], 'A garden is a place, so it is a noun.'],
  ['Which word is a verb?', 'whisper', ['blanket', 'purple', 'gentle'], 'Whisper names an action, so it is a verb.'],
  ['Which word is an adjective?', 'shiny', ['river', 'splash', 'softly'], 'Shiny describes how something looks.'],
  ['Which word is an adverb?', 'carefully', ['careful', 'care', 'car'], 'Carefully tells how an action is done.'],
  ['The children ___ ready for recess.', 'are', ['is', 'am', 'be'], 'The plural subject children pairs with are.'],
  ['The cat washed ___ paws.', 'its', ['it’s', 'its’', 'it'], 'Its shows that the paws belong to the cat.'],
  ['Which sentence uses a question mark?', 'Where is my hat?', ['My hat is blue.', 'Put on your hat!', 'I found my hat.'], 'A direct question ends with a question mark.'],
  ['Which word means almost the same as tiny?', 'small', ['huge', 'loud', 'late'], 'Tiny and small both describe something little.'],
  ['Which word means almost the same as joyful?', 'happy', ['angry', 'empty', 'rough'], 'Joyful and happy have nearly the same meaning.'],
  ['Which word means the opposite of arrive?', 'leave', ['enter', 'reach', 'come'], 'To leave is the opposite of arriving.'],
  ['Which word means the opposite of ancient?', 'modern', ['old', 'past', 'historic'], 'Modern describes something current rather than ancient.'],
  ['Which word has a long A sound?', 'cake', ['cat', 'cap', 'can'], 'The silent e in cake helps the a say its name.'],
  ['Which word has a long I sound?', 'kite', ['kit', 'sit', 'pin'], 'The silent e in kite helps the i say its name.'],
  ['Which word has two syllables?', 'rabbit', ['cat', 'frog', 'bird'], 'Rabbit has two beats: rab-bit.'],
  ['Which word has three syllables?', 'butterfly', ['bee', 'spider', 'ant'], 'Butterfly has three beats: but-ter-fly.'],
  ['Which word is a compound word?', 'sunflower', ['yellow', 'garden', 'pretty'], 'Sunflower joins the words sun and flower.'],
  ['Which word is a compound word?', 'raincoat', ['jacket', 'stormy', 'puddle'], 'Raincoat joins the words rain and coat.'],
  ['What is the base word in replay?', 'play', ['ray', 'rep', 'lay'], 'The prefix re- is added to the base word play.'],
  ['What is the base word in helpful?', 'help', ['full', 'he', 'elf'], 'The suffix -ful is added to the base word help.'],
] as const;

function buildSecondGradeLanguage(): Question[] {
  return GRADE_2_LANGUAGE.map((entry, index) =>
    fixedQuestion({
      id: `el2-language-${String(index + 1).padStart(2, '0')}`,
      subject: 'verbal',
      kind: 'sentence_completion',
      topic: 'Language · Grammar, word meaning, and phonics',
      prompt: entry[0],
      correct: entry[1],
      distractors: [...entry[2]],
      explain: entry[3],
      difficulty: index < 12 ? 1 : 2,
    }),
  );
}

function buildThirdGradeMath(): Question[] {
  const questions: Question[] = [];
  for (let first = 2; first <= 12; first += 1) {
    for (let second = 1; second <= 12; second += 1) {
      const product = first * second;
      questions.push(
        numberQuestion(
          `el3-multiply-${first}-${second}`,
          'math',
          'math_achievement',
          'Multiplication fluency · Facts through twelve',
          `What is ${first} times ${second}?`,
          product,
          `${first} groups of ${second} make ${product}.`,
          first <= 5 || second <= 5 ? 1 : 2,
        ),
      );
    }
  }
  for (let divisor = 2; divisor <= 12; divisor += 1) {
    for (let quotient = 2; quotient <= 10; quotient += 1) {
      if ((divisor + quotient) % 2 !== 0) continue;
      const dividend = divisor * quotient;
      questions.push(
        numberQuestion(
          `el3-divide-${divisor}-${quotient}`,
          'math',
          'math_achievement',
          'Division fluency · Equal groups',
          `What is ${dividend} divided by ${divisor}?`,
          quotient,
          `${dividend} can be split into ${divisor} equal groups of ${quotient}.`,
          divisor <= 5 ? 1 : 2,
        ),
      );
    }
  }
  for (let number = 12; number <= 98; number += 2) {
    const rounded = Math.round(number / 10) * 10;
    questions.push(
      numberQuestion(
        `el3-round-${number}`,
        'quantitative',
        'quant_reasoning',
        'Rounding · Nearest ten',
        `Round ${number} to the nearest ten.`,
        rounded,
        `The ones digit is ${number % 10}, so ${number} rounds to ${rounded}.`,
        2,
      ),
    );
  }
  for (const denominator of [2, 3, 4, 5, 6, 8]) {
    for (let numerator = 1; numerator < denominator; numerator += 1) {
      questions.push(
        fixedQuestion({
          id: `el3-fraction-${numerator}-${denominator}`,
          subject: 'math',
          kind: 'math_achievement',
          topic: 'Fractions · Parts of a whole',
          prompt: `A whole is split into ${denominator} equal parts. ${numerator} parts are shaded. What fraction is shaded?`,
          correct: `${numerator}/${denominator}`,
          distractors: [
            `${denominator}/${numerator}`,
            `${numerator}/${denominator + 1}`,
            `${Math.min(numerator + 1, denominator)}/${denominator}`,
          ],
          explain: `The denominator ${denominator} counts all equal parts, and the numerator ${numerator} counts the shaded parts.`,
          difficulty: denominator <= 4 ? 1 : 2,
        }),
      );
    }
  }
  return questions;
}

const GRADE_3_LANGUAGE = [
  ['Which sentence has correct subject-verb agreement?', 'The dogs bark at squirrels.', ['The dogs barks at squirrels.', 'The dog bark at squirrels.', 'The dogs barking at squirrels.'], 'The plural subject dogs pairs with the plural verb bark.'],
  ['Which word is the subject in “The bright comet crossed the sky”?', 'comet', ['bright', 'crossed', 'sky'], 'The comet is what the sentence is about.'],
  ['Which word is the verb in “The bright comet crossed the sky”?', 'crossed', ['bright', 'comet', 'sky'], 'Crossed tells what the comet did.'],
  ['Which word is an adjective in “The noisy geese landed nearby”?', 'noisy', ['geese', 'landed', 'nearby'], 'Noisy describes the geese.'],
  ['Which word is an adverb in “The turtle moved slowly”?', 'slowly', ['turtle', 'moved', 'the'], 'Slowly tells how the turtle moved.'],
  ['Which sentence uses commas correctly?', 'We packed apples, crackers, and juice.', ['We packed, apples crackers and juice.', 'We packed apples crackers, and juice.', 'We, packed apples crackers and juice.'], 'Commas separate the three items in the list.'],
  ['Which sentence shows possession correctly?', 'The fox’s den was hidden.', ['The foxs den was hidden.', 'The foxs’ den was hidden.', 'The fox’es den was hidden.'], 'Fox’s shows that one fox owns the den.'],
  ['What does the prefix re- mean in rebuild?', 'again', ['not', 'before', 'under'], 'To rebuild means to build again.'],
  ['What does the prefix un- mean in unsafe?', 'not', ['again', 'full of', 'after'], 'Unsafe means not safe.'],
  ['What does the suffix -less mean in fearless?', 'without', ['full of', 'before', 'again'], 'Fearless means without fear.'],
  ['What does the suffix -ful mean in helpful?', 'full of', ['without', 'not', 'under'], 'Helpful describes someone full of help or ready to help.'],
  ['Which word is a synonym for enormous?', 'huge', ['tiny', 'quiet', 'narrow'], 'Enormous and huge both mean very large.'],
  ['Which word is a synonym for rapid?', 'fast', ['slow', 'late', 'calm'], 'Rapid and fast both describe quick movement.'],
  ['Which word is an antonym for scarce?', 'plentiful', ['rare', 'few', 'limited'], 'Plentiful means there is a lot, the opposite of scarce.'],
  ['Which word is an antonym for fragile?', 'sturdy', ['delicate', 'breakable', 'weak'], 'Sturdy describes something strong rather than fragile.'],
  ['Which transition best shows a result?', 'therefore', ['meanwhile', 'first', 'nearby'], 'Therefore signals that one idea is the result of another.'],
  ['Which transition best shows contrast?', 'however', ['also', 'because', 'finally'], 'However signals a difference or contrast.'],
  ['Which sentence is written in past tense?', 'The team practiced yesterday.', ['The team practices today.', 'The team will practice tomorrow.', 'The team is practicing now.'], 'Practiced tells about an action that already happened.'],
  ['Which sentence is written in future tense?', 'We will visit the museum.', ['We visited the museum.', 'We visit the museum.', 'We are at the museum.'], 'Will visit tells about an action that has not happened yet.'],
  ['Which word best completes the sentence: “The evidence was ___, so we changed our conclusion”?', 'convincing', ['sleepy', 'purple', 'distant'], 'Convincing evidence gives a strong reason to believe something.'],
] as const;

function buildThirdGradeLanguage(): Question[] {
  return GRADE_3_LANGUAGE.map((entry, index) =>
    fixedQuestion({
      id: `el3-language-${String(index + 1).padStart(2, '0')}`,
      subject: 'verbal',
      kind: 'sentence_completion',
      topic: 'Language · Grammar and word study',
      prompt: entry[0],
      correct: entry[1],
      distractors: [...entry[2]],
      explain: entry[3],
      difficulty: index < 10 ? 1 : 2,
    }),
  );
}

const KINDERGARTEN_LANGUAGE = buildKindergartenLanguage();

export const ELEMENTARY_EXPANSION: Record<ElementaryBand, Question[]> = {
  k: [
    ...buildKindergartenMath(),
    ...KINDERGARTEN_LANGUAGE,
    ...stemQuestionsForGrade(0),
  ],
  grade1: [
    ...buildFirstGradeMath(),
    ...KINDERGARTEN_LANGUAGE,
    ...stemQuestionsForGrade(1),
  ],
  grade2: [
    ...buildSecondGradeMath(),
    ...buildSecondGradeLanguage(),
    ...stemQuestionsForGrade(2),
  ],
  grade3: [
    ...buildThirdGradeMath(),
    ...buildThirdGradeLanguage(),
    ...stemQuestionsForGrade(3),
  ],
};

