import type { Question } from './types';

export type FigurativeGrade =
  | 'k'
  | 'grade1'
  | 'grade2'
  | 'grade3'
  | 'grade4'
  | 'grade5'
  | 'grade6'
  | 'grade7'
  | 'grade8';

const GRADE_NUMBER: Record<FigurativeGrade, number> = {
  k: 0,
  grade1: 1,
  grade2: 2,
  grade3: 3,
  grade4: 4,
  grade5: 5,
  grade6: 6,
  grade7: 7,
  grade8: 8,
};

type IdiomEntry = readonly [
  phrase: string,
  meaning: string,
  literalPicture: string,
  example: string,
  minimumGrade: number,
];

/**
 * Familiar idioms with established meanings and natural, child-safe contexts.
 *
 * Item design follows CCSS L.3.4.a/L.3.5.a: the sentence is part of the
 * question, because children should use context to distinguish literal from
 * nonliteral meaning. ReadWriteThink's grades 3-5 guidance likewise asks
 * students to interpret and use idioms in sentences. Distractors are drawn
 * from the same semantic neighborhood or are hand-authored misconceptions;
 * unrelated joke answers are not allowed.
 */
const IDIOMS: readonly IdiomEntry[] = [
  ['piece of cake', 'something very easy to do', 'a slice of dessert', 'After practicing, the spelling quiz was a piece of cake.', 1],
  ['hold your horses', 'wait and be patient', 'holding several horses still', 'Hold your horses—we need to read the directions first.', 1],
  ['under the weather', 'feeling sick or unwell', 'standing beneath rain clouds', 'Mia stayed home because she felt under the weather.', 1],
  ['all ears', 'giving someone your full attention', 'a person made only of ears', 'Tell me about the game—I am all ears.', 1],
  ['in a pickle', 'in a difficult situation', 'sitting inside a pickle jar', 'I was in a pickle when I forgot both my lunch and my homework.', 1],
  ['zip your lip', 'stop talking for a moment', 'closing a zipper across your mouth', 'We had to zip our lips when the play began.', 1],
  ['on top of the world', 'feeling extremely happy and successful', 'standing on the planet', 'Jalen felt on top of the world after helping his team win.', 1],
  ['two peas in a pod', 'two people or things that are very alike', 'two peas growing together', 'The twins both love puzzles and are like two peas in a pod.', 1],
  ['butterflies in my stomach', 'a nervous fluttery feeling', 'insects flying inside your body', 'I had butterflies in my stomach before the recital.', 2],
  ['raining cats and dogs', 'rain falling very heavily', 'pets falling from clouds', 'Bring an umbrella—it is raining cats and dogs.', 2],
  ['break the ice', 'help people feel comfortable together', 'cracking frozen water', 'The silly name game helped break the ice.', 3],
  ['hit the books', 'begin working or studying seriously', 'slapping a pile of books', 'I need to hit the books before Friday’s science test.', 3],
  ['spill the beans', 'reveal information that was supposed to be secret', 'pour beans onto the floor', 'Do not spill the beans about the surprise party.', 3],
  ['let the cat out of the bag', 'accidentally reveal a secret or surprise', 'release a cat from a sack', 'Owen let the cat out of the bag when he mentioned the gift.', 3],
  ['once in a blue moon', 'happening very rarely or almost never', 'waiting for the Moon to turn blue', 'We eat breakfast for dinner once in a blue moon.', 3],
  ['call it a day', 'stop working on something for now', 'give the day a name', 'We finished the model and decided to call it a day.', 3],
  ['the ball is in your court', 'it is your turn to decide or act', 'a ball resting on one side of a court', 'I shared my idea; now the ball is in your court.', 3],
  ['pulling your leg', 'joking with or playfully teasing someone', 'tugging on someone’s leg', 'I did not really meet an alien—I was pulling your leg.', 3],
  ['sit tight', 'wait patiently where you are', 'sit with your muscles squeezed', 'Sit tight while I find the missing page.', 3],
  ['out of the blue', 'happening suddenly and without warning', 'coming out of the color blue', 'A rainbow appeared out of the blue after the storm.', 3],
  ['keep your chin up', 'stay hopeful when something is difficult', 'hold your chin high', 'Keep your chin up; one mistake does not end the game.', 3],
  ['fish out of water', 'someone uncomfortable in an unfamiliar place', 'a fish lying on land', 'At my first chess club meeting, I felt like a fish out of water.', 3],
  ['hit the nail on the head', 'describe or solve something exactly', 'strike a nail in the correct spot', 'You hit the nail on the head when you found the loose wire.', 3],
  ['cost an arm and a leg', 'cost far too much', 'pay with parts of your body', 'That enormous television costs an arm and a leg.', 4],
  ['barking up the wrong tree', 'following the wrong idea or blaming the wrong person', 'a dog barking at an empty tree', 'If you think I hid the keys, you are barking up the wrong tree.', 4],
  ['on the same page', 'sharing the same understanding or plan', 'reading one page together', 'Let us review the rules so we are all on the same page.', 4],
  ['beat around the bush', 'avoid saying something directly', 'strike the ground around a shrub', 'Stop beating around the bush and tell me what happened.', 4],
  ['go the extra mile', 'make more effort than expected', 'travel one additional mile', 'Nora went the extra mile and labeled every part of the model.', 4],
  ['in hot water', 'facing consequences for doing something wrong', 'standing in heated water', 'I was in hot water after ignoring the library rules.', 4],
  ['miss the boat', 'miss an opportunity', 'arrive after a boat leaves', 'Sign up today so you do not miss the boat.', 4],
  ['up in the air', 'not decided yet', 'floating above the ground', 'Our weekend plans are still up in the air.', 4],
  ['back to square one', 'start again from the beginning', 'return to the first square on a board', 'The bridge collapsed, so our design went back to square one.', 4],
  ['bite off more than you can chew', 'take on more work than you can manage', 'put too much food in your mouth', 'I bit off more than I could chew by joining four clubs.', 4],
  ['by the skin of your teeth', 'only just barely', 'use the nonexistent skin on teeth', 'We caught the bus by the skin of our teeth.', 4],
  ['cry over spilled milk', 'stay upset about something that cannot be changed', 'weep because milk tipped over', 'The page tore, but there is no use crying over spilled milk.', 4],
  ['get your ducks in a row', 'organize everything before starting', 'line up a group of ducks', 'Get your ducks in a row before beginning the experiment.', 4],
  ['leave no stone unturned', 'search everywhere or try every possibility', 'turn over every rock', 'We left no stone unturned while looking for the missing earring.', 4],
  ['not my cup of tea', 'not something I enjoy', 'a drink that belongs to someone else', 'Scary movies are not my cup of tea.', 4],
  ['read between the lines', 'find a meaning that is suggested but not stated', 'read blank spaces between printed lines', 'Read between the lines to understand why the character left.', 4],
  ['steal someone’s thunder', 'take attention or credit from someone else', 'carry away the sound of a storm', 'Announcing my news first would steal my sister’s thunder.', 5],
  ['tip of the iceberg', 'a small visible part of a much larger issue', 'the small top of floating ice', 'The cracked tile was only the tip of the iceberg.', 5],
  ['wild-goose chase', 'a pointless search that is unlikely to succeed', 'chasing a goose through fields', 'The false clue sent us on a wild-goose chase.', 5],
  ['wear your heart on your sleeve', 'show your feelings openly', 'attach a heart to your clothing', 'Leo wears his heart on his sleeve, so everyone knew he was disappointed.', 5],
  ['water under the bridge', 'a past problem that no longer matters', 'water flowing below a bridge', 'We settled the argument, and now it is water under the bridge.', 5],
  ['elephant in the room', 'an obvious problem that everyone avoids discussing', 'an elephant standing indoors', 'The broken window was the elephant in the room.', 5],
  ['needle in a haystack', 'something extremely difficult to find', 'a needle hidden in dried grass', 'Finding one typo in that huge file was like finding a needle in a haystack.', 5],
  ['apple of my eye', 'a person who is deeply loved or treasured', 'an apple inside an eye', 'The proud grandfather said his granddaughter was the apple of his eye.', 5],
  ['best of both worlds', 'the advantages of two different choices at once', 'owning two separate worlds', 'The hybrid class gave us the best of both worlds.', 5],
  ['bigger fish to fry', 'more important work to handle', 'cook a larger fish', 'Ignore that tiny scratch; we have bigger fish to fry.', 5],
  ['go back to the drawing board', 'discard a failed plan and design a new one', 'return to a drafting table', 'The robot tipped over, so we went back to the drawing board.', 5],
  ['know the ropes', 'understand how a task or place works', 'recognize different ropes', 'Ask Priya for help because she knows the ropes.', 5],
  ['off the hook', 'freed from blame or responsibility', 'remove something from a fishing hook', 'Once I found the receipt, Dad knew I was off the hook.', 5],
  ['on thin ice', 'close to getting in serious trouble', 'stand on fragile frozen water', 'After two late assignments, he was on thin ice.', 5],
  ['see eye to eye', 'have the same opinion about something', 'look directly into another person’s eyes', 'We do not always see eye to eye, but we listen respectfully.', 5],
  ['face the music', 'accept the consequences of your actions', 'stand facing musicians', 'I had to face the music after breaking the borrowed controller.', 5],
  ['add fuel to the fire', 'make an already bad situation worse', 'put fuel on flames', 'Laughing at the argument only added fuel to the fire.', 6],
  ['burn the midnight oil', 'work or study very late at night', 'burn oil in a lamp at midnight', 'She burned the midnight oil to finish the history project.', 6],
  ['cut corners', 'save effort or money by doing something poorly', 'remove the corners from an object', 'The builder cut corners, so the shelf was not sturdy.', 6],
  ['get cold feet', 'become too nervous to continue', 'have feet that are low in temperature', 'I got cold feet just before the audition.', 6],
  ['jump on the bandwagon', 'join something mainly because it is popular', 'leap onto a wagon carrying a band', 'Everyone jumped on the bandwagon after the dance became trendy.', 6],
  ['take it with a grain of salt', 'remain doubtful instead of believing it completely', 'eat an idea with a tiny piece of salt', 'Take that rumor with a grain of salt until we find evidence.', 6],
  ['through thick and thin', 'during both good and difficult times', 'move through thick and thin materials', 'True friends support one another through thick and thin.', 6],
  ['turn a blind eye', 'pretend not to notice something wrong', 'rotate an eye that cannot see', 'A fair referee cannot turn a blind eye to cheating.', 6],
  ['put all your eggs in one basket', 'risk everything on a single plan', 'place every egg in one container', 'Apply to several programs instead of putting all your eggs in one basket.', 6],
  ['take the bull by the horns', 'deal with a difficult problem directly', 'grab a bull’s horns', 'We took the bull by the horns and repaired the leaking tent.', 6],
  ['throw in the towel', 'give up or admit defeat', 'toss a towel into the air', 'The puzzle was difficult, but I refused to throw in the towel.', 6],
  ['close but no cigar', 'almost successful but not quite', 'stand near something without receiving a cigar', 'Your estimate was close but no cigar.', 6],
  ['a dime a dozen', 'very common and not special', 'twelve items that cost ten cents', 'Cheap plastic souvenirs are a dime a dozen.', 6],
  ['drop of a hat', 'immediately and without much planning', 'wait for a hat to fall', 'Kai will start a soccer game at the drop of a hat.', 7],
  ['keep your cards close to your chest', 'hide your plans or information', 'hold playing cards against your body', 'The negotiator kept her cards close to her chest.', 7],
  ['burn the candle at both ends', 'use too much energy by working early and late', 'light both ends of one candle', 'Training before dawn and studying past midnight burned the candle at both ends.', 7],
  ['straight from the horse’s mouth', 'directly from the original or most reliable source', 'hear words spoken by a horse', 'I confirmed the schedule straight from the coach’s mouth.', 7],
  ['throw caution to the wind', 'act boldly without worrying about risk', 'toss caution into moving air', 'We threw caution to the wind and entered the difficult contest.', 7],
  ['chip on your shoulder', 'a lasting feeling of anger or resentment', 'carry a wood chip on your shoulder', 'He had a chip on his shoulder after being left off the team.', 7],
  ['penny for your thoughts', 'tell me what you are thinking', 'pay one cent to purchase a thought', 'You have been quiet—a penny for your thoughts?', 7],
  ['weather the storm', 'survive a difficult period', 'remain safe during severe weather', 'The small business changed its plan to weather the storm.', 7],
  ['open a can of worms', 'create a complicated set of new problems', 'open a container full of worms', 'Changing one rule opened a can of worms.', 7],
  ['move the goalposts', 'unfairly change the requirements after work has begun', 'carry sports goals to a new location', 'Adding three new conditions moved the goalposts.', 8],
  ['the writing on the wall', 'clear signs that something bad or important is coming', 'words physically written on a wall', 'Empty shelves were the writing on the wall for the struggling shop.', 8],
  ['tilt at windmills', 'fight imaginary problems or impossible battles', 'lean toward wind-powered machines', 'Arguing with a rumor was tilting at windmills.', 8],
  ['pyrrhic victory', 'a win whose heavy cost makes it feel like a loss', 'a historical ruler named Pyrrhus winning', 'Winning the case after spending everything was a pyrrhic victory.', 8],
  ['cross that bridge when we come to it', 'handle a possible problem only if it actually happens', 'wait to cross a physical bridge', 'Do not worry about the final round yet; we will cross that bridge when we come to it.', 8],
];

