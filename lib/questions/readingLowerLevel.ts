import type { Question } from './types';

export const LOWER_LEVEL_READING_BLUEPRINT = {
  passages: 5,
  questionsPerPassage: 5,
  total: 25,
  minimumPassageWords: 300,
  maximumPassageWords: 600,
} as const;

/**
 * Five original, full-length Lower Level passage sets. ERB's guide specifies
 * five passages followed by five questions, using narrative, expository,
 * persuasive, and descriptive texts. These sets form one complete 25-question
 * practice mix and carry explicit strand/genre metadata for auditing.
 */

const WEATHER_VANE =
  "On the morning of the harbor festival, Tessa found her grandfather in his workshop staring at a wooden rooster. It was meant to spin above the town hall and point into the wind, but one wing was still rough and the iron arrow beneath it leaned sideways. Grandpa rubbed his sore wrist. \"I can finish the carving,\" Tessa offered. She had sanded boards before, but she had never shaped anything that people would see from the street. Grandpa handed her a narrow file. \"Follow the curve that is already there. Do not fight the wood.\" Tessa began too quickly. The file skipped and left a pale scratch across the dark wing. Her stomach tightened. She considered turning the rooster so Grandpa would not notice. Instead, she showed him. He studied the mark, then drew three smaller feather lines beside it. Suddenly the scratch looked like part of a pattern. \"A mistake can become a choice,\" he said, \"if you look at it long enough.\" They worked quietly after that. Tessa slowed down and let the grain guide her hand. Each time she reached a knot, she stopped to examine it before moving the file. Grandpa did not take over. He simply pointed when the curve began to flatten and let Tessa correct it herself. By noon, they carried the rooster to the square, where a worker lifted it onto the roof. For several minutes it did not move. Then a sea breeze reached the cupola. The rooster swung west, its carved feathers flashing in the sun. From the crowd below, no one could see the first scratch, but Tessa knew exactly where it was. She did not wish it away. That thin line had made her confess, listen, and begin again. When Grandpa asked whether she wanted to paint the next weather vane, Tessa looked up at the turning rooster and said yes before fear could answer for her.";

const CITY_TREES =
  "A city tree does more than decorate a sidewalk. On a summer afternoon, pavement in direct sunlight can become much hotter than the air. A broad tree crown acts like an umbrella, keeping sunlight off concrete and brick. At the same time, water travels from a tree's roots to its leaves and then escapes as vapor. This process, called transpiration, cools the surrounding air. Trees also slow rain. Leaves and branches catch part of a downpour before it reaches the ground, while roots create spaces where water can soak into soil. That matters in neighborhoods covered by roofs and roads, because water that cannot soak in may rush into storm drains and flood low streets. Trees can help living things as well. Blossoms feed insects, branches give birds places to rest, and leaves can catch some dust before it moves through the neighborhood air. Yet planting any tree anywhere is not a complete solution. A young tree squeezed into a tiny square of hard soil may die before it provides much shade. Some species grow roots that lift sidewalks, while others cannot tolerate road salt or dry summers. City planners therefore study the width of a planting space, nearby power lines, local weather, and the amount of water a tree will receive. They also spread plantings across neighborhoods. In many cities, blocks with fewer trees become hotter than leafy blocks during heat waves. Planting only in parks would leave those hotter streets unprotected. Finally, trees need years of care. Watering, pruning, and protecting trunks from damage cost money, but replacing dead trees costs even more. A successful urban forest is not created during one cheerful planting day. It grows from choosing suitable trees, placing them where their benefits are needed, and caring for them long enough to form healthy crowns.";

