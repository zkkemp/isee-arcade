import type { Question } from './types';

export const READING_QUESTIONS: Question[] = [
  {
    id: 'rc-001',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p01',
    passage:
      "Sea otters spend almost their whole lives in the water, and they have a clever trick for bedtime. Before an otter sleeps, it wraps a long ribbon of kelp around its body like a seat belt. The kelp is anchored to the ocean floor, so the sleeping otter does not drift out to sea. Otters also have the thickest fur of any animal. Instead of a thick layer of blubber, they trap warm air against their skin by grooming their coat for hours every day. A dirty, matted coat would let cold water reach the skin, so for an otter, cleaning is not fussiness. It is survival.",
    prompt: 'According to the passage, why does a sea otter wrap kelp around its body before sleeping?',
    choices: [
      'The kelp keeps its fur warm and dry.',
      'The kelp hides it from hungry sharks.',
      'The kelp is anchored below, so the otter does not drift away.',
      'The kelp holds food the otter can eat when it wakes up.',
    ],
    answer: 2,
    explain:
      'The passage says the kelp is anchored to the ocean floor, so the sleeping otter does not drift out to sea. That is the detail the question asks about.',
    difficulty: 1,
  },
  {
    id: 'rc-002',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p01',
    passage:
      "Sea otters spend almost their whole lives in the water, and they have a clever trick for bedtime. Before an otter sleeps, it wraps a long ribbon of kelp around its body like a seat belt. The kelp is anchored to the ocean floor, so the sleeping otter does not drift out to sea. Otters also have the thickest fur of any animal. Instead of a thick layer of blubber, they trap warm air against their skin by grooming their coat for hours every day. A dirty, matted coat would let cold water reach the skin, so for an otter, cleaning is not fussiness. It is survival.",
    prompt: 'The passage suggests that a sea otter with a dirty, matted coat would most likely',
    choices: [
      'get dangerously cold in the water',
      'sink straight to the ocean floor',
      'grow a thick layer of blubber instead',
      'sleep much longer than usual',
    ],
    answer: 0,
    explain:
      'Otters stay warm by trapping air in clean fur, and the passage says a matted coat would let cold water reach the skin. So a dirty coat means a cold otter.',
    difficulty: 2,
  },
  {
    id: 'rc-003',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p02',
    passage:
      "Mary Anning grew up in a seaside English town in the early 1800s, where cliffs of soft gray rock crumbled after every storm. As a girl she walked the beach with a basket, hunting the strange stone shapes that tourists liked to buy. When she was about twelve, she and her brother uncovered the long skeleton of a creature no one could name. Scientists later called it an ichthyosaur. Anning kept digging for the rest of her life and found several more ancient animals. Because she was a woman and was poor, the men who wrote about her discoveries often left her name out of them.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'How Ocean Storms Change a Coastline',
      'The Fossil Hunter Who Was Left Out of the Story',
      'Life and Habits of the Ichthyosaur',
      'Selling Souvenirs to Seaside Tourists',
    ],
    answer: 1,
    explain:
      'The passage follows Anning finding fossils and ends by saying writers often left her name out. A good title has to cover both her discoveries and the missing credit.',
    difficulty: 2,
  },
  {
    id: 'rc-004',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p02',
    passage:
      "Mary Anning grew up in a seaside English town in the early 1800s, where cliffs of soft gray rock crumbled after every storm. As a girl she walked the beach with a basket, hunting the strange stone shapes that tourists liked to buy. When she was about twelve, she and her brother uncovered the long skeleton of a creature no one could name. Scientists later called it an ichthyosaur. Anning kept digging for the rest of her life and found several more ancient animals. Because she was a woman and was poor, the men who wrote about her discoveries often left her name out of them.",
    prompt: "The passage suggests that storms were helpful to Anning's work because",
    choices: [
      'they brought more tourists to the beach to buy her finds',
      'they kept other scientists away from the cliffs',
      'they made the soft rock harder and easier to carry',
      'they crumbled the cliffs and exposed fossils that had been buried',
    ],
    answer: 3,
    explain:
      'The passage says the soft cliffs crumbled after every storm, and Anning searched the beach afterward. Crumbling rock is what brought buried fossils into view.',
    difficulty: 3,
  },
  {
    id: 'rc-005',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p03',
    passage:
      "Nora had checked the couch three times. The library book about volcanoes was not under the cushions, not in her backpack, and not on the shelf where it belonged. Due today. She pictured Mr. Reyes at the front desk, tapping his pen. She was halfway through inventing an excuse about a leaky roof when she remembered the reading fort she had built in the closet on Sunday. She pulled the door open. There, under a folded blanket and a flashlight with a dead battery, was the book, its cover bent but readable. Nora let out a breath she had been holding all morning.",
    prompt: 'Before Nora opened the closet door, she felt',
    choices: [
      'worried about facing Mr. Reyes',
      'bored with the book about volcanoes',
      'annoyed at her younger brother',
      'proud of the fort she had built',
    ],
    answer: 0,
    explain:
      'She pictures Mr. Reyes tapping his pen, starts inventing an excuse, and finally lets out a breath she had held all morning. Those are signs of worry.',
    difficulty: 2,
  },
  {
    id: 'rc-006',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p03',
    passage:
      "Nora had checked the couch three times. The library book about volcanoes was not under the cushions, not in her backpack, and not on the shelf where it belonged. Due today. She pictured Mr. Reyes at the front desk, tapping his pen. She was halfway through inventing an excuse about a leaky roof when she remembered the reading fort she had built in the closet on Sunday. She pulled the door open. There, under a folded blanket and a flashlight with a dead battery, was the book, its cover bent but readable. Nora let out a breath she had been holding all morning.",
    prompt: 'The passage is mainly organized as',
    choices: [
      'a set of instructions for building a reading fort',
      'a comparison between two characters',
      'a problem followed by the solution Nora finds',
      'a list of library rules and the reasons behind them',
    ],
    answer: 2,
    explain:
      'The first half is the missing book, the second half is Nora remembering the fort and finding it. Problem, then solution.',
    difficulty: 2,
  },
  {
    id: 'rc-007',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p04',
    passage:
      "A thermos looks like a plain metal cup, but inside it there are two walls with almost nothing between them. Most of the air has been pumped out of that narrow gap. Heat travels easily through solids and through air, so removing the air removes the path heat would take. The inside wall is often coated with a shiny silver layer that bounces heat back toward the drink, the way a mirror bounces light. The lid seals the top so warm air cannot escape. None of this makes heat. A thermos only slows heat down, which is why it keeps cocoa hot and lemonade cold.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'A thermos heats a drink using its silver coating.',
      'A thermos works by removing the paths that heat uses to travel.',
      'Air carries heat much better than metal does.',
      'A tight lid is the only reason a thermos works.',
    ],
    answer: 1,
    explain:
      'The gap with the air removed, the silver layer, and the sealed lid all block a route heat could take. The passage even says a thermos does not make heat, it only slows it down.',
    difficulty: 2,
  },
  {
    id: 'rc-008',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p04',
    passage:
      "A thermos looks like a plain metal cup, but inside it there are two walls with almost nothing between them. Most of the air has been pumped out of that narrow gap. Heat travels easily through solids and through air, so removing the air removes the path heat would take. The inside wall is often coated with a shiny silver layer that bounces heat back toward the drink, the way a mirror bounces light. The lid seals the top so warm air cannot escape. None of this makes heat. A thermos only slows heat down, which is why it keeps cocoa hot and lemonade cold.",
    prompt: 'As used in the passage, the word "seals" most nearly means',
    choices: ['decorates', 'measures', 'warms', 'closes tightly'],
    answer: 3,
    explain:
      'The lid seals the top so warm air cannot escape. Something that stops air from escaping is closing it tightly.',
    difficulty: 1,
  },
  {
    id: 'rc-009',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p05',
    passage:
      "Each fall, monarch butterflies in the eastern United States begin a trip that seems impossible for an insect weighing less than a paper clip. They fly south, sometimes two thousand miles, to a handful of mountain fir forests in central Mexico. There they cluster on the trees in numbers so thick that branches bend. What makes the journey stranger than it first seems is that no single butterfly makes the round trip. The monarchs that fly north in spring lay eggs and die along the way. Their great grandchildren are the ones who find those same Mexican forests the following winter, without ever having seen them.",
    prompt: 'According to the passage, where do the monarchs spend the winter?',
    choices: [
      'In the eastern United States',
      'Along the coast of Texas',
      'In mountain fir forests in central Mexico',
      'In warm caves partway along the route',
    ],
    answer: 2,
    explain:
      'The passage says the butterflies fly south to a handful of mountain fir forests in central Mexico and cluster on the trees there.',
    difficulty: 1,
  },
  {
    id: 'rc-010',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p05',
    passage:
      "Each fall, monarch butterflies in the eastern United States begin a trip that seems impossible for an insect weighing less than a paper clip. They fly south, sometimes two thousand miles, to a handful of mountain fir forests in central Mexico. There they cluster on the trees in numbers so thick that branches bend. What makes the journey stranger than it first seems is that no single butterfly makes the round trip. The monarchs that fly north in spring lay eggs and die along the way. Their great grandchildren are the ones who find those same Mexican forests the following winter, without ever having seen them.",
    prompt: 'Which statement best explains why the author calls the journey stranger than it first seems?',
    choices: [
      'The butterflies weigh less than a paper clip.',
      'The butterflies that reach Mexico have never been there before.',
      'The fir branches bend under the weight of the butterflies.',
      'The trip covers about two thousand miles.',
    ],
    answer: 1,
    explain:
      'Right after that phrase, the passage explains that no single butterfly makes the round trip and the great grandchildren find the forests without ever having seen them.',
    difficulty: 3,
  },
  {
    id: 'rc-011',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p06',
    passage:
      "For eighteen months in the 1860s, mail crossed the American West on horseback. A rider carried a locked leather pouch about seventy five miles, changing horses every ten or fifteen miles at small stations, then handed the pouch to the next rider. Together the riders moved a letter from Missouri to California in about ten days, less than half the time a stagecoach took. Riders were hired for being light, not large, because a heavy man slowed the horse. The Pony Express became famous almost at once, and it lost money almost as fast. When the telegraph reached California, the service closed for good.",
    prompt: 'As used in the passage, the word "pouch" most nearly means',
    choices: ['a locked room', 'a saddle', 'a small station', 'a bag'],
    answer: 3,
    explain:
      'The rider carries a locked leather pouch of mail and hands it to the next rider. Something you carry mail in and hand off is a bag.',
    difficulty: 1,
  },
  {
    id: 'rc-012',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p06',
    passage:
      "For eighteen months in the 1860s, mail crossed the American West on horseback. A rider carried a locked leather pouch about seventy five miles, changing horses every ten or fifteen miles at small stations, then handed the pouch to the next rider. Together the riders moved a letter from Missouri to California in about ten days, less than half the time a stagecoach took. Riders were hired for being light, not large, because a heavy man slowed the horse. The Pony Express became famous almost at once, and it lost money almost as fast. When the telegraph reached California, the service closed for good.",
    prompt: 'The passage suggests that the Pony Express closed because',
    choices: [
      'the telegraph could carry messages faster than any rider',
      'the riders became too heavy for the horses',
      'stagecoaches began making the trip in ten days',
      'California no longer wanted mail from Missouri',
    ],
    answer: 0,
    explain:
      'The passage ends by saying the service closed for good when the telegraph reached California. The new way of sending messages replaced the riders.',
    difficulty: 2,
  },
  {
    id: 'rc-013',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p07',
    passage:
      "Mateo had practiced the same eight measures for three weeks, and in his bedroom they sounded fine. In the band room, with Ms. Okafor waiting and twelve other kids listening, the trumpet felt slippery and strange. He squeaked the second note. Somebody near the drums made a small sound that might have been a laugh. Mateo stopped, lowered the horn, and stared at the music stand. Then he did the thing his grandfather always did when a car would not start. He waited, counted slowly to five, and tried again. The second time through, he did not miss a single note.",
    prompt: 'Why does Mateo count slowly to five before he plays again?',
    choices: [
      'He is waiting for Ms. Okafor to nod at him.',
      'He is giving himself a moment to settle down.',
      'He is trying to remember the next eight measures.',
      'He is listening for whoever made the laughing sound.',
    ],
    answer: 1,
    explain:
      'He copies what his grandfather did with a car that would not start: wait, then try again. The pause is to steady himself, and the second try goes well.',
    difficulty: 2,
  },
  {
    id: 'rc-014',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p07',
    passage:
      "Mateo had practiced the same eight measures for three weeks, and in his bedroom they sounded fine. In the band room, with Ms. Okafor waiting and twelve other kids listening, the trumpet felt slippery and strange. He squeaked the second note. Somebody near the drums made a small sound that might have been a laugh. Mateo stopped, lowered the horn, and stared at the music stand. Then he did the thing his grandfather always did when a car would not start. He waited, counted slowly to five, and tried again. The second time through, he did not miss a single note.",
    prompt: 'As used in the passage, the word "measures" most nearly means',
    choices: ['careful steps', 'rulers', 'short sections of music', 'hours of practice'],
    answer: 2,
    explain:
      'Mateo practices the same eight measures and later plays them all the way through on his trumpet, so measures must be pieces of the music.',
    difficulty: 2,
  },
  {
    id: 'rc-015',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p08',
    passage:
      "Bread dough rises because it is full of something alive. Yeast is a tiny fungus, so small that a spoonful of dry yeast holds billions of them. Mix yeast with flour and warm water and the cells begin to eat the sugars in the flour. As they eat, they release carbon dioxide gas. The stretchy web of gluten in the dough traps those bubbles, and the whole lump swells. Heat from the oven makes the trapped gas expand once more, then kills the yeast and hardens the dough around the bubbles. The holes you see in a slice of bread are old bubbles.",
    prompt: 'According to the passage, what makes bread dough swell?',
    choices: [
      'Carbon dioxide gas that the gluten traps',
      'Water soaking into the flour',
      'Heat that melts the sugars',
      'Yeast cells growing much larger',
    ],
    answer: 0,
    explain:
      'The passage says the yeast releases carbon dioxide gas and the stretchy gluten traps those bubbles, which makes the lump swell.',
    difficulty: 1,
  },
  {
    id: 'rc-016',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p08',
    passage:
      "Bread dough rises because it is full of something alive. Yeast is a tiny fungus, so small that a spoonful of dry yeast holds billions of them. Mix yeast with flour and warm water and the cells begin to eat the sugars in the flour. As they eat, they release carbon dioxide gas. The stretchy web of gluten in the dough traps those bubbles, and the whole lump swells. Heat from the oven makes the trapped gas expand once more, then kills the yeast and hardens the dough around the bubbles. The holes you see in a slice of bread are old bubbles.",
    prompt: 'The passage is mainly organized as',
    choices: [
      'a comparison of two kinds of bread',
      'an argument that homemade bread is better',
      "a story about a baker's morning",
      'the steps of a process, in the order they happen',
    ],
    answer: 3,
    explain:
      'The passage moves in order from mixing, to eating sugars, to trapped bubbles, to the oven, and finally to the holes in a finished slice.',
    difficulty: 2,
  },
  {
    id: 'rc-017',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p09',
    passage:
      "Thunder and lightning happen at the same moment, but you almost never see and hear them together. A lightning bolt heats the air around it to a temperature hotter than the surface of the sun. Air that hot explodes outward, and that blast of air is the sound we call thunder. Light travels so fast that the flash reaches your eyes almost instantly. Sound, by comparison, crawls along at about one mile every five seconds. So if you count five seconds between the flash and the rumble, the storm is roughly a mile away. A long, low growl usually means the bolt was far off.",
    prompt: 'According to the passage, if ten seconds pass between the flash and the thunder, the storm is about',
    choices: ['half a mile away', 'one mile away', 'two miles away', 'ten miles away'],
    answer: 2,
    explain:
      'Sound travels about one mile every five seconds, so ten seconds means the sound covered about two miles.',
    difficulty: 3,
  },
  {
    id: 'rc-018',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p09',
    passage:
      "Thunder and lightning happen at the same moment, but you almost never see and hear them together. A lightning bolt heats the air around it to a temperature hotter than the surface of the sun. Air that hot explodes outward, and that blast of air is the sound we call thunder. Light travels so fast that the flash reaches your eyes almost instantly. Sound, by comparison, crawls along at about one mile every five seconds. So if you count five seconds between the flash and the rumble, the storm is roughly a mile away. A long, low growl usually means the bolt was far off.",
    prompt: 'As used in the passage, the word "crawls" most nearly means',
    choices: ['moves on hands and knees', 'travels slowly', 'grows louder', 'bounces back'],
    answer: 1,
    explain:
      'The word describes sound compared with light, which arrives almost instantly. Crawls is being used to mean slow travel.',
    difficulty: 2,
  },
  {
    id: 'rc-019',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p10',
    passage:
      "Bessie Coleman wanted to fly at a time when no American flight school would teach a Black woman. So she learned French. In 1920 she sailed to Paris, spent seven months at a flying school there, and came home the next year with an international pilot's license that almost no one in the United States could match. Crowds paid to watch her loop and dive at air shows, and she used that attention to make a demand: she refused to perform anywhere that made Black and white audiences enter through separate gates. She died in a crash in 1926, still saving for a flight school of her own.",
    prompt: 'According to the passage, why did Bessie Coleman learn French?',
    choices: [
      'American flight schools would not teach her, so she trained in France.',
      'She wanted to perform at air shows in Paris.',
      'Her pilot license had to be written in French.',
      'Her family had already moved to France.',
    ],
    answer: 0,
    explain:
      'The passage says no American flight school would teach a Black woman, so she learned French and sailed to Paris to attend a flying school there.',
    difficulty: 1,
  },
  {
    id: 'rc-020',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p10',
    passage:
      "Bessie Coleman wanted to fly at a time when no American flight school would teach a Black woman. So she learned French. In 1920 she sailed to Paris, spent seven months at a flying school there, and came home the next year with an international pilot's license that almost no one in the United States could match. Crowds paid to watch her loop and dive at air shows, and she used that attention to make a demand: she refused to perform anywhere that made Black and white audiences enter through separate gates. She died in a crash in 1926, still saving for a flight school of her own.",
    prompt: 'The author includes the detail about separate gates mainly to show that Coleman',
    choices: [
      'knew a great deal about how air shows were run',
      'was an unusually careful pilot',
      'needed a flight school of her very own',
      'used her fame to push back against unfair treatment',
    ],
    answer: 3,
    explain:
      'The passage says she used the attention from the crowds to make a demand and refused to perform where audiences were separated. That is fame turned into pressure for fairness.',
    difficulty: 3,
  },
  {
    id: 'rc-021',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p11',
    passage:
      "The cafeteria at Bellhaven Middle had a rule nobody had ever written down: you sat where you sat on the first day, forever. Priya arrived in February. For two weeks she ate at the end of a table full of eighth graders who talked around her as though she were a lunch tray. On Thursday she noticed a boy at the next table drawing a dragon on the back of his math test, and it was a good dragon, with proper scales. Priya carried her tray over, sat down, and told him the wings were too small for that body. The boy grinned and handed her the pencil.",
    prompt: 'The passage suggests that Priya moved to the other table because',
    choices: [
      'the eighth graders told her to find another seat',
      'the drawing gave her something she knew how to talk about',
      'she needed to borrow a pencil for her math test',
      'the cafeteria rule said February students sat there',
    ],
    answer: 1,
    explain:
      'She notices the dragon has proper scales, then comments on the wings being too small. She knows the subject, and that gives her an opening.',
    difficulty: 2,
  },
  {
    id: 'rc-022',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p11',
    passage:
      "The cafeteria at Bellhaven Middle had a rule nobody had ever written down: you sat where you sat on the first day, forever. Priya arrived in February. For two weeks she ate at the end of a table full of eighth graders who talked around her as though she were a lunch tray. On Thursday she noticed a boy at the next table drawing a dragon on the back of his math test, and it was a good dragon, with proper scales. Priya carried her tray over, sat down, and told him the wings were too small for that body. The boy grinned and handed her the pencil.",
    prompt: 'As used in the passage, the phrase "talked around her" most nearly means',
    choices: [
      'spoke quietly so she could not hear',
      'argued with her about her lunch',
      'talked without including her',
      'explained the cafeteria rules to her',
    ],
    answer: 2,
    explain:
      'The passage says they talked around her as though she were a lunch tray, meaning they acted as if she were not a person in the conversation.',
    difficulty: 3,
  },
  {
    id: 'rc-023',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p12',
    passage:
      "A bicycle with gears lets a rider trade speed for strength. The chain sits on a ring of teeth at the pedals and on another ring at the back wheel. When the chain is on a small ring at the back wheel, one turn of the pedals spins the wheel many times, which is fast but hard to push. Shift the chain onto a large ring at the back wheel and one turn of the pedals moves the wheel less, so climbing a hill takes less force from your legs, though you go slowly. Nothing about the hill changes. The gears only change how the work is spread out.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Gears let a rider trade speed for force, but they do not change the hill.',
      'Large rings at the back wheel make a bicycle go faster than small ones.',
      'Climbing hills on a bicycle is mostly a matter of strong legs.',
      'A chain wears out faster on a bicycle that has many gears.',
    ],
    answer: 0,
    explain:
      'The passage opens by saying gears trade speed for strength and closes by saying nothing about the hill changes, only how the work is spread out.',
    difficulty: 3,
  },
  {
    id: 'rc-024',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p12',
    passage:
      "A bicycle with gears lets a rider trade speed for strength. The chain sits on a ring of teeth at the pedals and on another ring at the back wheel. When the chain is on a small ring at the back wheel, one turn of the pedals spins the wheel many times, which is fast but hard to push. Shift the chain onto a large ring at the back wheel and one turn of the pedals moves the wheel less, so climbing a hill takes less force from your legs, though you go slowly. Nothing about the hill changes. The gears only change how the work is spread out.",
    prompt: 'According to the passage, a rider starting up a steep hill should shift the chain onto',
    choices: [
      'a small ring at the back wheel',
      'a small ring at the pedals',
      'no ring at all',
      'a large ring at the back wheel',
    ],
    answer: 3,
    explain:
      'The passage says shifting onto a large ring at the back wheel makes climbing a hill take less force from your legs.',
    difficulty: 2,
  },
  {
    id: 'rc-025',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p13',
    passage:
      "An octopus can change color faster than you can blink, and it does it without any paint. Its skin holds millions of tiny sacs of pigment. Muscles around each sac squeeze it flat to show the color, or let it shrink to hide the color away. The octopus can also raise bumps on its skin to match the rough texture of a rock or a clump of coral. The odd part is that octopuses are almost certainly colorblind. Scientists think the animal reads the light and shadow around it with sensors in its skin, so it matches a background it cannot actually see.",
    prompt: 'According to the passage, an octopus shows a color when',
    choices: [
      'it raises bumps on its skin',
      'it swims into brighter light',
      'muscles squeeze a sac of pigment flat',
      'sensors in its skin release paint',
    ],
    answer: 2,
    explain:
      'The passage says muscles around each sac squeeze it flat to show the color, or let it shrink to hide it.',
    difficulty: 2,
  },
  {
    id: 'rc-026',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p13',
    passage:
      "An octopus can change color faster than you can blink, and it does it without any paint. Its skin holds millions of tiny sacs of pigment. Muscles around each sac squeeze it flat to show the color, or let it shrink to hide the color away. The octopus can also raise bumps on its skin to match the rough texture of a rock or a clump of coral. The odd part is that octopuses are almost certainly colorblind. Scientists think the animal reads the light and shadow around it with sensors in its skin, so it matches a background it cannot actually see.",
    prompt: 'The passage suggests that scientists find octopus camouflage puzzling because',
    choices: [
      'the animal matches colors it probably cannot see',
      'the animal changes color only at night',
      'no other animal is able to change its texture',
      'the sacs of pigment are too small to study',
    ],
    answer: 0,
    explain:
      'The passage calls it the odd part that octopuses are almost certainly colorblind, yet they match a background they cannot actually see.',
    difficulty: 3,
  },
  {
    id: 'rc-027',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p14',
    passage:
      "Ida Lewis was fifteen when her family moved into a lighthouse on a small rock in Newport Harbor. Her father soon became too ill to climb the stairs, so Ida trimmed the wick, filled the lamp with oil, and rowed her younger brothers to school in every kind of weather. She grew into the strongest rower in the harbor. Over about fifty years she pulled at least eighteen people out of the water, including four soldiers whose boat tipped over in a snowstorm. Newspapers of the day were amazed that a woman could handle a pair of oars so well. Ida seemed less amazed than they were.",
    prompt: 'The last sentence of the passage suggests that Ida Lewis',
    choices: [
      'was embarrassed by the newspaper stories about her',
      'wished that reporters would visit her more often',
      'was surprised by how strong she had become',
      'did not think her rowing skill was anything remarkable',
    ],
    answer: 3,
    explain:
      'Newspapers were amazed that a woman could row so well, and the passage says Ida seemed less amazed than they were. To her it was ordinary work.',
    difficulty: 2,
  },
  {
    id: 'rc-028',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p14',
    passage:
      "Ida Lewis was fifteen when her family moved into a lighthouse on a small rock in Newport Harbor. Her father soon became too ill to climb the stairs, so Ida trimmed the wick, filled the lamp with oil, and rowed her younger brothers to school in every kind of weather. She grew into the strongest rower in the harbor. Over about fifty years she pulled at least eighteen people out of the water, including four soldiers whose boat tipped over in a snowstorm. Newspapers of the day were amazed that a woman could handle a pair of oars so well. Ida seemed less amazed than they were.",
    prompt: 'According to the passage, Ida took over the lighthouse work because',
    choices: [
      'her brothers were too young to row the boat',
      'her father was too ill to climb the stairs',
      'the harbor asked her to replace the keeper',
      'newspapers offered to pay her for the story',
    ],
    answer: 1,
    explain:
      'The passage says her father soon became too ill to climb the stairs, so Ida trimmed the wick and filled the lamp herself.',
    difficulty: 1,
  },
  {
    id: 'rc-029',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p15',
    passage:
      "Grandma Ruth's tomato plants had taken her the whole spring, and by June they stood in neat green rows against the fence. Then Beans got out. When Jonah found him, the beagle was standing in the middle of row three, tail going like a flag, dirt on his nose, and one plant lying sideways with its roots in the air. Jonah's first idea was to blame the wind. His second idea, the one he actually used, was to fetch the trowel from the shed, set the plant upright, pack the soil down around it, water it, and then go inside and tell Grandma Ruth what had happened.",
    prompt: 'The passage suggests that Jonah decided to',
    choices: [
      'keep Beans out of the garden from then on',
      'blame the broken plant on the wind',
      'repair what he could and then tell the truth',
      'wait for Grandma Ruth to notice the damage herself',
    ],
    answer: 2,
    explain:
      'Blaming the wind was only his first idea. The idea he actually used was to replant and water the tomato, then go tell Grandma Ruth what happened.',
    difficulty: 2,
  },
  {
    id: 'rc-030',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p15',
    passage:
      "Grandma Ruth's tomato plants had taken her the whole spring, and by June they stood in neat green rows against the fence. Then Beans got out. When Jonah found him, the beagle was standing in the middle of row three, tail going like a flag, dirt on his nose, and one plant lying sideways with its roots in the air. Jonah's first idea was to blame the wind. His second idea, the one he actually used, was to fetch the trowel from the shed, set the plant upright, pack the soil down around it, water it, and then go inside and tell Grandma Ruth what had happened.",
    prompt: 'As used in the passage, the word "trowel" most nearly means',
    choices: [
      'a small hand tool for digging',
      'a large watering can',
      'a wooden stake',
      'a pair of garden gloves',
    ],
    answer: 0,
    explain:
      'Jonah fetches the trowel and then sets the plant upright and packs the soil down around it, so the trowel must be a digging tool.',
    difficulty: 3,
  },
  {
    id: 'rc-031',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p16',
    passage:
      "The moon does not make light. It shines because sunlight bounces off its gray, dusty surface. Half of the moon is always lit, the way half of a ball held near a lamp is always lit. What changes is how much of that lit half faces Earth. When the moon sits between Earth and the sun, the lit side points away from us and we see almost nothing, which we call a new moon. When Earth sits between the moon and the sun, we see the whole lit face, a full moon. The moon is not shrinking or growing. Our view of it is turning.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'The moon slowly grows and then shrinks each month.',
      'The moon makes a faint light of its own.',
      'Sunlight reaches the moon only at certain times of the month.',
      'The phases are changes in how much of the lit half we can see.',
    ],
    answer: 3,
    explain:
      'The passage says half the moon is always lit and what changes is how much of that lit half faces Earth. It ends by saying our view is what turns.',
    difficulty: 2,
  },
  {
    id: 'rc-032',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p16',
    passage:
      "The moon does not make light. It shines because sunlight bounces off its gray, dusty surface. Half of the moon is always lit, the way half of a ball held near a lamp is always lit. What changes is how much of that lit half faces Earth. When the moon sits between Earth and the sun, the lit side points away from us and we see almost nothing, which we call a new moon. When Earth sits between the moon and the sun, we see the whole lit face, a full moon. The moon is not shrinking or growing. Our view of it is turning.",
    prompt: 'The author compares the moon to a ball held near a lamp mainly to',
    choices: [
      'prove that the moon is the same size as a ball',
      'show that half of any round object near a light is always lit',
      'explain why the moon looks gray and dusty',
      'show how far the moon is from the sun',
    ],
    answer: 1,
    explain:
      'The comparison appears right after the statement that half of the moon is always lit, so it is there to make that idea easy to picture.',
    difficulty: 3,
  },
  {
    id: 'rc-033',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p17',
    passage:
      "A Venus flytrap grows in sandy ground so poor that its roots cannot find enough nitrogen, a nutrient every plant needs. So the plant gets nitrogen from meat instead. Each leaf ends in a pair of hinged pads lined with stiff hairs. One touch does nothing at all. If a second hair is brushed within about twenty seconds, the pads snap shut in less than a second and the stiff hairs cross like the bars of a cage. Waiting for that second touch keeps the trap from closing on a raindrop. Closing costs energy, and a leaf can only spring shut a few times before it dies.",
    prompt: 'According to the passage, the trap waits for a second touch so that',
    choices: [
      'it does not waste energy closing on something like a raindrop',
      'the stiff hairs have time to finish growing',
      'an insect has time to walk deeper inside',
      'the roots can search the soil for nitrogen first',
    ],
    answer: 0,
    explain:
      'The passage says waiting for the second touch keeps the trap from closing on a raindrop, and that closing costs the plant energy.',
    difficulty: 2,
  },
  {
    id: 'rc-034',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p17',
    passage:
      "A Venus flytrap grows in sandy ground so poor that its roots cannot find enough nitrogen, a nutrient every plant needs. So the plant gets nitrogen from meat instead. Each leaf ends in a pair of hinged pads lined with stiff hairs. One touch does nothing at all. If a second hair is brushed within about twenty seconds, the pads snap shut in less than a second and the stiff hairs cross like the bars of a cage. Waiting for that second touch keeps the trap from closing on a raindrop. Closing costs energy, and a leaf can only spring shut a few times before it dies.",
    prompt: 'As used in the passage, the word "poor" most nearly means',
    choices: [
      'having very little money',
      'poorly drained',
      'low in the nutrients plants need',
      'oddly shaped',
    ],
    answer: 2,
    explain:
      'The passage explains that in this ground the roots cannot find enough nitrogen, a nutrient every plant needs. Poor is describing the soil, not money.',
    difficulty: 3,
  },
  {
    id: 'rc-035',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p18',
    passage:
      "A compass needle is a small magnet balanced so that it can spin freely. Earth acts like a giant magnet too, with invisible lines of force running between the far north and the far south, so the needle swings until it lines up with them. That sounds simple enough, but a compass will lie to you if you let it. Hold it near a car door, a phone, or a steel belt buckle and the needle follows the nearer metal instead of the planet. Hikers learn to step away from their gear, hold the compass flat and level, and read it twice before trusting it.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'Magnets in Everyday Machines',
      'How a Compass Works and How It Can Be Fooled',
      'The Best Gear for a Long Hike',
      "Earth's Journey Around the Sun",
    ],
    answer: 1,
    explain:
      'The first half explains why the needle points north and the second half warns that nearby metal pulls it off. A good title covers both parts.',
    difficulty: 2,
  },
  {
    id: 'rc-036',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p18',
    passage:
      "A compass needle is a small magnet balanced so that it can spin freely. Earth acts like a giant magnet too, with invisible lines of force running between the far north and the far south, so the needle swings until it lines up with them. That sounds simple enough, but a compass will lie to you if you let it. Hold it near a car door, a phone, or a steel belt buckle and the needle follows the nearer metal instead of the planet. Hikers learn to step away from their gear, hold the compass flat and level, and read it twice before trusting it.",
    prompt: "The author's main purpose in the last sentence is to",
    choices: [
      'warn hikers that compasses are usually wrong',
      'explain how Earth became a magnet',
      'describe all the gear a hiker carries',
      'give advice for getting an accurate reading',
    ],
    answer: 3,
    explain:
      'The final sentence tells hikers to step away from gear, hold the compass level, and read it twice. Those are instructions for reading it correctly.',
    difficulty: 2,
  },
  {
    id: 'rc-037',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p19',
    passage:
      "No two snowflakes are alike, and the reason is the trip down. A flake begins as a speck of dust with a bit of water frozen onto it, high inside a cloud. As it falls, water vapor freezes onto its six corners. How fast the arms grow, and whether they come out as flat plates or long needles, depends on the exact temperature and dampness of every layer of air the flake passes through. Two flakes falling a few feet apart pass through slightly different air, so they end up with different shapes. What they share is six sides, always.",
    prompt: 'The passage suggests that the shape of a snowflake is a record of',
    choices: [
      'how long the flake took to melt',
      'the size of the dust speck at its center',
      'the air the flake passed through on its way down',
      'how many other flakes it bumped into',
    ],
    answer: 2,
    explain:
      'The passage says the arms grow differently depending on the temperature and dampness of every layer of air the flake falls through.',
    difficulty: 3,
  },
  {
    id: 'rc-038',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p19',
    passage:
      "No two snowflakes are alike, and the reason is the trip down. A flake begins as a speck of dust with a bit of water frozen onto it, high inside a cloud. As it falls, water vapor freezes onto its six corners. How fast the arms grow, and whether they come out as flat plates or long needles, depends on the exact temperature and dampness of every layer of air the flake passes through. Two flakes falling a few feet apart pass through slightly different air, so they end up with different shapes. What they share is six sides, always.",
    prompt: 'According to the passage, what do all snowflakes have in common?',
    choices: ['Six sides', 'Long needle arms', 'Exactly the same weight', 'Flat, plate-like shapes'],
    answer: 0,
    explain:
      'The last sentence says what they share is six sides, always. The plates and needles are the part that differs.',
    difficulty: 1,
  },
  {
    id: 'rc-039',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p20',
    passage:
      "Garrett Morgan left school after the sixth grade and taught himself by reading and by taking machines apart. In 1914 he patented a hood that pulled clean air from near the floor through a long tube, letting firefighters breathe inside a smoky building. Then, after watching a wagon and a car collide at a Cleveland corner, he built a traffic signal with a third position that stopped traffic in both directions at once, giving drivers a moment to clear the intersection. He sold that patent to a large company for forty thousand dollars. Morgan invented for a plain reason: he kept noticing dangers other people had learned to ignore.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Morgan grew wealthy by selling patents to large companies.',
      'Leaving school early can help an inventor think freely.',
      'Firefighting was dangerous work in 1914.',
      'Morgan invented by noticing everyday dangers other people ignored.',
    ],
    answer: 3,
    explain:
      'Both inventions come from a danger he noticed, smoke and a street corner crash, and the last sentence states that reason directly.',
    difficulty: 2,
  },
  {
    id: 'rc-040',
    subject: 'reading',
    kind: 'reading',
    passageId: 'p20',
    passage:
      "Garrett Morgan left school after the sixth grade and taught himself by reading and by taking machines apart. In 1914 he patented a hood that pulled clean air from near the floor through a long tube, letting firefighters breathe inside a smoky building. Then, after watching a wagon and a car collide at a Cleveland corner, he built a traffic signal with a third position that stopped traffic in both directions at once, giving drivers a moment to clear the intersection. He sold that patent to a large company for forty thousand dollars. Morgan invented for a plain reason: he kept noticing dangers other people had learned to ignore.",
    prompt: 'As used in the passage, the word "plain" most nearly means',
    choices: ['flat', 'simple', 'unattractive', 'public'],
    answer: 1,
    explain:
      'The passage says he invented for a plain reason and then gives one short, simple reason: he kept noticing problems others ignored.',
    difficulty: 3,
  },
];