type IdiomDomain =
  | 'feelings'
  | 'communication'
  | 'work'
  | 'timing'
  | 'trouble'
  | 'value'
  | 'search'
  | 'risk';

const IDIOM_GROUPS: Record<IdiomDomain, readonly string[]> = {
  feelings: [
    'under the weather',
    'on top of the world',
    'two peas in a pod',
    'butterflies in my stomach',
    'keep your chin up',
    'fish out of water',
    'not my cup of tea',
    'wear your heart on your sleeve',
    'apple of my eye',
    'see eye to eye',
    'get cold feet',
    'through thick and thin',
    'chip on your shoulder',
  ],
  communication: [
    'all ears',
    'zip your lip',
    'break the ice',
    'spill the beans',
    'let the cat out of the bag',
    'pulling your leg',
    'on the same page',
    'beat around the bush',
    'read between the lines',
    'steal someone’s thunder',
    'elephant in the room',
    'keep your cards close to your chest',
    'straight from the horse’s mouth',
    'penny for your thoughts',
  ],
  work: [
    'piece of cake',
    'hit the books',
    'call it a day',
    'hit the nail on the head',
    'go the extra mile',
    'back to square one',
    'bite off more than you can chew',
    'get your ducks in a row',
    'leave no stone unturned',
    'go back to the drawing board',
    'know the ropes',
    'burn the midnight oil',
    'cut corners',
    'take the bull by the horns',
    'throw in the towel',
    'burn the candle at both ends',
  ],
  timing: [
    'hold your horses',
    'raining cats and dogs',
    'once in a blue moon',
    'the ball is in your court',
    'sit tight',
    'out of the blue',
    'up in the air',
    'drop of a hat',
    'cross that bridge when we come to it',
  ],
  trouble: [
    'in a pickle',
    'barking up the wrong tree',
    'in hot water',
    'cry over spilled milk',
    'water under the bridge',
    'off the hook',
    'on thin ice',
    'face the music',
    'add fuel to the fire',
    'turn a blind eye',
    'open a can of worms',
  ],
  value: [
    'cost an arm and a leg',
    'miss the boat',
    'best of both worlds',
    'bigger fish to fry',
    'a dime a dozen',
    'pyrrhic victory',
  ],
  search: [
    'by the skin of your teeth',
    'tip of the iceberg',
    'wild-goose chase',
    'needle in a haystack',
    'close but no cigar',
    'the writing on the wall',
    'tilt at windmills',
  ],
  risk: [
    'jump on the bandwagon',
    'take it with a grain of salt',
    'put all your eggs in one basket',
    'throw caution to the wind',
    'weather the storm',
    'move the goalposts',
  ],
};