const EVENING_LIBRARY =
  "Our town library should stay open until eight o'clock on Thursdays. Right now it closes at five, exactly when many parents are leaving work. Students who need a quiet place to read or use a computer often arrive to find the doors locked. One later evening would not solve every problem, but it would give families a dependable time each week to visit together. Some residents worry that longer hours would cost too much. That concern deserves a real answer. The library could shift three morning staff hours to Thursday evening instead of adding an entirely new shift. A six-week trial would show how many people actually come, so the town would not be making a permanent promise before seeing evidence. Others say nearly everyone has internet access at home. The library's own waiting list suggests otherwise: its computers are reserved through most afternoons. Even homes with internet may not have a printer, a calm work table, or an adult who can help find a reliable source. Libraries offer all of those things. A later Thursday could also include a short family program. Volunteers might lead homework help, read-alouds, or workshops on using online town services. These programs would turn the extra hours into more than time beside unlocked shelves. The library could survey visitors before the trial, too, so the programs reflect what families actually want rather than what planners merely guess they want. Of course, the trial should have clear goals. Staff could count visitors, record computer use, and ask families why they came. If almost no one uses the evening, the library can return to its old schedule. But if working parents, students, and older residents fill the building, the town will have learned that a small schedule change opens a large door. We should test the idea rather than reject it before our neighbors have a chance to walk through.";

const MARSH_DAWN =
  "Before sunrise, the salt marsh seems to be holding its breath. The creek lies flat and dark between banks of cordgrass, reflecting only a faint gray strip of sky. Mud that looked brown yesterday now shines like polished stone. Then the tide begins to turn. Water whispers around the grass stems and nudges empty snail shells a finger's width at a time. A snowy egret steps from the reeds. Its white body is almost too bright for the dim morning, but its black legs vanish against the creek. The bird freezes, neck folded like a spring. When a silver fish flickers near the surface, the egret's head darts down and rises with breakfast. Farther out, fiddler crabs emerge from their holes. Each male carries one claw so large that it looks borrowed from a bigger animal. They lift and lower those claws as if an invisible conductor were guiding a tiny orchestra. Along the muddy bank, beads of water cling to spiderwebs stretched between the stems. For a moment they catch the weak light and form necklaces that no one placed there. With the growing light come sounds that darkness had hidden: the plop of a jumping fish, the dry rustle of grass, and the bubbling call of a marsh wren. The air smells sharp with salt and wet earth. It is not the sweet smell of a garden, but it belongs here as surely as the tide. Soon the eastern clouds turn peach, then gold. The creek catches the colors and breaks them into trembling ribbons. Cars are already moving on the bridge beyond the marsh, yet their hum feels far away. In the grass, every creature follows an older schedule measured by water and light. The marsh no longer seems to be holding its breath. It has opened its eyes.";

const BOOKS_BY_HORSE =
  "During the 1930s, many families in the mountains of eastern Kentucky lived miles from a town or paved road. Schools owned very few books, and traveling to a library could take most of a day. As part of a work program during the Great Depression, women known as pack horse librarians carried reading materials to these isolated remote mountain communities. Their routes crossed steep ridges, muddy paths, and creeks. A round trip might cover more than one hundred miles in a week. Bad weather did not automatically cancel a route. Riders sometimes wrapped books in cloth or carried them inside pillowcases to protect the pages. Because horses could not reach every cabin, a librarian might dismount and walk the difficult final stretch. The librarians packed books and magazines into saddlebags, but they rarely had enough new material. They repaired worn pages and created homemade scrapbooks from recipes, quilt patterns, health advice, and stories clipped from old publications. One household might lend a treasured family recipe, which a librarian copied and shared with many others. In this way, information traveled in both directions: librarians brought material into the mountains and also collected local knowledge to circulate. The work required trust. A rider returned on a regular schedule, learned what each family enjoyed, and might read aloud to someone who could not read alone. Children waited eagerly for adventure stories; adults requested farm information, news, or practical instructions. Pack horse libraries did not last forever. The work program ended in the early 1940s, and roads and permanent libraries gradually reached more communities. Still, the riders demonstrated that a library is not only a building. It is a connection between people and information. When readers could not come to shelves, these librarians tied the shelves to saddles and brought them to the readers.";