/**
 * Every distractor reflects a reasonable misreading of its particular context.
 * They are intentionally close enough to require comprehension, while still
 * leaving one defensible best answer.
 */
const IDIOM_DISTRACTORS: Readonly<Record<string, readonly [string, string, string]>> = {
  'piece of cake': [
    'something familiar but still time-consuming',
    'something completed without any help',
    'a reward earned after finishing',
  ],
  'hold your horses': [
    'check whether the plan is allowed',
    'cancel the plan completely',
    'work more quickly before time runs out',
  ],
  'under the weather': [
    'tired after spending time outdoors',
    'worried that a storm is coming',
    'unhappy about missing an activity',
  ],
  'all ears': [
    'ready to ask several questions',
    'trying to remember every detail',
    'surprised by what someone said',
  ],
  'in a pickle': [
    'late and trying to hurry',
    'confused by a set of directions',
    'embarrassed about a small mistake',
  ],
  'zip your lip': [
    'whisper so only one person can hear',
    'keep the information secret forever',
    'think carefully before answering',
  ],
  'on top of the world': [
    'surprised that something good happened',
    'relieved that a hard job is over',
    'certain that you are better than everyone',
  ],
  'two peas in a pod': [
    'two people who enjoy being together',
    'two people who work well as a team',
    'two people who belong to the same family',
  ],
  'butterflies in my stomach': [
    'feeling excited and unable to wait',
    'feeling hungry after missing a meal',
    'feeling sick after moving too quickly',
  ],
  'raining cats and dogs': [
    'a storm began without warning',
    'the rain continued for the whole day',
    'the wind made the rain dangerous',
  ],
  'break the ice': [
    'make people laugh at someone else',
    'end a disagreement between friends',
    'begin the activity before everyone is ready',
  ],
  'hit the books': [
    'find one fact in a book quickly',
    'finish a long reading assignment',
    'practice a new way of taking notes',
  ],
  'spill the beans': [
    'share news before checking whether it is true',
    'admit that you made a mistake',
    'tell everyone exactly what you think',
  ],
  'let the cat out of the bag': [
    'explain a secret on purpose',
    'notice that someone planned a surprise',
    'ruin a plan by arriving too late',
  ],
  'once in a blue moon': [
    'only during the nighttime',
    'only on important or special days',
    'at a time that cannot be predicted',
  ],
  'call it a day': [
    'decide the work is good enough',
    'make a plan for the following day',
    'record the date when the work was finished',
  ],
  'the ball is in your court': [
    'other people agree with your idea',
    'the decision has already been made',
    'you need an adult to give permission',
  ],
  'pulling your leg': [
    'trying to get your attention',
    'telling a story that is difficult to believe',
    'trying to make you change your mind',
  ],
  'sit tight': [
    'stay quiet while other people work',
    'continue working without taking a break',
    'avoid moving because the place is dangerous',
  ],
  'out of the blue': [
    'happening after a long wait',
    'happening exactly as predicted',
    'happening because someone made a mistake',
  ],
  'keep your chin up': [
    'pay close attention to what happens next',
    'show other people that you feel confident',
    'hide the fact that you are disappointed',
  ],
  'fish out of water': [
    'someone who badly misses home',
    'someone who refuses to join the group',
    'someone who is new but eager to participate',
  ],
  'hit the nail on the head': [
    'notice one useful part of a problem',
    'finish a job before anyone else',
    'suggest a solution that might work',
  ],
  'cost an arm and a leg': [
    'require a long time to pay for',
    'be valuable enough to protect carefully',
    'cost more than a similar item',
  ],
  'barking up the wrong tree': [
    'search where an earlier clue was found',
    'accuse someone without hearing their side',
    'keep repeating the same complaint',
  ],
  'on the same page': [
    'have read the same information',
    'work on the same part of a task',
    'finish separate jobs at the same time',
  ],
  'beat around the bush': [
    'explain something with too many details',
    'change the subject without noticing',
    'wait for a better time to speak',
  ],
  'go the extra mile': [
    'work faster than everyone else',
    'repeat a task because of an error',
    'travel farther than originally planned',
  ],
  'in hot water': [
    'feel embarrassed in front of others',
    'face a difficult choice',
    'receive a warning about a possible mistake',
  ],
  'miss the boat': [
    'make a choice too quickly',
    'fail to notice an important detail',
    'arrive later than expected',
  ],
  'up in the air': [
    'likely to change very soon',
    'being discussed by people far away',
    'waiting for one person’s approval',
  ],
  'back to square one': [
    'repeat only the last step',
    'review the original directions',
    'use the simplest available plan',
  ],
  'bite off more than you can chew': [
    'choose the hardest part first',
    'promise more than other people expect',
    'begin before you are fully prepared',
  ],
  'by the skin of your teeth': [
    'after making a last-second change',
    'without receiving help from others',
    'by using a clever shortcut',
  ],
  'cry over spilled milk': [
    'complain about someone else’s mistake',
    'avoid admitting that you caused a problem',
    'give up whenever something goes wrong',
  ],
  'get your ducks in a row': [
    'gather all supplies in one place',
    'ask everyone to work in the same way',
    'finish each step one at a time',
  ],
  'leave no stone unturned': [
    'continue after checking the most likely places',
    'solve a problem without asking for help',
    'look only for clues that others ignored',
  ],
  'not my cup of tea': [
    'not something I am skilled at',
    'not something I am familiar with',
    'not something I think is worthwhile',
  ],
  'read between the lines': [
    'look for details that the writer repeats',
    'compare two different parts of a text',
    'guess what will happen next in the story',
  ],
  'steal someone’s thunder': [
    'interrupt before the person finishes',
    'copy the person’s idea without permission',
    'make a louder announcement afterward',
  ],
  'tip of the iceberg': [
    'the first sign that a problem has begun',
    'the easiest part of a difficult problem',
    'the only part of a problem that can be fixed',
  ],
  'wild-goose chase': [
    'a search conducted in the wrong place',
    'a search begun without enough clues',
    'a search that takes longer than planned',
  ],
  'wear your heart on your sleeve': [
    'discuss your feelings only with close friends',
    'let your feelings control every decision',
    'react strongly whenever you are upset',
  ],
  'water under the bridge': [
    'a problem that has been solved fairly',
    'a mistake that was forgiven but remembered',
    'an issue that can no longer be repaired',
  ],
  'elephant in the room': [
    'a problem that is too large to solve',
    'a topic that everyone knows little about',
    'an argument that causes people to leave',
  ],
  'needle in a haystack': [
    'something that was hidden on purpose',
    'something mixed with many similar things',
    'something found only with a special tool',
  ],
  'apple of my eye': [
    'the person I trust more than anyone',
    'the person I am proud to resemble',
    'the person I try to protect from problems',
  ],
  'best of both worlds': [
    'a compromise where each side gives up something',
    'a choice that works in several situations',
    'a result that turns out better than expected',
  ],
  'bigger fish to fry': [
    'a harder problem than expected',
    'a task that requires more people',
    'a goal that offers a larger reward',
  ],
  'go back to the drawing board': [
    'look at the original plan for a clue',
    'repair only the part that failed',
    'ask a different person to improve the design',
  ],
  'know the ropes': [
    'remember every rule exactly',
    'be able to teach the task to beginners',
    'know which person to ask for help',
  ],
  'off the hook': [
    'receive a lighter consequence',
    'get more time to explain what happened',
    'prove that someone else made a mistake',
  ],
  'on thin ice': [
    'have a problem likely to worsen on its own',
    'make a choice that could disappoint someone',
    'work without having enough information',
  ],
  'see eye to eye': [
    'understand why another person thinks that way',
    'want the same result for different reasons',
    'respect a disagreement',
  ],
  'face the music': [
    'tell everyone exactly what happened',
    'apologize even when you were not at fault',
    'try to repair the damage quickly',
  ],
  'add fuel to the fire': [
    'take one person’s side in an argument',
    'repeat what originally caused a disagreement',
    'refuse to help solve an existing problem',
  ],
  'burn the midnight oil': [
    'work quietly so other people are not disturbed',
    'rush because a deadline is near',
    'continue working after everyone else stops',
  ],
  'cut corners': [
    'find a faster method that works equally well',
    'reduce the size of a project before starting',
    'finish only the most important part',
  ],
  'get cold feet': [
    'decide that an event is a bad idea',
    'feel unprepared after seeing the competition',
    'lose interest just before something begins',
  ],
  'jump on the bandwagon': [
    'copy a plan because it worked before',
    'support the winner after a contest ends',
    'accept an idea without asking questions',
  ],
  'take it with a grain of salt': [
    'reject a claim because its source is unreliable',
    'believe only the least surprising part of a story',
    'avoid repeating a claim to other people',
  ],
  'through thick and thin': [
    'whenever both people agree',
    'as long as the problems are temporary',
    'by taking turns asking each other for help',
  ],
  'turn a blind eye': [
    'miss wrongdoing because you were distracted',
    'decide that no rule was actually broken',
    'forgive someone after an apology',
  ],
  'put all your eggs in one basket': [
    'prepare only one plan at a time',
    'keep all of your resources together',
    'choose the safest available plan',
  ],
  'take the bull by the horns': [
    'solve a problem without any help',
    'act before understanding the problem',
    'choose the most dangerous part first',
  ],
  'throw in the towel': [
    'pause and try again later',
    'admit that you made a mistake',
    'ask another person to take over',
  ],
  'close but no cigar': [
    'succeed without receiving a prize',
    'make progress but stop halfway',
    'be correct only because of luck',
  ],
  'a dime a dozen': [
    'cheap enough that anyone can buy it',
    'usually sold only in large groups',
    'easy to replace if it breaks',
  ],
  'drop of a hat': [
    'as soon as another person gives a signal',
    'when an unexpected opportunity appears',
    'before finishing other planned work',
  ],
  'keep your cards close to your chest': [
    'avoid making a decision public',
    'refuse to explain your past actions',
    'share information only with trusted friends',
  ],
  'burn the candle at both ends': [
    'divide your attention between two hard tasks',
    'work hard without enough resources',
    'spend more time planning than resting',
  ],
  'straight from the horse’s mouth': [
    'confirmed by several different people',
    'reported before anyone else heard it',
    'explained using the speaker’s exact words',
  ],
  'throw caution to the wind': [
    'take a risk after comparing every choice',
    'ignore advice because you disagree with it',
    'act quickly to avoid missing a chance',
  ],
  'chip on your shoulder': [
    'expect other people to treat you unfairly',
    'feel angry about one recent event',
    'argue whenever someone criticizes you',
  ],
  'penny for your thoughts': [
    'explain why you disagree',
    'share an idea before you forget it',
    'say whether you think a plan is good',
  ],
  'weather the storm': [
    'avoid a problem until conditions improve',
    'change plans before trouble begins',
    'stay calm while other people solve the problem',
  ],
  'open a can of worms': [
    'discover a problem that already existed',
    'make one existing problem worse',
    'start an argument that is difficult to end',
  ],
  'move the goalposts': [
    'set a harder goal before the work begins',
    'clarify unclear requirements after a first draft',
    'use different measures for different teams',
  ],
  'the writing on the wall': [
    'a warning written by the person in charge',
    'evidence that a problem already happened',
    'a rumor that many people believe',
  ],
  'tilt at windmills': [
    'work on a real but very difficult problem',
    'argue for an idea that most people reject',
    'challenge a powerful opponent by yourself',
  ],
  'pyrrhic victory': [
    'a win that creates an unexpected new problem',
    'a win achieved by breaking the rules',
    'a win that no one else considers important',
  ],
  'cross that bridge when we come to it': [
    'delay a decision because information is missing',
    'prepare for every possible problem in advance',
    'ignore a problem that is likely to happen soon',
  ],
};

const THIRD_GRADE_CONTEXT_CLUES: Readonly<Record<string, string>> = {
  'piece of cake': 'Practice made the quiz feel easy.',
  'hold your horses': 'The directions still needed to be read before anyone began.',
  'under the weather': 'Staying home is a clue that Mia felt sick.',
  'all ears': 'The speaker is inviting someone to tell the whole story.',
  'in a pickle': 'Forgetting two important things created a difficult situation.',
  'zip your lip': 'The play had begun, so the audience needed to stop talking.',
  'on top of the world': 'Helping the team win made Jalen extremely happy.',
  'two peas in a pod': 'The twins share the same interest and are very alike.',
  'butterflies in my stomach': 'A recital can cause a nervous, fluttery feeling.',
  'raining cats and dogs': 'The umbrella is needed because the rain is very heavy.',
  'break the ice': 'The name game helped unfamiliar people feel comfortable together.',
  'hit the books': 'The upcoming test is a reason to begin studying seriously.',
  'spill the beans': 'The surprise party is information that should remain secret.',
  'let the cat out of the bag': 'Mentioning the gift accidentally revealed the surprise.',
  'once in a blue moon': 'Breakfast for dinner happens very rarely.',
  'call it a day': 'The model was finished, so the group stopped working for now.',
  'the ball is in your court': 'One person shared an idea and passed the next decision to the other.',
  'pulling your leg': 'The impossible alien story is a playful joke.',
  'sit tight': 'The listener should wait in place while the page is found.',
  'out of the blue': 'The rainbow appeared unexpectedly.',
  'keep your chin up': 'The speaker encourages hope after a mistake.',
  'fish out of water': 'A first meeting in an unfamiliar club felt uncomfortable.',
  'hit the nail on the head': 'Finding the loose wire identified the problem exactly.',
};