export const LOWER_LEVEL_READING_QUESTIONS: Question[] = [
  // Narrative: main idea, supporting idea, inference, organization, tone/style.
  {
    id: 'rcll-001', subject: 'reading', kind: 'reading', passageId: 'll-p01',
    passage: WEATHER_VANE, passageGenre: 'narrative', readingSkill: 'main_idea',
    prompt: 'Which statement best expresses the main idea of the passage?',
    choices: [
      'Tessa learns that admitting and working through a mistake can build confidence.',
      'Grandpa needs Tessa to finish every project because his wrist is sore.',
      'The town festival cannot begin until the weather vane starts turning.',
      'Wood carving is easier when a person works as quickly as possible.',
      'A weather vane must have a rooster shape in order to catch the wind.',
    ], answer: 0, difficulty: 2,
    explain: 'The whole story follows Tessa from hiding a scratch to admitting it, learning from Grandpa, and agreeing to try another project. The other choices mention details or ideas the passage does not support.',
  },
  {
    id: 'rcll-002', subject: 'reading', kind: 'reading', passageId: 'll-p01',
    passage: WEATHER_VANE, passageGenre: 'narrative', readingSkill: 'supporting_ideas',
    prompt: 'What does Grandpa do after Tessa shows him the scratch?',
    choices: [
      'He turns the rooster so the scratch faces the roof.',
      'He adds feather lines that make the scratch part of a pattern.',
      'He tells the worker to paint over the damaged wing.',
      'He takes the file away and finishes the carving himself.',
      'He replaces the wooden rooster with an iron one.',
    ], answer: 1, difficulty: 1,
    explain: 'The passage directly says Grandpa draws three smaller feather lines beside the scratch, making it look planned.',
  },
  {
    id: 'rcll-003', subject: 'reading', kind: 'reading', passageId: 'll-p01',
    passage: WEATHER_VANE, passageGenre: 'narrative', readingSkill: 'inference',
    prompt: 'Why does Tessa say yes before "fear could answer for her"?',
    choices: [
      'She is afraid Grandpa will give the job to the town worker.',
      'She wants to leave the crowded festival as soon as possible.',
      'She knows nervousness might stop her even though she now wants to try.',
      'She thinks painting requires no skill and cannot go wrong.',
      'She has promised the mayor that she will paint every weather vane.',
    ], answer: 2, difficulty: 3,
    explain: 'Tessa was frightened by her first mistake, but she also gained confidence by fixing it. The line means she chooses to try again before her nervous feeling can make her refuse.',
  },
  {
    id: 'rcll-004', subject: 'reading', kind: 'reading', passageId: 'll-p01',
    passage: WEATHER_VANE, passageGenre: 'narrative', readingSkill: 'organization_logic',
    prompt: 'How is the passage mainly organized?',
    choices: [
      'It compares two different ways to build a weather vane.',
      'It gives instructions and then lists the tools that are needed.',
      'It begins with the festival and then moves backward many years.',
      'It follows a problem, Tessa\'s response, and what she learns from solving it.',
      'It presents an opinion and then answers several objections.',
    ], answer: 3, difficulty: 2,
    explain: 'The scratch creates the problem, Tessa admits it and works more carefully, and the ending shows the confidence she gained.',
  },
  {
    id: 'rcll-005', subject: 'reading', kind: 'reading', passageId: 'll-p01',
    passage: WEATHER_VANE, passageGenre: 'narrative', readingSkill: 'tone_style_figurative',
    prompt: 'Grandpa\'s words "A mistake can become a choice" suggest that',
    choices: [
      'every mistake should be left exactly as it is',
      'people should plan to make scratches in their work',
      'a mistake matters only when other people can see it',
      'careful workers never need to begin a job again',
      'creative thinking can turn a flaw into part of a new plan',
    ], answer: 4, difficulty: 3,
    explain: 'Grandpa does not pretend the scratch never happened. He adds lines around it so the flaw becomes a deliberate feather pattern.',
  },

  // Expository science: organization, main idea, supporting idea, inference, vocabulary.
  {
    id: 'rcll-006', subject: 'reading', kind: 'reading', passageId: 'll-p02',
    passage: CITY_TREES, passageGenre: 'expository', readingSkill: 'organization_logic',
    prompt: 'How does the final paragraph develop the passage?',
    choices: [
      'It explains that long-term care is needed after trees are planted.',
      'It argues that city trees should be replaced by covered sidewalks.',
      'It describes how leaves release water vapor during hot weather.',
      'It compares the cost of trees with the cost of storm drains.',
      'It tells a story about neighbors planting a park together.',
    ], answer: 0, difficulty: 2,
    explain: 'The last paragraph moves from choosing and placing trees to watering, pruning, and protecting them for years. That adds the need for continuing care.',
  },
  {
    id: 'rcll-007', subject: 'reading', kind: 'reading', passageId: 'll-p02',
    passage: CITY_TREES, passageGenre: 'expository', readingSkill: 'main_idea',
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Transpiration is the only useful process performed by city trees.',
      'City trees provide important benefits when they are chosen, placed, and cared for wisely.',
      'Every city street should be planted with the same fast-growing tree.',
      'Parks are the best places to protect cities from heat and flooding.',
      'Replacing a dead tree always costs less than pruning a healthy one.',
    ], answer: 1, difficulty: 2,
    explain: 'The passage explains benefits, warns that not every tree fits every place, and ends with long-term care. The correct answer includes all three parts.',
  },
  {
    id: 'rcll-008', subject: 'reading', kind: 'reading', passageId: 'll-p02',
    passage: CITY_TREES, passageGenre: 'expository', readingSkill: 'supporting_ideas',
    prompt: 'According to the passage, how can tree roots help during a downpour?',
    choices: [
      'They pump rainwater back into the leaves.',
      'They direct all water toward storm drains.',
      'They create spaces where water can soak into the soil.',
      'They lift sidewalks so water can flow underneath.',
      'They prevent rain from reaching streets at all.',
    ], answer: 2, difficulty: 1,
    explain: 'The passage directly states that roots create spaces in the soil where rainwater can soak in.',
  },
  {
    id: 'rcll-009', subject: 'reading', kind: 'reading', passageId: 'll-p02',
    passage: CITY_TREES, passageGenre: 'expository', readingSkill: 'inference',
    prompt: 'The passage suggests that planting trees only in parks would be unfair because',
    choices: [
      'parks already contain too many young trees',
      'park soil cannot absorb water during storms',
      'people do not visit parks during heat waves',
      'hotter neighborhoods without parks would miss the trees\' protection',
      'trees near streets always grow faster than trees in parks',
    ], answer: 3, difficulty: 2,
    explain: 'The author says some blocks have fewer trees and become hotter. If planting happened only in parks, those blocks would still lack shade and cooling.',
  },
  {
    id: 'rcll-010', subject: 'reading', kind: 'reading', passageId: 'll-p02',
    passage: CITY_TREES, passageGenre: 'expository', readingSkill: 'vocabulary_in_context',
    prompt: 'As used in the passage, "tolerate" most nearly means',
    choices: ['measure carefully', 'move away from', 'grow beneath', 'make use of', 'survive or handle'],
    answer: 4, difficulty: 2,
    explain: 'The sentence discusses species that cannot live well with road salt or dry summers. Tolerate means survive or handle those conditions.',
  },

  // Persuasive: organization, tone, main idea, supporting idea, inference.
  {
    id: 'rcll-011', subject: 'reading', kind: 'reading', passageId: 'll-p03',
    passage: EVENING_LIBRARY, passageGenre: 'persuasive', readingSkill: 'organization_logic',
    prompt: 'Why does the author discuss a six-week trial?',
    choices: [
      'To answer cost concerns with a limited plan that can be measured',
      'To prove that the library should close every Thursday morning',
      'To explain why volunteers need six weeks of training',
      'To compare the library schedule with the school calendar',
      'To show that permanent changes should never be made',
    ], answer: 0, difficulty: 2,
    explain: 'The trial is offered right after the cost objection. It lets the town test attendance before promising a permanent, expensive change.',
  },
  {
    id: 'rcll-012', subject: 'reading', kind: 'reading', passageId: 'll-p03',
    passage: EVENING_LIBRARY, passageGenre: 'persuasive', readingSkill: 'tone_style_figurative',
    prompt: 'The author\'s tone is best described as',
    choices: ['angry and accusing', 'hopeful but practical', 'uncertain and apologetic', 'humorous and playful', 'bored and distant'],
    answer: 1, difficulty: 2,
    explain: 'The author believes the idea can help, which is hopeful, but also discusses cost, a trial period, evidence, and clear goals, which is practical.',
  },
  {
    id: 'rcll-013', subject: 'reading', kind: 'reading', passageId: 'll-p03',
    passage: EVENING_LIBRARY, passageGenre: 'persuasive', readingSkill: 'main_idea',
    prompt: 'What is the author mainly arguing?',
    choices: [
      'Every library should remain open until midnight.',
      'Volunteers should replace the paid library staff.',
      'The town should test keeping the library open later one evening a week.',
      'Students should complete all computer work at school.',
      'The town should build a second library near the school.',
    ], answer: 2, difficulty: 1,
    explain: 'The opening states the proposal, and the rest of the passage gives reasons and a way to test it.',
  },
  {
    id: 'rcll-014', subject: 'reading', kind: 'reading', passageId: 'll-p03',
    passage: EVENING_LIBRARY, passageGenre: 'persuasive', readingSkill: 'supporting_ideas',
    prompt: 'Which fact does the author use to answer the claim that nearly everyone has internet at home?',
    choices: [
      'The library closes at five o\'clock.',
      'Older residents sometimes visit the library.',
      'Volunteers could lead family programs.',
      'Library computers are reserved through most afternoons.',
      'The town can move staff hours from the morning.',
    ], answer: 3, difficulty: 1,
    explain: 'A long computer waiting list is evidence that people still need the library\'s internet and equipment.',
  },
  {
    id: 'rcll-015', subject: 'reading', kind: 'reading', passageId: 'll-p03',
    passage: EVENING_LIBRARY, passageGenre: 'persuasive', readingSkill: 'inference',
    prompt: 'Which result would most weaken the author\'s argument after the trial?',
    choices: [
      'Many students use the quiet tables for homework.',
      'Parents attend workshops on town services.',
      'Thursday morning attendance remains steady.',
      'The library receives several donated printers.',
      'Very few people visit during the added evening hours.',
    ], answer: 4, difficulty: 3,
    explain: 'The proposal depends on families using the later hours. If almost nobody comes, the trial would show that the schedule change is not meeting a need.',
  },

  // Descriptive: vocabulary, organization, style, main idea, supporting idea.
  {
    id: 'rcll-016', subject: 'reading', kind: 'reading', passageId: 'll-p04',
    passage: MARSH_DAWN, passageGenre: 'descriptive', readingSkill: 'vocabulary_in_context',
    prompt: 'As used in the passage, "emerge" most nearly means',
    choices: ['come out', 'make noise', 'dig deeply', 'move together', 'hide again'],
    answer: 0, difficulty: 1,
    explain: 'The crabs emerge from their holes when the light grows. In this context, emerge means come out into view.',
  },
  {
    id: 'rcll-017', subject: 'reading', kind: 'reading', passageId: 'll-p04',
    passage: MARSH_DAWN, passageGenre: 'descriptive', readingSkill: 'organization_logic',
    prompt: 'The details in the passage are mainly arranged by',
    choices: [
      'the size of each animal, from largest to smallest',
      'the gradual change from before sunrise to full morning light',
      'a list of reasons marshes should be protected',
      'the path of one bird flying across the marsh',
      'a comparison of the marsh in winter and summer',
    ], answer: 1, difficulty: 2,
    explain: 'The passage begins before sunrise, adds animals and sounds as light grows, and ends when the marsh has fully awakened.',
  },
  {
    id: 'rcll-018', subject: 'reading', kind: 'reading', passageId: 'll-p04',
    passage: MARSH_DAWN, passageGenre: 'descriptive', readingSkill: 'tone_style_figurative',
    prompt: 'The final sentence, "It has opened its eyes," is an example of',
    choices: ['a fact supported by an experiment', 'a comparison using the word like', 'personification that makes the marsh seem alive', 'an exaggeration meant to be funny', 'a warning about an approaching storm'],
    answer: 2, difficulty: 2,
    explain: 'A marsh does not literally have eyes. Giving it a human action is personification, and it helps the reader imagine the place waking up.',
  },
  {
    id: 'rcll-019', subject: 'reading', kind: 'reading', passageId: 'll-p04',
    passage: MARSH_DAWN, passageGenre: 'descriptive', readingSkill: 'main_idea',
    prompt: 'Which statement best captures the main idea of the passage?',
    choices: [
      'Egrets are more successful hunters than other marsh birds.',
      'Traffic noise has caused most marsh animals to leave.',
      'A salt marsh has an unpleasant smell before sunrise.',
      'As dawn arrives, a quiet marsh becomes active with color, sound, and movement.',
      'Fiddler crabs depend on high tide to find their food.',
    ], answer: 3, difficulty: 2,
    explain: 'Nearly every detail shows the marsh changing as daylight arrives. The correct answer gathers the sights, sounds, and movement into one idea.',
  },
  {
    id: 'rcll-020', subject: 'reading', kind: 'reading', passageId: 'll-p04',
    passage: MARSH_DAWN, passageGenre: 'descriptive', readingSkill: 'supporting_ideas',
    prompt: 'Which sound is specifically mentioned in the passage?',
    choices: ['the splash of an egret landing', 'the whistle of wind under the bridge', 'the click of crab claws striking', 'the roar of waves beyond the creek', 'the bubbling call of a marsh wren'],
    answer: 4, difficulty: 1,
    explain: 'The passage lists sounds revealed by daylight, including "the bubbling call of a marsh wren."',
  },

  // Expository history: supporting idea, inference, vocabulary, tone, main idea.
  {
    id: 'rcll-021', subject: 'reading', kind: 'reading', passageId: 'll-p05',
    passage: BOOKS_BY_HORSE, passageGenre: 'expository', readingSkill: 'supporting_ideas',
    prompt: 'What did pack horse librarians include in homemade scrapbooks?',
    choices: [
      'Recipes, quilt patterns, health advice, and clipped stories',
      'Maps for building new paved roads through the mountains',
      'Lists of every horse and rider in the work program',
      'Only adventure stories requested by children',
      'School tests collected from towns across Kentucky',
    ], answer: 0, difficulty: 1,
    explain: 'The passage directly lists recipes, quilt patterns, health advice, and stories clipped from old publications.',
  },
  {
    id: 'rcll-022', subject: 'reading', kind: 'reading', passageId: 'll-p05',
    passage: BOOKS_BY_HORSE, passageGenre: 'expository', readingSkill: 'inference',
    prompt: 'Why was returning on a regular schedule important to the librarians\' work?',
    choices: [
      'It allowed every rider to finish a route in a single day.',
      'It helped families trust the rider and request useful material.',
      'It prevented roads from being built through the mountains.',
      'It guaranteed that no borrowed book would ever wear out.',
      'It gave librarians time to train horses for racing.',
    ], answer: 1, difficulty: 2,
    explain: 'The passage connects regular visits with trust and learning what each family liked. A dependable return made borrowing and sharing possible.',
  },
  {
    id: 'rcll-023', subject: 'reading', kind: 'reading', passageId: 'll-p05',
    passage: BOOKS_BY_HORSE, passageGenre: 'expository', readingSkill: 'vocabulary_in_context',
    prompt: 'As used in the passage, "circulate" most nearly means',
    choices: ['lock away', 'copy exactly', 'pass from person to person', 'sell for money', 'translate into another language'],
    answer: 2, difficulty: 2,
    explain: 'Librarians collected local knowledge and shared it with other families. Circulate means pass something around among people.',
  },
  {
    id: 'rcll-024', subject: 'reading', kind: 'reading', passageId: 'll-p05',
    passage: BOOKS_BY_HORSE, passageGenre: 'expository', readingSkill: 'tone_style_figurative',
    prompt: 'The author\'s attitude toward the pack horse librarians is best described as',
    choices: ['doubtful of their usefulness', 'amused by their mistakes', 'angry about their routes', 'respectful of their resourcefulness', 'uninterested in their readers'],
    answer: 3, difficulty: 2,
    explain: 'The author emphasizes hard routes, repaired books, homemade materials, trust, and personal service. Those details show respect for how resourceful the librarians were.',
  },
  {
    id: 'rcll-025', subject: 'reading', kind: 'reading', passageId: 'll-p05',
    passage: BOOKS_BY_HORSE, passageGenre: 'expository', readingSkill: 'main_idea',
    prompt: 'Which statement best expresses the main idea of the passage?',
    choices: [
      'Mountain families preferred magazines to books.',
      'Permanent libraries caused the Great Depression work program to begin.',
      'Horses were the fastest way to travel across Kentucky in the 1930s.',
      'Homemade scrapbooks were more accurate than printed publications.',
      'Pack horse librarians found creative ways to connect remote readers with information.',
    ], answer: 4, difficulty: 2,
    explain: 'The passage focuses on the challenge of reaching remote families and the many creative ways librarians brought and shared useful reading material.',
  },
];