function domainForIdiom(phrase: string): IdiomDomain {
  const found = (Object.entries(IDIOM_GROUPS) as [IdiomDomain, readonly string[]][]).find(([, phrases]) =>
    phrases.includes(phrase),
  );
  if (!found) throw new Error(`Idiom is missing a semantic group: ${phrase}`);
  return found[0];
}

function difficultyForIdiom(minimumGrade: number, index: number): 1 | 2 | 3 {
  if (minimumGrade <= 1) return 1;
  if (minimumGrade === 2) return 2;
  if (minimumGrade === 3 || minimumGrade === 4) {
    const positionInGrade = IDIOMS.slice(0, index + 1).filter(
      (candidate) => candidate[4] === minimumGrade,
    ).length;
    const onLevelCount = minimumGrade === 3 ? 6 : 8;
    return positionInGrade <= onLevelCount ? 2 : 3;
  }
  return 3;
}

type DeviceEntry = readonly [
  line: string,
  device: 'simile' | 'metaphor' | 'personification' | 'hyperbole' | 'onomatopoeia' | 'alliteration' | 'oxymoron' | 'understatement',
  meaning: string,
  minimumGrade: number,
];

const DEVICES: readonly DeviceEntry[] = [
  ['The snow was as soft as a pillow.', 'simile', 'The snow felt very soft.', 3],
  ['Her smile shone like the Sun.', 'simile', 'Her smile looked bright and joyful.', 3],
  ['The puppy moved as fast as lightning.', 'simile', 'The puppy moved extremely quickly.', 3],
  ['The lake was a mirror.', 'metaphor', 'The lake was smooth and reflected what was around it.', 3],
  ['My backpack is a brick.', 'metaphor', 'The backpack feels very heavy.', 3],
  ['The classroom was a zoo.', 'metaphor', 'The classroom was noisy and disorderly.', 3],
  ['The wind whispered through the leaves.', 'personification', 'The wind made a soft sound in the leaves.', 3],
  ['The alarm clock shouted at me.', 'personification', 'The alarm sounded loud and demanding.', 3],
  ['The tired sun slipped behind the hill.', 'personification', 'The Sun appeared to set behind the hill.', 3],
  ['Buzz! A bee circled the flower.', 'onomatopoeia', 'The word “buzz” imitates the bee’s sound.', 3],
  ['The pan sizzled on the stove.', 'onomatopoeia', 'The word “sizzled” imitates the cooking sound.', 3],
  ['The door slammed with a bang.', 'onomatopoeia', 'The word “bang” imitates the sudden loud sound.', 3],
  ['Wild winds whipped the waves.', 'alliteration', 'Repeated W sounds make the line energetic.', 4],
  ['Seven slippery snakes slid south.', 'alliteration', 'Repeated S sounds create a playful sound pattern.', 4],
  ['Busy bees bounced between blossoms.', 'alliteration', 'Repeated B sounds connect the words.', 4],
  ['I have waited forever.', 'hyperbole', 'The speaker has waited a long time, not literally forever.', 4],
  ['This bag weighs a ton.', 'hyperbole', 'The bag feels extremely heavy, but it does not weigh a ton.', 4],
  ['I could eat a mountain of pancakes.', 'hyperbole', 'The speaker is very hungry, not able to eat a mountain.', 4],
  ['Ideas are seeds that grow when shared.', 'metaphor', 'Sharing and developing ideas can make them stronger.', 5],
  ['The city is a sleeping giant at dawn.', 'metaphor', 'The large city is quiet before daily activity begins.', 5],
  ['Her words were a flashlight in the confusion.', 'metaphor', 'Her words helped others understand the situation.', 5],
  ['The Moon followed us home.', 'personification', 'The distant Moon seemed to move as we traveled.', 5],
  ['Opportunity knocked on his door.', 'personification', 'A valuable chance became available to him.', 5],
  ['The old house groaned in the storm.', 'personification', 'The house made creaking sounds in the wind.', 5],
  ['The test was a little challenging after six hours of work.', 'understatement', 'Calling six difficult hours “a little challenging” makes the difficulty sound smaller.', 7],
  ['The hurricane caused a bit of wind.', 'understatement', 'The line deliberately makes a powerful storm sound minor.', 7],
  ['The fire station burned down.', 'understatement', 'The plain wording can emphasize the surprising contrast.', 7],
  ['deafening silence', 'oxymoron', 'Opposite ideas emphasize how intense the silence felt.', 7],
  ['bittersweet memory', 'oxymoron', 'The memory brings happiness and sadness at the same time.', 7],
  ['organized chaos', 'oxymoron', 'Something appears disorderly but still follows a system.', 7],
];

type PunEntry = readonly [setup: string, explanation: string, minimumGrade: number];

const PUNS: readonly PunEntry[] = [
  ['The bicycle could not stand up because it was two-tired.', '“Two-tired” sounds like “too tired” and also points to the bicycle’s two tires.', 2],
  ['The math book looked sad because it had too many problems.', '“Problems” can mean math questions or personal troubles.', 2],
  ['The broken pencil was pointless.', '“Pointless” means lacking a pencil point and also lacking a purpose.', 2],
  ['The scarecrow was outstanding in his field.', '“Outstanding in his field” can mean excellent or literally standing in a field.', 3],
  ['The calendar’s days are numbered.', 'Days have numbers, and “days are numbered” can also mean something will end soon.', 3],
  ['The astronaut needed space.', '“Space” means room to be alone and the region beyond Earth.', 3],
  ['The musician left a note.', 'A “note” can be a written message or a musical sound.', 3],
  ['The fish practiced its scales.', '“Scales” are on a fish and are also ordered notes in music.', 3],
  ['The light bulb had a bright idea.', '“Bright” can mean full of light or intelligent.', 3],
  ['The baker made a lot of dough.', '“Dough” can mean bread mixture or money.', 4],
  ['The tree had to leave.', '“Leave” sounds like “leaf,” and trees have leaves.', 4],
  ['The computer needed a byte to eat.', '“Byte” is a unit of computer data and sounds like “bite.”', 4],
  ['The scientist and the atom had great chemistry.', '“Chemistry” can mean a science or a strong connection between people.', 5],
  ['The geologist took the opportunity for granite.', '“Granite” sounds like “granted,” as in taking something for granted.', 5],
  ['The Moon restaurant had great food but no atmosphere.', '“Atmosphere” means both a mood and the gases surrounding a world.', 5],
  ['The electricity lesson was shocking.', '“Shocking” can mean surprising or involving an electric shock.', 5],
  ['The parallel lines had so much in common, but they would never meet.', 'Parallel lines share a direction yet do not intersect; “meet” also means encounter someone.', 6],
  ['The archaeologist’s career was in ruins.', '“In ruins” can mean failing or literally working among ancient ruins.', 6],
  ['The statistician was mean but only on average.', '“Mean” can describe unkind behavior or the mathematical average.', 6],
  ['The photon checked a suitcase, but the clerk said it was traveling light.', 'Light can mean having little luggage or electromagnetic radiation carried by photons.', 7],
];

function makeChoices(
  correct: string,
  pool: readonly string[],
  index: number,
): { choices: [string, string, string, string]; answer: 0 | 1 | 2 | 3 } {
  const distractors: string[] = [];
  for (let jump = 1; jump <= pool.length * 2 && distractors.length < 3; jump += 1) {
    const candidate = pool[(index + jump) % pool.length];
    if (candidate !== correct && !distractors.includes(candidate)) distractors.push(candidate);
  }
  const answer = (index % 4) as 0 | 1 | 2 | 3;
  const choices = [...distractors];
  choices.splice(answer, 0, correct);
  return { choices: choices as [string, string, string, string], answer };
}

export const IDIOM_QUESTIONS: Question[] = IDIOMS.map((entry, index) => {
  const [phrase, meaning, literalPicture, example, minimumGrade] = entry;
  domainForIdiom(phrase);
  const curatedDistractors = IDIOM_DISTRACTORS[phrase];
  if (!curatedDistractors) throw new Error(`Idiom is missing curated distractors: ${phrase}`);
  const { choices, answer } = makeChoices(
    meaning,
    [meaning, ...curatedDistractors],
    index,
  );
  const contextClue =
    THIRD_GRADE_CONTEXT_CLUES[phrase] ??
    'The surrounding details show the nonliteral meaning that fits this situation.';
  return {
    id: `fig-id-${String(index + 1).padStart(3, '0')}`,
    subject: 'verbal',
    kind: 'sentence_completion',
    topic: `grade-only idiom:${minimumGrade}`,
    prompt: `Read the sentence.\n\n“${example}”\n\nWhat does the idiom “${phrase}” mean in this sentence?`,
    choices,
    answer,
    explain: `In this sentence, “${phrase}” means “${meaning}.” ${contextClue} It does not literally mean “${literalPicture}.”`,
    difficulty: difficultyForIdiom(minimumGrade, index),
  };
});

export const IDIOM_DESIGN_AUDIT = {
  idiomCount: IDIOMS.length,
  curatedDistractorCount: Object.keys(IDIOM_DISTRACTORS).length,
  groupedIdiomCount: new Set(Object.values(IDIOM_GROUPS).flat()).size,
} as const;

const DEVICE_LABELS = [
  'simile',
  'metaphor',
  'personification',
  'hyperbole',
  'onomatopoeia',
  'alliteration',
  'oxymoron',
  'understatement',
] as const;

const DEVICE_QUESTIONS: Question[] = DEVICES.map((entry, index) => {
  const [line, device, meaning, minimumGrade] = entry;
  const { choices, answer } = makeChoices(device, DEVICE_LABELS, index);
  return {
    id: `fig-dev-${String(index + 1).padStart(3, '0')}`,
    subject: 'reading',
    kind: 'reading',
    topic: `grade-only figurative device:${minimumGrade}`,
    prompt: `Which kind of figurative language appears here?\n\n“${line}”`,
    choices,
    answer,
    explain: `This is ${device}. ${meaning}`,
    difficulty: minimumGrade <= 4 ? 1 : minimumGrade <= 6 ? 2 : 3,
  };
});

const PUN_QUESTIONS: Question[] = PUNS.map((entry, index) => {
  const [setup, explanation, minimumGrade] = entry;
  const correct = explanation;
  const pool = PUNS.map((candidate) => candidate[1]);
  const { choices, answer } = makeChoices(correct, pool, index);
  return {
    id: `fig-pun-${String(index + 1).padStart(3, '0')}`,
    subject: 'verbal',
    kind: 'sentence_completion',
    topic: `grade-only pun:${minimumGrade}`,
    prompt: `Why is this a pun?\n\n“${setup}”`,
    choices,
    answer,
    explain: explanation,
    difficulty: minimumGrade <= 3 ? 1 : minimumGrade <= 5 ? 2 : 3,
  };
});

function minimumGrade(question: Question): number {
  const match = question.topic?.match(/:(\d)$/);
  return match ? Number(match[1]) : 8;
}

const ALL_FIGURATIVE = [...IDIOM_QUESTIONS, ...DEVICE_QUESTIONS, ...PUN_QUESTIONS];

/** Grade-only content. Never import this into an ISEE practice bank. */
export function figurativeQuestionsForGrade(grade: FigurativeGrade): Question[] {
  const gradeNumber = GRADE_NUMBER[grade];
  if (gradeNumber < 1) return [];
  return ALL_FIGURATIVE.filter((question) => minimumGrade(question) <= gradeNumber);
}

export const FIGURATIVE_QUESTION_COUNT = ALL_FIGURATIVE.length;
