import type { Question } from './types';

export const READING_QUESTIONS_3: Question[] = [
  // ---- pb01 — The Dead Sea (geography) ----
  {
    id: 'rc3-001',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb01',
    passage:
      "The Dead Sea is not really a sea at all, but a large lake that sits at the lowest point of dry land on Earth. Its water is almost ten times saltier than the ocean. So much salt is packed into the water that swimmers cannot sink. A person can lie back on the surface and read a book without paddling at all. Almost nothing lives in water this salty, which is how the lake earned its gloomy name. Along its shores the salt dries into strange white towers and crusts that crunch under your shoes.",
    prompt: 'According to the passage, why can a swimmer float so easily in the Dead Sea?',
    choices: [
      'The lake is very shallow near the shore.',
      'The water holds so much salt that people cannot sink.',
      'The water is much warmer than ocean water.',
      'Swimmers there wear special floating belts.',
      'Waves keep pushing swimmers up to the surface.',
    ],
    answer: 1,
    explain:
      "The passage says so much salt is packed into the water that swimmers cannot sink. That is why a person floats.",
    difficulty: 1,
  },
  {
    id: 'rc3-002',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb01',
    passage:
      "The Dead Sea is not really a sea at all, but a large lake that sits at the lowest point of dry land on Earth. Its water is almost ten times saltier than the ocean. So much salt is packed into the water that swimmers cannot sink. A person can lie back on the surface and read a book without paddling at all. Almost nothing lives in water this salty, which is how the lake earned its gloomy name. Along its shores the salt dries into strange white towers and crusts that crunch under your shoes.",
    prompt: "As used in the passage, the word 'gloomy' most nearly means",
    choices: ['cheerful', 'crowded', 'sad or cheerless', 'salty', 'enormous'],
    answer: 2,
    explain:
      "The name is called gloomy because almost nothing can live in the water. A gloomy name is a sad, dismal one.",
    difficulty: 2,
  },
  {
    id: 'rc3-003',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb01',
    passage:
      "The Dead Sea is not really a sea at all, but a large lake that sits at the lowest point of dry land on Earth. Its water is almost ten times saltier than the ocean. So much salt is packed into the water that swimmers cannot sink. A person can lie back on the surface and read a book without paddling at all. Almost nothing lives in water this salty, which is how the lake earned its gloomy name. Along its shores the salt dries into strange white towers and crusts that crunch under your shoes.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'The Lake Where No One Can Sink',
      'How Salt Is Mined from the Sea',
      'The Warmest Water on Earth',
      'Swimming Safely in Deep Oceans',
      'Strange White Towers of Stone',
    ],
    answer: 0,
    explain:
      "The whole passage is about a lake so salty that people float and cannot sink. A good title has to capture that main idea.",
    difficulty: 2,
  },
  {
    id: 'rc3-004',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb01',
    passage:
      "The Dead Sea is not really a sea at all, but a large lake that sits at the lowest point of dry land on Earth. Its water is almost ten times saltier than the ocean. So much salt is packed into the water that swimmers cannot sink. A person can lie back on the surface and read a book without paddling at all. Almost nothing lives in water this salty, which is how the lake earned its gloomy name. Along its shores the salt dries into strange white towers and crusts that crunch under your shoes.",
    prompt: 'The passage suggests that few living things survive in the Dead Sea because',
    choices: [
      'the water is far too cold for them',
      'the shores are covered in sharp salt',
      'swimmers disturb them constantly',
      'the water is far too salty for them',
      'the lake sits below sea level',
    ],
    answer: 3,
    explain:
      "The passage says almost nothing lives in water this salty, so the extreme saltiness is what keeps living things out.",
    difficulty: 2,
  },

  // ---- pb02 — How rainbows form (earth science) ----
  {
    id: 'rc3-005',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb02',
    passage:
      "A rainbow is sunlight taken apart. White sunlight is really a blend of many colors mixed together. When light passes into a raindrop, it bends, bounces off the back of the drop, and bends again on the way out. Each color bends by a slightly different amount, so they leave the drop spread into a band instead of a single beam. That is why you only see a rainbow when the sun is behind you and rain is falling ahead. Every drop sends one color to your eye, and millions of drops together paint the whole arch across the sky.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Rainbows appear only just before it rains.',
      'A rainbow forms when raindrops split sunlight into its colors.',
      'White light is the only color a raindrop cannot bend.',
      'You can walk to the end of a rainbow if you try.',
      'Sunlight is really made of one pure color.',
    ],
    answer: 1,
    explain:
      "The passage explains that white sunlight is a blend of colors and that raindrops bend and spread those colors into a band. That is the main idea.",
    difficulty: 2,
  },
  {
    id: 'rc3-006',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb02',
    passage:
      "A rainbow is sunlight taken apart. White sunlight is really a blend of many colors mixed together. When light passes into a raindrop, it bends, bounces off the back of the drop, and bends again on the way out. Each color bends by a slightly different amount, so they leave the drop spread into a band instead of a single beam. That is why you only see a rainbow when the sun is behind you and rain is falling ahead. Every drop sends one color to your eye, and millions of drops together paint the whole arch across the sky.",
    prompt: 'According to the passage, you can see a rainbow when',
    choices: [
      'the sun is behind you and rain is falling ahead',
      'the sun is directly overhead at noon',
      'rain is falling behind you',
      'the sky is completely covered with clouds',
      'the sun has just finished setting',
    ],
    answer: 0,
    explain:
      "The passage says you only see a rainbow when the sun is behind you and rain is falling ahead of you.",
    difficulty: 1,
  },
  {
    id: 'rc3-007',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb02',
    passage:
      "A rainbow is sunlight taken apart. White sunlight is really a blend of many colors mixed together. When light passes into a raindrop, it bends, bounces off the back of the drop, and bends again on the way out. Each color bends by a slightly different amount, so they leave the drop spread into a band instead of a single beam. That is why you only see a rainbow when the sun is behind you and rain is falling ahead. Every drop sends one color to your eye, and millions of drops together paint the whole arch across the sky.",
    prompt: "As used in the passage, the word 'blend' most nearly means",
    choices: ['a bright beam', 'a mixture', 'a shadow', 'a single color', 'a raindrop'],
    answer: 1,
    explain:
      "The passage says white light is a blend of many colors mixed together, so a blend is a mixture.",
    difficulty: 2,
  },

  // ---- pb03 — The zipper (invention) ----
  {
    id: 'rc3-008',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb03',
    passage:
      "The zipper took almost twenty years to become useful. An early version appeared in the 1890s, but it jammed and popped open so often that few people trusted it. A Swedish engineer named Gideon Sundback kept working on the idea. In 1913 he designed rows of small metal teeth that locked together only when a slider pulled them into line. His design held tight yet slid open easily, and it did not burst apart. At first zippers were used mainly on boots and tobacco pouches. Only years later did clothing makers sew them into jackets and trousers, where we take them for granted today.",
    prompt: 'According to the passage, why did few people trust the early zipper?',
    choices: [
      'It was too expensive for most buyers.',
      'It was only sold in Sweden.',
      'It jammed and popped open often.',
      'It was too heavy to wear.',
      'It could be used only on boots.',
    ],
    answer: 2,
    explain:
      "The passage says the early version jammed and popped open so often that few people trusted it.",
    difficulty: 1,
  },
  {
    id: 'rc3-009',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb03',
    passage:
      "The zipper took almost twenty years to become useful. An early version appeared in the 1890s, but it jammed and popped open so often that few people trusted it. A Swedish engineer named Gideon Sundback kept working on the idea. In 1913 he designed rows of small metal teeth that locked together only when a slider pulled them into line. His design held tight yet slid open easily, and it did not burst apart. At first zippers were used mainly on boots and tobacco pouches. Only years later did clothing makers sew them into jackets and trousers, where we take them for granted today.",
    prompt: "According to the passage, Sundback's metal teeth locked together only when",
    choices: [
      'the cloth was pulled tight',
      'they were sewn onto a jacket',
      'the weather turned cold',
      'a slider pulled them into line',
      'they were pressed together by hand',
    ],
    answer: 3,
    explain:
      "The passage says his rows of teeth locked together only when a slider pulled them into line.",
    difficulty: 2,
  },
  {
    id: 'rc3-010',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb03',
    passage:
      "The zipper took almost twenty years to become useful. An early version appeared in the 1890s, but it jammed and popped open so often that few people trusted it. A Swedish engineer named Gideon Sundback kept working on the idea. In 1913 he designed rows of small metal teeth that locked together only when a slider pulled them into line. His design held tight yet slid open easily, and it did not burst apart. At first zippers were used mainly on boots and tobacco pouches. Only years later did clothing makers sew them into jackets and trousers, where we take them for granted today.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'The Long Road to a Zipper That Worked',
      'Why Boots Need Strong Fasteners',
      "A Swedish Engineer's Many Inventions",
      'How Clothing Is Made Today',
      'The Dangers of Metal Teeth',
    ],
    answer: 0,
    explain:
      "The passage traces how the zipper failed at first and slowly became useful over almost twenty years. A good title covers that long path to success.",
    difficulty: 2,
  },

  // ---- pb04 — The honeybee waggle dance (animal behavior) ----
  {
    id: 'rc3-011',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb04',
    passage:
      "When a honeybee finds a good patch of flowers, she flies home and tells the hive where it is by dancing. On the honeycomb she runs in a straight line while shaking her body, then loops back and does it again, tracing a shape like the number eight. The direction she waggles points the other bees toward the food, using the sun as a guide. The longer she waggles, the farther away the flowers are. Bees crowd around to feel the movements in the dark hive. In this way a single bee can send hundreds of others to a meal she found miles away.",
    prompt: 'According to the passage, the length of the waggle tells the other bees',
    choices: [
      'how many flowers there are',
      'how far away the flowers are',
      'which bee found the food',
      'what color the flowers are',
      'how sweet the food is',
    ],
    answer: 1,
    explain:
      "The passage says the longer she waggles, the farther away the flowers are.",
    difficulty: 2,
  },
  {
    id: 'rc3-012',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb04',
    passage:
      "When a honeybee finds a good patch of flowers, she flies home and tells the hive where it is by dancing. On the honeycomb she runs in a straight line while shaking her body, then loops back and does it again, tracing a shape like the number eight. The direction she waggles points the other bees toward the food, using the sun as a guide. The longer she waggles, the farther away the flowers are. Bees crowd around to feel the movements in the dark hive. In this way a single bee can send hundreds of others to a meal she found miles away.",
    prompt: 'To point the other bees in the right direction, the dancing bee uses',
    choices: ['the wind', 'the smell of the flowers', 'the sun', 'the shape of the honeycomb', 'the moon'],
    answer: 2,
    explain:
      "The passage says the direction she waggles points the bees toward the food, using the sun as a guide.",
    difficulty: 2,
  },
  {
    id: 'rc3-013',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb04',
    passage:
      "When a honeybee finds a good patch of flowers, she flies home and tells the hive where it is by dancing. On the honeycomb she runs in a straight line while shaking her body, then loops back and does it again, tracing a shape like the number eight. The direction she waggles points the other bees toward the food, using the sun as a guide. The longer she waggles, the farther away the flowers are. Bees crowd around to feel the movements in the dark hive. In this way a single bee can send hundreds of others to a meal she found miles away.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Honeybees can fly for miles without resting.',
      'Bees crowd together in the dark of the hive.',
      'A honeybee uses a dance to tell the hive where food is.',
      'Flowers usually grow far from most beehives.',
      'The number eight is important to bees.',
    ],
    answer: 2,
    explain:
      "The whole passage explains how a bee dances to share the direction and distance of food. That is the main idea.",
    difficulty: 1,
  },
  {
    id: 'rc3-014',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb04',
    passage:
      "When a honeybee finds a good patch of flowers, she flies home and tells the hive where it is by dancing. On the honeycomb she runs in a straight line while shaking her body, then loops back and does it again, tracing a shape like the number eight. The direction she waggles points the other bees toward the food, using the sun as a guide. The longer she waggles, the farther away the flowers are. Bees crowd around to feel the movements in the dark hive. In this way a single bee can send hundreds of others to a meal she found miles away.",
    prompt: "As used in the passage, the word 'patch' most nearly means",
    choices: ['a repair on cloth', 'a small area', 'a bright color', 'a kind of bee', 'a straight line'],
    answer: 1,
    explain:
      "A patch of flowers is a small area where flowers grow, since the bee flies out to it to gather food.",
    difficulty: 2,
  },

  // ---- pb05 — The invention of basketball (sports history) ----
  {
    id: 'rc3-015',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb05',
    passage:
      "In the winter of 1891, a teacher named James Naismith needed a game to keep his students busy indoors during the cold months in Massachusetts. He wanted something active but not rough, so players could not run while holding the ball. He nailed a peach basket to a railing at each end of the gym and wrote thirteen simple rules. Players tossed a soccer ball, trying to land it in the other team's basket. At first someone had to climb a ladder to fetch the ball after every score, because the peach basket still had its bottom. The new game was an instant success.",
    prompt: 'According to the passage, why did someone have to climb a ladder after each score?',
    choices: [
      'The basket was nailed too high on the wall.',
      'The players were not tall enough to reach.',
      'The soccer ball often got stuck on the railing.',
      'The peach basket still had its bottom in it.',
      'The rules required a referee up high.',
    ],
    answer: 3,
    explain:
      "The passage says someone had to fetch the ball after every score because the peach basket still had its bottom, so the ball could not fall through.",
    difficulty: 1,
  },
  {
    id: 'rc3-016',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb05',
    passage:
      "In the winter of 1891, a teacher named James Naismith needed a game to keep his students busy indoors during the cold months in Massachusetts. He wanted something active but not rough, so players could not run while holding the ball. He nailed a peach basket to a railing at each end of the gym and wrote thirteen simple rules. Players tossed a soccer ball, trying to land it in the other team's basket. At first someone had to climb a ladder to fetch the ball after every score, because the peach basket still had its bottom. The new game was an instant success.",
    prompt: 'The rule against running while holding the ball was meant to',
    choices: [
      'make the game faster to play',
      'help shorter players score',
      'save the peach baskets from damage',
      'keep the game from becoming rough',
      'give each team more players',
    ],
    answer: 3,
    explain:
      "The passage says Naismith wanted something active but not rough, and right after that it explains that players could not run while holding the ball. The rule was there to keep it from being rough.",
    difficulty: 3,
  },
  {
    id: 'rc3-017',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb05',
    passage:
      "In the winter of 1891, a teacher named James Naismith needed a game to keep his students busy indoors during the cold months in Massachusetts. He wanted something active but not rough, so players could not run while holding the ball. He nailed a peach basket to a railing at each end of the gym and wrote thirteen simple rules. Players tossed a soccer ball, trying to land it in the other team's basket. At first someone had to climb a ladder to fetch the ball after every score, because the peach basket still had its bottom. The new game was an instant success.",
    prompt: "As used in the passage, the word 'instant' most nearly means",
    choices: ['immediate', 'surprising', 'unfair', 'quiet', 'expensive'],
    answer: 0,
    explain:
      "An instant success is one that happens right away. The game caught on immediately.",
    difficulty: 2,
  },
  {
    id: 'rc3-018',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb05',
    passage:
      "In the winter of 1891, a teacher named James Naismith needed a game to keep his students busy indoors during the cold months in Massachusetts. He wanted something active but not rough, so players could not run while holding the ball. He nailed a peach basket to a railing at each end of the gym and wrote thirteen simple rules. Players tossed a soccer ball, trying to land it in the other team's basket. At first someone had to climb a ladder to fetch the ball after every score, because the peach basket still had its bottom. The new game was an instant success.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'The History of the Soccer Ball',
      'Winter Sports in Massachusetts',
      'The Thirteen Hardest Rules in Sports',
      'Why Peach Baskets Make Good Hoops',
      'How an Indoor Game Was Invented',
    ],
    answer: 4,
    explain:
      "The passage is about a teacher inventing a new indoor game with a ball and peach baskets. A good title names that.",
    difficulty: 2,
  },

  // ---- pb06 — The Lascaux cave paintings (art / history) ----
  {
    id: 'rc3-019',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb06',
    passage:
      "In 1940 four teenage boys in southern France followed their dog down a hole and found a cave whose walls were covered with paintings. Herds of horses, deer, and huge wild cattle raced across the stone in red, brown, and black. The pictures had been made by people about seventeen thousand years earlier, using ground minerals for paint and the bumps of the rock to give the animals shape. So many visitors came that their breath and warmth began to fade the ancient colors. To protect the real cave, France closed it and built an exact copy nearby for tourists to see.",
    prompt: 'According to the passage, why did France close the real cave?',
    choices: [
      'Thieves were stealing the ancient paint.',
      "The boys' dog had damaged the walls.",
      "Visitors' breath and warmth were fading the colors.",
      'The cave had become too dangerous to enter.',
      'A copy nearby was cheaper to keep open.',
    ],
    answer: 2,
    explain:
      "The passage says so many visitors came that their breath and warmth began to fade the colors, so France closed the cave to protect it.",
    difficulty: 1,
  },
  {
    id: 'rc3-020',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb06',
    passage:
      "In 1940 four teenage boys in southern France followed their dog down a hole and found a cave whose walls were covered with paintings. Herds of horses, deer, and huge wild cattle raced across the stone in red, brown, and black. The pictures had been made by people about seventeen thousand years earlier, using ground minerals for paint and the bumps of the rock to give the animals shape. So many visitors came that their breath and warmth began to fade the ancient colors. To protect the real cave, France closed it and built an exact copy nearby for tourists to see.",
    prompt: 'According to the passage, the ancient painters used the bumps of the rock to',
    choices: [
      'hide the paintings from view',
      'mix their colors together',
      'hold their torches steady',
      'give the animals shape',
      'mark where the cave ended',
    ],
    answer: 3,
    explain:
      "The passage says the painters used the bumps of the rock to give the animals shape.",
    difficulty: 2,
  },
  {
    id: 'rc3-021',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb06',
    passage:
      "In 1940 four teenage boys in southern France followed their dog down a hole and found a cave whose walls were covered with paintings. Herds of horses, deer, and huge wild cattle raced across the stone in red, brown, and black. The pictures had been made by people about seventeen thousand years earlier, using ground minerals for paint and the bumps of the rock to give the animals shape. So many visitors came that their breath and warmth began to fade the ancient colors. To protect the real cave, France closed it and built an exact copy nearby for tourists to see.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'A Cave of Ancient Paintings and How It Was Saved',
      'Four Boys and Their Clever Dog',
      'How to Make Paint from Minerals',
      'The Wild Animals of Ancient France',
      'Why Caves Are Dangerous to Explore',
    ],
    answer: 0,
    explain:
      "The passage tells how the painted cave was found and then how it had to be closed and copied to protect it. That is both parts of a good title.",
    difficulty: 2,
  },

  // ---- pb07 — Where chocolate comes from (food) ----
  {
    id: 'rc3-022',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb07',
    passage:
      "Chocolate begins as bitter seeds inside a melon-sized pod that grows right on the trunk of the cacao tree. The tree only thrives in the warm, wet band of the world near the equator. Workers cut the pods open and scoop out the seeds, which are wrapped in white pulp. The seeds are left in piles to ferment for several days, then dried in the sun, and it is during this stage that their chocolate flavor begins to develop. Only after roasting, grinding, and mixing with sugar do the seeds become the sweet bars we know. Raw cacao seeds taste so bitter that most people would spit them out.",
    prompt: 'According to the passage, where do cacao seeds grow?',
    choices: [
      'On the leaves of the tree',
      "Inside a pod on the tree's trunk",
      'Underground near the roots',
      "Inside the tree's flowers",
      'On low bushes near the equator',
    ],
    answer: 1,
    explain:
      "The passage says the seeds are inside a melon-sized pod that grows right on the trunk of the cacao tree.",
    difficulty: 1,
  },
  {
    id: 'rc3-023',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb07',
    passage:
      "Chocolate begins as bitter seeds inside a melon-sized pod that grows right on the trunk of the cacao tree. The tree only thrives in the warm, wet band of the world near the equator. Workers cut the pods open and scoop out the seeds, which are wrapped in white pulp. The seeds are left in piles to ferment for several days, then dried in the sun, and it is during this stage that their chocolate flavor begins to develop. Only after roasting, grinding, and mixing with sugar do the seeds become the sweet bars we know. Raw cacao seeds taste so bitter that most people would spit them out.",
    prompt: "According to the passage, the seeds' chocolate flavor begins to develop when they are",
    choices: [
      'cut from the pod',
      'roasted and ground',
      'fermented and dried in the sun',
      'mixed with sugar',
      'wrapped in white pulp',
    ],
    answer: 2,
    explain:
      "The passage says the flavor begins to develop during the stage when the seeds ferment and then dry in the sun.",
    difficulty: 2,
  },
  {
    id: 'rc3-024',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb07',
    passage:
      "Chocolate begins as bitter seeds inside a melon-sized pod that grows right on the trunk of the cacao tree. The tree only thrives in the warm, wet band of the world near the equator. Workers cut the pods open and scoop out the seeds, which are wrapped in white pulp. The seeds are left in piles to ferment for several days, then dried in the sun, and it is during this stage that their chocolate flavor begins to develop. Only after roasting, grinding, and mixing with sugar do the seeds become the sweet bars we know. Raw cacao seeds taste so bitter that most people would spit them out.",
    prompt: 'The passage suggests that a seed taken straight from the pod would taste',
    choices: ['sweet like candy', 'sour like lemon', 'salty', 'very bitter', 'like nothing at all'],
    answer: 3,
    explain:
      "The passage says raw cacao seeds taste so bitter that most people would spit them out, and the sweetness comes only after later steps.",
    difficulty: 2,
  },
  {
    id: 'rc3-025',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb07',
    passage:
      "Chocolate begins as bitter seeds inside a melon-sized pod that grows right on the trunk of the cacao tree. The tree only thrives in the warm, wet band of the world near the equator. Workers cut the pods open and scoop out the seeds, which are wrapped in white pulp. The seeds are left in piles to ferment for several days, then dried in the sun, and it is during this stage that their chocolate flavor begins to develop. Only after roasting, grinding, and mixing with sugar do the seeds become the sweet bars we know. Raw cacao seeds taste so bitter that most people would spit them out.",
    prompt: "As used in the passage, the word 'thrives' most nearly means",
    choices: ['grows well', 'dies quickly', 'stays small', 'spreads seeds', 'changes color'],
    answer: 0,
    explain:
      "The tree thrives only in the warm, wet band near the equator, meaning that is where it grows well.",
    difficulty: 2,
  },

  // ---- pb08 — The high diving board (narrative) ----
  {
    id: 'rc3-026',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb08',
    passage:
      "The high board had never looked so far up. Dolores climbed the ladder one cold rung at a time, telling herself she could always turn around at the top. When she got there, the pool below looked small and very blue. Two younger kids waited behind her on the ladder. She thought about the whole summer she had spent watching from a towel, and about how tired she was of only watching. She curled her toes over the edge, counted to three the way her brother had taught her, and stepped off before the fear could talk her out of it. The splash swallowed her whole.",
    prompt: 'Why does Dolores step off before the fear could talk her out of it?',
    choices: [
      'She is worried the other kids will push her.',
      'She hears her brother calling her name.',
      'She is afraid she will lose her nerve if she waits.',
      'She wants to make the biggest splash she can.',
      'She is trying to beat the two kids behind her.',
    ],
    answer: 2,
    explain:
      "She has been nervous the whole climb and tired of only watching, so she jumps quickly before her fear can change her mind.",
    difficulty: 2,
  },
  {
    id: 'rc3-027',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb08',
    passage:
      "The high board had never looked so far up. Dolores climbed the ladder one cold rung at a time, telling herself she could always turn around at the top. When she got there, the pool below looked small and very blue. Two younger kids waited behind her on the ladder. She thought about the whole summer she had spent watching from a towel, and about how tired she was of only watching. She curled her toes over the edge, counted to three the way her brother had taught her, and stepped off before the fear could talk her out of it. The splash swallowed her whole.",
    prompt: 'According to the passage, what had Dolores done for most of the summer?',
    choices: [
      'Practiced diving every day',
      'Watched the pool from a towel',
      'Climbed the high board often',
      'Taught her brother to swim',
      'Waited in line at the ladder',
    ],
    answer: 1,
    explain:
      "The passage says she thought about the whole summer she had spent watching from a towel.",
    difficulty: 1,
  },
  {
    id: 'rc3-028',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb08',
    passage:
      "The high board had never looked so far up. Dolores climbed the ladder one cold rung at a time, telling herself she could always turn around at the top. When she got there, the pool below looked small and very blue. Two younger kids waited behind her on the ladder. She thought about the whole summer she had spent watching from a towel, and about how tired she was of only watching. She curled her toes over the edge, counted to three the way her brother had taught her, and stepped off before the fear could talk her out of it. The splash swallowed her whole.",
    prompt: "As used in the passage, the word 'rung' most nearly means",
    choices: ['a bell sound', 'a cold morning', 'a rope', 'a step of the ladder', 'a diving board'],
    answer: 3,
    explain:
      "She climbs the ladder one cold rung at a time, so a rung is one step of the ladder.",
    difficulty: 2,
  },

  // ---- pb09 — The Great Wall of China (geography / landmarks) ----
  {
    id: 'rc3-029',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb09',
    passage:
      "The Great Wall of China is not one single wall but many walls, built and rebuilt over hundreds of years by different rulers. Stretched end to end, its many sections would run for thousands of miles across mountains and deserts. Workers used whatever the land offered, packing earth in some places and cutting stone in others. The wall was meant to slow down armies on horseback from the north, giving guards in the towers time to light signal fires and warn the next tower. Despite a popular myth, the wall cannot actually be seen from the moon with the naked eye.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'The Great Wall can easily be seen from the moon.',
      'The Great Wall was built in a single year by one ruler.',
      'The Great Wall is made only of cut stone.',
      'The Great Wall is really many walls built over centuries to defend the north.',
      'The Great Wall crosses mostly flat farmland.',
    ],
    answer: 3,
    explain:
      "The passage explains that the wall is many walls, built over hundreds of years, meant to slow armies from the north. That is the main idea.",
    difficulty: 2,
  },
  {
    id: 'rc3-030',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb09',
    passage:
      "The Great Wall of China is not one single wall but many walls, built and rebuilt over hundreds of years by different rulers. Stretched end to end, its many sections would run for thousands of miles across mountains and deserts. Workers used whatever the land offered, packing earth in some places and cutting stone in others. The wall was meant to slow down armies on horseback from the north, giving guards in the towers time to light signal fires and warn the next tower. Despite a popular myth, the wall cannot actually be seen from the moon with the naked eye.",
    prompt: 'According to the passage, the signal fires were used to',
    choices: [
      'warn the next tower of an attack',
      'keep the guards warm at night',
      'light the path for travelers',
      'melt snow off the wall',
      'celebrate a victory',
    ],
    answer: 0,
    explain:
      "The passage says the fires gave guards time to warn the next tower, so they were a way to pass an alarm along.",
    difficulty: 2,
  },
  {
    id: 'rc3-031',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb09',
    passage:
      "The Great Wall of China is not one single wall but many walls, built and rebuilt over hundreds of years by different rulers. Stretched end to end, its many sections would run for thousands of miles across mountains and deserts. Workers used whatever the land offered, packing earth in some places and cutting stone in others. The wall was meant to slow down armies on horseback from the north, giving guards in the towers time to light signal fires and warn the next tower. Despite a popular myth, the wall cannot actually be seen from the moon with the naked eye.",
    prompt: 'The author mentions the moon mainly to',
    choices: [
      'explain how tall the wall is',
      'show how far the wall stretches',
      'prove the wall took centuries to build',
      'describe the view from the towers',
      'correct a popular but false belief',
    ],
    answer: 4,
    explain:
      "The last sentence points out that, despite a popular myth, the wall cannot really be seen from the moon. The author brings up the moon to correct that false belief.",
    difficulty: 3,
  },

  // ---- pb10 — How hurricanes work (weather) ----
  {
    id: 'rc3-032',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb10',
    passage:
      "A hurricane is a giant engine that runs on warm ocean water. As the sea heats up in late summer, water evaporates and rises, and as that moist air climbs and cools, it releases heat that powers even stronger winds. The whole storm begins to spin, wrapping bands of rain around a strangely calm center called the eye. Inside the eye the wind drops and the sky may even clear, which fools some people into thinking the storm has passed. Then the far wall of the eye arrives and the fierce winds return from the opposite direction. A hurricane weakens quickly once it moves over land.",
    prompt: 'According to the passage, a hurricane runs on',
    choices: ['cold ocean water', 'strong winds from land', 'warm ocean water', 'heavy winter snow', 'dry desert air'],
    answer: 2,
    explain:
      "The first sentence says a hurricane is a giant engine that runs on warm ocean water.",
    difficulty: 1,
  },
  {
    id: 'rc3-033',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb10',
    passage:
      "A hurricane is a giant engine that runs on warm ocean water. As the sea heats up in late summer, water evaporates and rises, and as that moist air climbs and cools, it releases heat that powers even stronger winds. The whole storm begins to spin, wrapping bands of rain around a strangely calm center called the eye. Inside the eye the wind drops and the sky may even clear, which fools some people into thinking the storm has passed. Then the far wall of the eye arrives and the fierce winds return from the opposite direction. A hurricane weakens quickly once it moves over land.",
    prompt: 'Why might people wrongly think the storm has passed?',
    choices: [
      'The rain bands never reach the shore.',
      'Hurricanes always weaken at night.',
      'The wind blows from only one direction.',
      'The calm eye passes over them for a while.',
      'They can no longer hear any thunder.',
    ],
    answer: 3,
    explain:
      "The passage says the calm eye, where the wind drops and the sky may clear, fools some people into thinking the storm has passed.",
    difficulty: 3,
  },
  {
    id: 'rc3-034',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb10',
    passage:
      "A hurricane is a giant engine that runs on warm ocean water. As the sea heats up in late summer, water evaporates and rises, and as that moist air climbs and cools, it releases heat that powers even stronger winds. The whole storm begins to spin, wrapping bands of rain around a strangely calm center called the eye. Inside the eye the wind drops and the sky may even clear, which fools some people into thinking the storm has passed. Then the far wall of the eye arrives and the fierce winds return from the opposite direction. A hurricane weakens quickly once it moves over land.",
    prompt: "As used in the passage, the word 'fierce' most nearly means",
    choices: ['gentle', 'warm', 'violent and strong', 'brief', 'distant'],
    answer: 2,
    explain:
      "The fierce winds return after the eye and are described as powerful, so fierce means violent and strong.",
    difficulty: 2,
  },

  // ---- pb11 — How Velcro was invented (invention) ----
  {
    id: 'rc3-035',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb11',
    passage:
      "In 1941 a Swiss engineer named George de Mestral came back from a walk with burrs stuck all over his socks and his dog's fur. Instead of just picking them off, he looked at one under a microscope. Each burr was covered with tiny hooks that grabbed the loops in the cloth. That gave him an idea: what if a fastener copied the burr? It took him years to figure out how to make thousands of little hooks and loops out of nylon. The result was Velcro, two strips that press together and pull apart with a loud rip. Nature had solved the problem first.",
    prompt: 'According to the passage, what did de Mestral see under the microscope?',
    choices: [
      'Seeds waiting to sprout',
      'Threads of nylon stretched thin',
      'His dog fur turning into cloth',
      'Small magnets pulling on his socks',
      'Tiny hooks on the burr grabbing loops of cloth',
    ],
    answer: 4,
    explain:
      "The passage says each burr was covered with tiny hooks that grabbed the loops in the cloth, which is what he saw under the microscope.",
    difficulty: 2,
  },
  {
    id: 'rc3-036',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb11',
    passage:
      "In 1941 a Swiss engineer named George de Mestral came back from a walk with burrs stuck all over his socks and his dog's fur. Instead of just picking them off, he looked at one under a microscope. Each burr was covered with tiny hooks that grabbed the loops in the cloth. That gave him an idea: what if a fastener copied the burr? It took him years to figure out how to make thousands of little hooks and loops out of nylon. The result was Velcro, two strips that press together and pull apart with a loud rip. Nature had solved the problem first.",
    prompt: "The sentence 'Nature had solved the problem first' means that",
    choices: [
      'the burr already used the hook-and-loop idea before he did',
      'plants are smarter than any engineer',
      'de Mestral copied the design from another inventor',
      'burrs are harmful to socks and to dogs',
      'nylon is really made from a wild plant',
    ],
    answer: 0,
    explain:
      "The burr's hooks grabbing loops is exactly the idea Velcro copied. So nature had already invented that solution before he did.",
    difficulty: 3,
  },
  {
    id: 'rc3-037',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb11',
    passage:
      "In 1941 a Swiss engineer named George de Mestral came back from a walk with burrs stuck all over his socks and his dog's fur. Instead of just picking them off, he looked at one under a microscope. Each burr was covered with tiny hooks that grabbed the loops in the cloth. That gave him an idea: what if a fastener copied the burr? It took him years to figure out how to make thousands of little hooks and loops out of nylon. The result was Velcro, two strips that press together and pull apart with a loud rip. Nature had solved the problem first.",
    prompt: "As used in the passage, the word 'fastener' most nearly means",
    choices: [
      'a fast runner',
      'a kind of plant',
      'a walk in the woods',
      'something that holds two things together',
      'a small tool for sewing',
    ],
    answer: 3,
    explain:
      "A fastener copies the burr and becomes two strips that press together, so a fastener is something that holds two things together.",
    difficulty: 1,
  },
  {
    id: 'rc3-038',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb11',
    passage:
      "In 1941 a Swiss engineer named George de Mestral came back from a walk with burrs stuck all over his socks and his dog's fur. Instead of just picking them off, he looked at one under a microscope. Each burr was covered with tiny hooks that grabbed the loops in the cloth. That gave him an idea: what if a fastener copied the burr? It took him years to figure out how to make thousands of little hooks and loops out of nylon. The result was Velcro, two strips that press together and pull apart with a loud rip. Nature had solved the problem first.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'The Dangers of Burrs to Dogs',
      'How Nylon Is Made in a Factory',
      'How a Walk in the Woods Led to Velcro',
      'The Best Way to Clean Your Socks',
      'A History of Swiss Engineers',
    ],
    answer: 2,
    explain:
      "The passage tells how a walk that left burrs on his socks gave de Mestral the idea for Velcro. A good title names that story.",
    difficulty: 2,
  },

  // ---- pb12 — How emperor penguins survive the cold (animal behavior) ----
  {
    id: 'rc3-039',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb12',
    passage:
      "Emperor penguins raise their chicks through the coldest winter on Earth, out on the open ice of Antarctica, where the wind can howl far below freezing. To survive, the birds crowd together into a tight huddle, sometimes thousands of them at once, sharing their warmth. The penguins on the outside take the worst of the wind, so the whole group slowly shuffles in a spiral, moving those cold birds toward the middle and sending warmer ones out to take a turn. No single penguin stays cold or warm for long. By trading places again and again, the flock keeps everyone alive through months of darkness.",
    prompt: 'According to the passage, how do the penguins keep the outer birds from freezing?',
    choices: [
      'They flap their wings hard for warmth.',
      'They take turns sitting on the eggs.',
      'The huddle shuffles so birds trade places toward the middle.',
      'They swim in the ocean to warm up.',
      'They build walls of ice to block the wind.',
    ],
    answer: 2,
    explain:
      "The passage says the group shuffles in a spiral, moving cold outer birds toward the warm middle and sending warmer ones out.",
    difficulty: 2,
  },
  {
    id: 'rc3-040',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb12',
    passage:
      "Emperor penguins raise their chicks through the coldest winter on Earth, out on the open ice of Antarctica, where the wind can howl far below freezing. To survive, the birds crowd together into a tight huddle, sometimes thousands of them at once, sharing their warmth. The penguins on the outside take the worst of the wind, so the whole group slowly shuffles in a spiral, moving those cold birds toward the middle and sending warmer ones out to take a turn. No single penguin stays cold or warm for long. By trading places again and again, the flock keeps everyone alive through months of darkness.",
    prompt: 'The passage suggests that a single penguin left alone in the storm would',
    choices: [
      'be far more likely to freeze',
      'find food more easily',
      'stay warmer than the group',
      'shuffle in a spiral by itself',
      'sleep through the whole winter',
    ],
    answer: 0,
    explain:
      "The penguins survive by sharing warmth in a huddle. One penguin with no group to share heat would have a much harder time staying warm.",
    difficulty: 2,
  },
  {
    id: 'rc3-041',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb12',
    passage:
      "Emperor penguins raise their chicks through the coldest winter on Earth, out on the open ice of Antarctica, where the wind can howl far below freezing. To survive, the birds crowd together into a tight huddle, sometimes thousands of them at once, sharing their warmth. The penguins on the outside take the worst of the wind, so the whole group slowly shuffles in a spiral, moving those cold birds toward the middle and sending warmer ones out to take a turn. No single penguin stays cold or warm for long. By trading places again and again, the flock keeps everyone alive through months of darkness.",
    prompt: "As used in the passage, the word 'shuffles' most nearly means",
    choices: ['mixes cards', 'sings loudly', 'flies in circles', 'moves with small steps', 'stands perfectly still'],
    answer: 3,
    explain:
      "The huddle shuffles in a slow spiral, meaning the birds move together with small steps.",
    difficulty: 2,
  },

  // ---- pb13 — Where the marathon comes from (sports history) ----
  {
    id: 'rc3-042',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb13',
    passage:
      "The race we call the marathon is named after a battle. According to an old story, in the year 490 BC the Greeks defeated a much larger army near the town of Marathon. A messenger named Pheidippides is said to have run all the way to Athens, about twenty-five miles, to announce the victory. Legend claims he gasped out the news and then collapsed. When the modern Olympic Games began in 1896, the organizers added a long race to honor that famous run. Today a marathon is a fixed distance of just over twenty-six miles, and runners train for months to finish one.",
    prompt: 'According to the passage, why did the messenger run to Athens?',
    choices: [
      'To warn of a coming army',
      'To ask the city for more soldiers',
      'To deliver a private letter',
      'To announce the victory',
      'To win an Olympic race',
    ],
    answer: 3,
    explain:
      "The passage says the messenger ran all the way to Athens to announce the victory.",
    difficulty: 1,
  },
  {
    id: 'rc3-043',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb13',
    passage:
      "The race we call the marathon is named after a battle. According to an old story, in the year 490 BC the Greeks defeated a much larger army near the town of Marathon. A messenger named Pheidippides is said to have run all the way to Athens, about twenty-five miles, to announce the victory. Legend claims he gasped out the news and then collapsed. When the modern Olympic Games began in 1896, the organizers added a long race to honor that famous run. Today a marathon is a fixed distance of just over twenty-six miles, and runners train for months to finish one.",
    prompt: 'According to the passage, the marathon race is named after',
    choices: [
      'a famous runner',
      'an ancient king',
      'the town where a battle was fought',
      'the city of Athens',
      'the first Olympic Games',
    ],
    answer: 2,
    explain:
      "The passage says the race is named after a battle fought near the town of Marathon.",
    difficulty: 2,
  },
  {
    id: 'rc3-044',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb13',
    passage:
      "The race we call the marathon is named after a battle. According to an old story, in the year 490 BC the Greeks defeated a much larger army near the town of Marathon. A messenger named Pheidippides is said to have run all the way to Athens, about twenty-five miles, to announce the victory. Legend claims he gasped out the news and then collapsed. When the modern Olympic Games began in 1896, the organizers added a long race to honor that famous run. Today a marathon is a fixed distance of just over twenty-six miles, and runners train for months to finish one.",
    prompt: "As used in the passage, the word 'collapsed' most nearly means",
    choices: ['shouted', 'ran faster', 'turned back', 'fell down', 'grew slowly tired'],
    answer: 3,
    explain:
      "After gasping out the news, the exhausted messenger collapsed, meaning he suddenly fell down.",
    difficulty: 2,
  },
  {
    id: 'rc3-045',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb13',
    passage:
      "The race we call the marathon is named after a battle. According to an old story, in the year 490 BC the Greeks defeated a much larger army near the town of Marathon. A messenger named Pheidippides is said to have run all the way to Athens, about twenty-five miles, to announce the victory. Legend claims he gasped out the news and then collapsed. When the modern Olympic Games began in 1896, the organizers added a long race to honor that famous run. Today a marathon is a fixed distance of just over twenty-six miles, and runners train for months to finish one.",
    prompt: "The author uses phrases like 'according to an old story' and 'legend claims' mainly to show that",
    choices: [
      'the tale may not be completely true',
      'the messenger was a famous liar',
      'the battle never really happened',
      'the race is longer than it should be',
      'Greece kept careful written records',
    ],
    answer: 0,
    explain:
      "Words like legend and old story are signals that a tale is passed down and not proven, so the author is hinting the run may not be exact history.",
    difficulty: 3,
  },

  // ---- pb14 — The steel drum of Trinidad (music) ----
  {
    id: 'rc3-046',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb14',
    passage:
      "The steel drum is one of the few musical instruments invented in the twentieth century, and it was born on the island of Trinidad. In the 1930s and 1940s, people there wanted to make music for street parades but had little money for instruments. They discovered that the metal of an empty oil barrel could be hammered into a shallow bowl and tuned. By pounding dents of different sizes into the surface, a maker could shape the notes, and each dent rang out with its own pitch. Bands of these bright, shimmering drums soon filled the streets, and their sound spread around the world.",
    prompt: 'According to the passage, the first steel drums were made from',
    choices: ['old ship bells', 'sheets of tin roofing', 'empty oil barrels', 'large cooking pots', 'car engine parts'],
    answer: 2,
    explain:
      "The passage says people discovered that the metal of an empty oil barrel could be hammered into a bowl and tuned.",
    difficulty: 1,
  },
  {
    id: 'rc3-047',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb14',
    passage:
      "The steel drum is one of the few musical instruments invented in the twentieth century, and it was born on the island of Trinidad. In the 1930s and 1940s, people there wanted to make music for street parades but had little money for instruments. They discovered that the metal of an empty oil barrel could be hammered into a shallow bowl and tuned. By pounding dents of different sizes into the surface, a maker could shape the notes, and each dent rang out with its own pitch. Bands of these bright, shimmering drums soon filled the streets, and their sound spread around the world.",
    prompt: 'The passage suggests that people made drums from barrels because',
    choices: [
      'barrels sounded better than any other instrument',
      'the government told them to recycle',
      'barrels were easy to carry in parades',
      'they had little money for regular instruments',
      'no one knew how to play other instruments',
    ],
    answer: 3,
    explain:
      "The passage says people wanted music for parades but had little money for instruments, so they turned an empty barrel into one.",
    difficulty: 2,
  },
  {
    id: 'rc3-048',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb14',
    passage:
      "The steel drum is one of the few musical instruments invented in the twentieth century, and it was born on the island of Trinidad. In the 1930s and 1940s, people there wanted to make music for street parades but had little money for instruments. They discovered that the metal of an empty oil barrel could be hammered into a shallow bowl and tuned. By pounding dents of different sizes into the surface, a maker could shape the notes, and each dent rang out with its own pitch. Bands of these bright, shimmering drums soon filled the streets, and their sound spread around the world.",
    prompt: "As used in the passage, the word 'pitch' most nearly means",
    choices: [
      'how high or low a note sounds',
      'a sticky black tar',
      'how loud a note is',
      'a throw of a ball',
      'the size of a dent',
    ],
    answer: 0,
    explain:
      "Each dent rang out with its own pitch, meaning its own note. In music, pitch is how high or low a note sounds.",
    difficulty: 2,
  },

  // ---- pb15 — Where vanilla comes from (food) ----
  {
    id: 'rc3-049',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb15',
    passage:
      "Vanilla comes from the seed pod of an orchid, and it may be the most labor-heavy flavor in the world. The vanilla orchid blooms for only one day, and in most places no local insect can pollinate it. So each flower must be pollinated by hand, one at a time, using a thin stick to move the pollen. Even then, the green pods must be picked, dipped in hot water, and then dried and sweated for months before they smell like vanilla at all. All that careful handwork is the reason real vanilla costs so much more than the artificial kind.",
    prompt: 'According to the passage, why must each vanilla flower be pollinated by hand?',
    choices: [
      'The flowers are too high to reach any other way.',
      'The pollen is poisonous to insects.',
      'In most places no local insect can pollinate it.',
      'Machines do the job too quickly.',
      'The flowers bloom only at night.',
    ],
    answer: 2,
    explain:
      "The passage says in most places no local insect can pollinate the orchid, so each flower must be pollinated by hand.",
    difficulty: 2,
  },
  {
    id: 'rc3-050',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb15',
    passage:
      "Vanilla comes from the seed pod of an orchid, and it may be the most labor-heavy flavor in the world. The vanilla orchid blooms for only one day, and in most places no local insect can pollinate it. So each flower must be pollinated by hand, one at a time, using a thin stick to move the pollen. Even then, the green pods must be picked, dipped in hot water, and then dried and sweated for months before they smell like vanilla at all. All that careful handwork is the reason real vanilla costs so much more than the artificial kind.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Vanilla orchids bloom for only one day.',
      'Artificial vanilla tastes exactly like the real kind.',
      'Orchids are the most beautiful flowers in the world.',
      'Real vanilla is costly because it takes so much careful handwork.',
      'Insects are important to every kind of crop.',
    ],
    answer: 3,
    explain:
      "The passage lists all the hand labor vanilla takes and ends by saying that is why real vanilla costs so much. That is the main idea.",
    difficulty: 2,
  },
  {
    id: 'rc3-051',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb15',
    passage:
      "Vanilla comes from the seed pod of an orchid, and it may be the most labor-heavy flavor in the world. The vanilla orchid blooms for only one day, and in most places no local insect can pollinate it. So each flower must be pollinated by hand, one at a time, using a thin stick to move the pollen. Even then, the green pods must be picked, dipped in hot water, and then dried and sweated for months before they smell like vanilla at all. All that careful handwork is the reason real vanilla costs so much more than the artificial kind.",
    prompt: "As used in the passage, the phrase 'labor-heavy' most nearly means",
    choices: [
      'requiring a lot of work',
      'very heavy to lift',
      'grown on a large farm',
      'sold at a low price',
      'sweet to the taste',
    ],
    answer: 0,
    explain:
      "The passage calls vanilla labor-heavy and then lists all the hand pollinating, drying, and sweating it needs, so labor-heavy means it takes a lot of work.",
    difficulty: 2,
  },

  // ---- pb16 — The science fair volcano (narrative) ----
  {
    id: 'rc3-052',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb16',
    passage:
      "Owen's volcano looked perfect until the judges walked up. He had painted the plaster mountain for a week and hidden the little cup inside. Now his hands shook as he poured in the vinegar. Nothing happened. He had forgotten the baking soda entirely, and the box sat in plain sight beside his poster. A younger judge raised one eyebrow. Owen felt his ears go hot. Then he took a breath, held up the box, and explained exactly what baking soda and vinegar do and why his volcano needed both. The judges wrote for a long time. Owen was not sure that was a bad sign.",
    prompt: "According to the passage, why did Owen's volcano fail to erupt at first?",
    choices: [
      'He poured in far too much vinegar.',
      'The plaster mountain was still wet.',
      'The little cup had a hole in it.',
      'He forgot to add the baking soda.',
      'A judge bumped the table.',
    ],
    answer: 3,
    explain:
      "The passage says he had forgotten the baking soda entirely, so the reaction that makes the volcano erupt could not happen.",
    difficulty: 2,
  },
  {
    id: 'rc3-053',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb16',
    passage:
      "Owen's volcano looked perfect until the judges walked up. He had painted the plaster mountain for a week and hidden the little cup inside. Now his hands shook as he poured in the vinegar. Nothing happened. He had forgotten the baking soda entirely, and the box sat in plain sight beside his poster. A younger judge raised one eyebrow. Owen felt his ears go hot. Then he took a breath, held up the box, and explained exactly what baking soda and vinegar do and why his volcano needed both. The judges wrote for a long time. Owen was not sure that was a bad sign.",
    prompt: 'The ending of the passage suggests that Owen',
    choices: [
      'ruined his chances completely',
      'handled his mistake in a way that may have impressed the judges',
      'decided never to enter a science fair again',
      'blamed the younger judge for his failure',
      'had cheated on his project',
    ],
    answer: 1,
    explain:
      "Instead of giving up, Owen calmly explained the science behind his project. The judges wrote a long time, and he was not sure that was bad, which hints it may have gone well.",
    difficulty: 3,
  },
  {
    id: 'rc3-054',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb16',
    passage:
      "Owen's volcano looked perfect until the judges walked up. He had painted the plaster mountain for a week and hidden the little cup inside. Now his hands shook as he poured in the vinegar. Nothing happened. He had forgotten the baking soda entirely, and the box sat in plain sight beside his poster. A younger judge raised one eyebrow. Owen felt his ears go hot. Then he took a breath, held up the box, and explained exactly what baking soda and vinegar do and why his volcano needed both. The judges wrote for a long time. Owen was not sure that was a bad sign.",
    prompt: "As used in the passage, the phrase 'in plain sight' most nearly means",
    choices: ['hidden away', 'easy to see', 'far across the room', 'already used up', 'wrapped in paper'],
    answer: 1,
    explain:
      "The forgotten box sat in plain sight beside his poster, meaning it was right there and easy to see.",
    difficulty: 2,
  },

  // ---- pb17 — Venice, a city on water (geography) ----
  {
    id: 'rc3-055',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb17',
    passage:
      "The Italian city of Venice was built in the middle of a shallow, marshy lagoon. Long ago, people fleeing invaders settled on the muddy islands there because the water made the city hard to attack. To build on such soft ground, they drove millions of wooden poles deep into the mud until the poles reached firmer soil, then laid stone floors on top of them. Instead of streets, Venice has canals, and people travel by boat. Sealed away from the air under the water and mud, many of those ancient wooden poles have lasted for hundreds of years without rotting.",
    prompt: 'According to the passage, why did people first settle in the lagoon?',
    choices: [
      'The water made the city hard to attack.',
      'The mud was good for farming.',
      'The islands were full of timber.',
      'Boats were faster than walking.',
      'The lagoon never froze in winter.',
    ],
    answer: 0,
    explain:
      "The passage says people fleeing invaders settled there because the water made the city hard to attack.",
    difficulty: 2,
  },
  {
    id: 'rc3-056',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb17',
    passage:
      "The Italian city of Venice was built in the middle of a shallow, marshy lagoon. Long ago, people fleeing invaders settled on the muddy islands there because the water made the city hard to attack. To build on such soft ground, they drove millions of wooden poles deep into the mud until the poles reached firmer soil, then laid stone floors on top of them. Instead of streets, Venice has canals, and people travel by boat. Sealed away from the air under the water and mud, many of those ancient wooden poles have lasted for hundreds of years without rotting.",
    prompt: 'According to the passage, the wooden poles have not rotted because',
    choices: [
      'they were made of a special stone',
      'they are replaced every few years',
      'the water around them is very cold',
      'they are sealed away from the air under water and mud',
      'they were painted before being used',
    ],
    answer: 3,
    explain:
      "The passage says the poles are sealed away from the air under the water and mud, and that is why they have lasted without rotting.",
    difficulty: 3,
  },
  {
    id: 'rc3-057',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb17',
    passage:
      "The Italian city of Venice was built in the middle of a shallow, marshy lagoon. Long ago, people fleeing invaders settled on the muddy islands there because the water made the city hard to attack. To build on such soft ground, they drove millions of wooden poles deep into the mud until the poles reached firmer soil, then laid stone floors on top of them. Instead of streets, Venice has canals, and people travel by boat. Sealed away from the air under the water and mud, many of those ancient wooden poles have lasted for hundreds of years without rotting.",
    prompt: 'Which of the following would be the best title for this passage?',
    choices: [
      'The Best Boats for Traveling on Canals',
      'How to Escape an Invading Army',
      'Why Wood Rots So Quickly',
      'The Deepest Lagoons in Italy',
      'Venice: A City Built on Wooden Poles in the Water',
    ],
    answer: 4,
    explain:
      "The passage explains how Venice was built on water by driving wooden poles into the mud. A good title names that idea.",
    difficulty: 2,
  },

  // ---- pb18 — How cave spikes form (earth science) ----
  {
    id: 'rc3-058',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb18',
    passage:
      "The stone icicles hanging from the roof of a cave are built one drip at a time. Rainwater sinking through the ground picks up a little of the rock it passes, dissolving stone the way water dissolves sugar. When a drop reaches the ceiling of a cave and hangs there, some of that dissolved rock is left behind as a tiny ring. Drop after drop, over thousands of years, the rings stack into a stone spike called a stalactite. Where the drips land on the floor below, a matching spike slowly grows upward. Given enough time, the two spikes can meet and form a single column.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Caves are dangerous places to explore.',
      'Cave spikes form slowly as dripping water leaves tiny bits of rock behind.',
      'Water can dissolve sugar just as it dissolves rock.',
      'Some spikes hang while others grow up from the floor.',
      'Rain sinks quickly through most kinds of ground.',
    ],
    answer: 1,
    explain:
      "The passage explains how dripping water, one drop at a time, leaves rock behind to build cave spikes over thousands of years. That is the main idea.",
    difficulty: 2,
  },
  {
    id: 'rc3-059',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb18',
    passage:
      "The stone icicles hanging from the roof of a cave are built one drip at a time. Rainwater sinking through the ground picks up a little of the rock it passes, dissolving stone the way water dissolves sugar. When a drop reaches the ceiling of a cave and hangs there, some of that dissolved rock is left behind as a tiny ring. Drop after drop, over thousands of years, the rings stack into a stone spike called a stalactite. Where the drips land on the floor below, a matching spike slowly grows upward. Given enough time, the two spikes can meet and form a single column.",
    prompt: 'According to the passage, what grows upward from the cave floor?',
    choices: [
      'A pool of clear water',
      'A ring of dissolved rock',
      'A matching spike where the drips land',
      'A column that reaches the ceiling',
      'A patch of white sugar',
    ],
    answer: 2,
    explain:
      "The passage says where the drips land on the floor, a matching spike slowly grows upward.",
    difficulty: 2,
  },
  {
    id: 'rc3-060',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb18',
    passage:
      "The stone icicles hanging from the roof of a cave are built one drip at a time. Rainwater sinking through the ground picks up a little of the rock it passes, dissolving stone the way water dissolves sugar. When a drop reaches the ceiling of a cave and hangs there, some of that dissolved rock is left behind as a tiny ring. Drop after drop, over thousands of years, the rings stack into a stone spike called a stalactite. Where the drips land on the floor below, a matching spike slowly grows upward. Given enough time, the two spikes can meet and form a single column.",
    prompt: "As used in the passage, the word 'dissolving' most nearly means",
    choices: ['freezing solid', 'bouncing off', 'drying out', 'breaking down into the water', 'cracking apart'],
    answer: 3,
    explain:
      "The passage compares it to the way water dissolves sugar, so dissolving rock means the rock breaks down into the water.",
    difficulty: 2,
  },

  // ---- pb19 — Louis Braille (biography / invention) ----
  {
    id: 'rc3-061',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb19',
    passage:
      "Louis Braille lost his sight in an accident when he was a small boy in France. At his school, blind students read by running their fingers over huge raised letters, but the books were heavy and painfully slow to read. As a teenager, Braille learned about a code the army used to pass messages in the dark, made of raised dots. He saw the idea's promise and made it far simpler, boiling each letter down to a small pattern within six dots. A finger could feel a whole letter at a single touch. The system he finished at fifteen still lets millions of people read today.",
    prompt: "According to the passage, how did blind students read before Braille's system?",
    choices: [
      'By listening to a teacher read aloud',
      'By memorizing whole books',
      'By feeling large raised letters',
      'By using a secret code from the army',
      'By reading with special glasses',
    ],
    answer: 2,
    explain:
      "The passage says blind students read by running their fingers over huge raised letters.",
    difficulty: 1,
  },
  {
    id: 'rc3-062',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb19',
    passage:
      "Louis Braille lost his sight in an accident when he was a small boy in France. At his school, blind students read by running their fingers over huge raised letters, but the books were heavy and painfully slow to read. As a teenager, Braille learned about a code the army used to pass messages in the dark, made of raised dots. He saw the idea's promise and made it far simpler, boiling each letter down to a small pattern within six dots. A finger could feel a whole letter at a single touch. The system he finished at fifteen still lets millions of people read today.",
    prompt: 'According to the passage, Braille based his system on',
    choices: [
      'a dot code the army used to read in the dark',
      'the large raised letters at his school',
      'an alphabet from another country',
      'the sounds of spoken French',
      'a machine that printed dots',
    ],
    answer: 0,
    explain:
      "The passage says he learned about a code the army used made of raised dots, then made it simpler for reading.",
    difficulty: 2,
  },
  {
    id: 'rc3-063',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb19',
    passage:
      "Louis Braille lost his sight in an accident when he was a small boy in France. At his school, blind students read by running their fingers over huge raised letters, but the books were heavy and painfully slow to read. As a teenager, Braille learned about a code the army used to pass messages in the dark, made of raised dots. He saw the idea's promise and made it far simpler, boiling each letter down to a small pattern within six dots. A finger could feel a whole letter at a single touch. The system he finished at fifteen still lets millions of people read today.",
    prompt: 'The passage suggests that the old raised-letter books were a problem because',
    choices: [
      'they were too cheap to sell',
      'only the army could read them',
      'they used far too many dots',
      'they were heavy and very slow to read',
      'students would rather listen than read',
    ],
    answer: 3,
    explain:
      "The passage says the raised-letter books were heavy and painfully slow to read, which is why a better system was needed.",
    difficulty: 2,
  },
  {
    id: 'rc3-064',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb19',
    passage:
      "Louis Braille lost his sight in an accident when he was a small boy in France. At his school, blind students read by running their fingers over huge raised letters, but the books were heavy and painfully slow to read. As a teenager, Braille learned about a code the army used to pass messages in the dark, made of raised dots. He saw the idea's promise and made it far simpler, boiling each letter down to a small pattern within six dots. A finger could feel a whole letter at a single touch. The system he finished at fifteen still lets millions of people read today.",
    prompt: "As used in the passage, the word 'promise' most nearly means",
    choices: ['a spoken vow', 'signs that it could be useful', 'a written rule', 'a gift', 'a serious warning'],
    answer: 1,
    explain:
      "He saw the idea's promise and then improved it, so promise here means the signs that the idea could become useful.",
    difficulty: 3,
  },

  // ---- pb20 — How beavers change a stream (animal behavior) ----
  {
    id: 'rc3-065',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb20',
    passage:
      "Beavers are among the few animals that reshape a whole landscape to suit themselves. Using nothing but their strong front teeth, they gnaw down trees and drag the branches into a stream, packing them with mud and stones until the water backs up into a pond. Beavers feel safest in deep water, so the pond is really a moat around their home, a dome of sticks called a lodge with its entrance hidden underwater. The ponds they make also slow floods and create wetlands where fish, frogs, and birds gather. A single family of beavers can change a stream for miles.",
    prompt: 'According to the passage, why do beavers build a dam to make a pond?',
    choices: [
      'They eat the fish that gather there.',
      'They need the mud for their teeth.',
      'They feel safest in deep water.',
      'They like the sound of running water.',
      'They want to stop floods for other animals.',
    ],
    answer: 2,
    explain:
      "The passage says beavers feel safest in deep water, so they build a dam that backs the stream up into a pond around their home.",
    difficulty: 2,
  },
  {
    id: 'rc3-066',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb20',
    passage:
      "Beavers are among the few animals that reshape a whole landscape to suit themselves. Using nothing but their strong front teeth, they gnaw down trees and drag the branches into a stream, packing them with mud and stones until the water backs up into a pond. Beavers feel safest in deep water, so the pond is really a moat around their home, a dome of sticks called a lodge with its entrance hidden underwater. The ponds they make also slow floods and create wetlands where fish, frogs, and birds gather. A single family of beavers can change a stream for miles.",
    prompt: 'The lodge entrance is hidden underwater most likely to',
    choices: [
      'keep predators from getting inside',
      'let the beavers drink more easily',
      'keep the sticks from floating away',
      'make the pond look bigger',
      'help fish find their way in',
    ],
    answer: 0,
    explain:
      "The passage says beavers feel safest in deep water and the pond acts like a moat, so hiding the entrance underwater helps keep enemies out.",
    difficulty: 3,
  },
  {
    id: 'rc3-067',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb20',
    passage:
      "Beavers are among the few animals that reshape a whole landscape to suit themselves. Using nothing but their strong front teeth, they gnaw down trees and drag the branches into a stream, packing them with mud and stones until the water backs up into a pond. Beavers feel safest in deep water, so the pond is really a moat around their home, a dome of sticks called a lodge with its entrance hidden underwater. The ponds they make also slow floods and create wetlands where fish, frogs, and birds gather. A single family of beavers can change a stream for miles.",
    prompt: "As used in the passage, the word 'moat' most nearly means",
    choices: ['a pile of sticks', 'a row of trees', 'a deep hole', 'a ring of water for protection', 'a wide field'],
    answer: 3,
    explain:
      "The pond is called a moat around the beavers' home, and a moat is a ring of water that protects a home.",
    difficulty: 2,
  },

  // ---- pb21 — How a microwave heats food (everyday technology) ----
  {
    id: 'rc3-068',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb21',
    passage:
      "A microwave oven warms food fast because it heats the water inside the food directly. It sends out invisible waves that pass right through glass and plastic but are soaked up by water. Almost every food holds some water, and the waves make those water molecules jiggle back and forth millions of times a second. That fast jiggling is heat, and the food warms up. Because a dry plate holds very little water, it stays cool while the food on it turns hot. Metal, though, bounces the waves around and can throw sparks, which is why forks do not belong in a microwave.",
    prompt: 'According to the passage, what in the food soaks up the microwaves?',
    choices: ['The sugar', 'The glass', 'The water', 'The plastic wrap', 'The metal'],
    answer: 2,
    explain:
      "The passage says the waves are soaked up by water, and almost every food holds some water.",
    difficulty: 1,
  },
  {
    id: 'rc3-069',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb21',
    passage:
      "A microwave oven warms food fast because it heats the water inside the food directly. It sends out invisible waves that pass right through glass and plastic but are soaked up by water. Almost every food holds some water, and the waves make those water molecules jiggle back and forth millions of times a second. That fast jiggling is heat, and the food warms up. Because a dry plate holds very little water, it stays cool while the food on it turns hot. Metal, though, bounces the waves around and can throw sparks, which is why forks do not belong in a microwave.",
    prompt: 'According to the passage, why does a dry plate stay cool while the food gets hot?',
    choices: [
      'The plate is made of metal.',
      'The waves cannot reach the plate at all.',
      'The plate is farther from the center.',
      'The plate holds very little water for the waves to heat.',
      'The food blocks the waves from the plate.',
    ],
    answer: 3,
    explain:
      "The microwave heats water, and the passage says a dry plate holds very little water, so it stays cool.",
    difficulty: 2,
  },
  {
    id: 'rc3-070',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb21',
    passage:
      "A microwave oven warms food fast because it heats the water inside the food directly. It sends out invisible waves that pass right through glass and plastic but are soaked up by water. Almost every food holds some water, and the waves make those water molecules jiggle back and forth millions of times a second. That fast jiggling is heat, and the food warms up. Because a dry plate holds very little water, it stays cool while the food on it turns hot. Metal, though, bounces the waves around and can throw sparks, which is why forks do not belong in a microwave.",
    prompt: 'According to the passage, why should metal not go in a microwave?',
    choices: [
      'It melts into the food.',
      'It soaks up all of the waves.',
      'It bounces the waves and can throw sparks.',
      'It makes the food cook too slowly.',
      'It blocks the door from closing.',
    ],
    answer: 2,
    explain:
      "The passage says metal bounces the waves around and can throw sparks, which is why forks do not belong in a microwave.",
    difficulty: 2,
  },
  {
    id: 'rc3-071',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb21',
    passage:
      "A microwave oven warms food fast because it heats the water inside the food directly. It sends out invisible waves that pass right through glass and plastic but are soaked up by water. Almost every food holds some water, and the waves make those water molecules jiggle back and forth millions of times a second. That fast jiggling is heat, and the food warms up. Because a dry plate holds very little water, it stays cool while the food on it turns hot. Metal, though, bounces the waves around and can throw sparks, which is why forks do not belong in a microwave.",
    prompt: "As used in the passage, the word 'jiggle' most nearly means",
    choices: ['shake quickly back and forth', 'grow much larger', 'give off light', 'melt slowly', 'float upward'],
    answer: 0,
    explain:
      "The waves make the water molecules jiggle back and forth millions of times a second, so jiggle means to shake quickly back and forth.",
    difficulty: 2,
  },

  // ---- pb22 — How cartoons trick the eye (art / how things work) ----
  {
    id: 'rc3-072',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb22',
    passage:
      "Cartoons trick your eyes with a habit those eyes cannot help. When you see a picture, your brain holds on to it for a split second after it disappears. Show a series of slightly different pictures fast enough, and your brain blurs them together into smooth motion. A flipbook is the simplest example: draw a stick figure a little farther along on each page, flick the pages with your thumb, and the figure seems to walk. Early cartoons worked the same way, using thousands of hand-drawn pictures photographed one at a time. Each single drawing is frozen, but speed makes them come alive.",
    prompt: 'Which sentence best states the main idea of the passage?',
    choices: [
      'Cartoons are drawn by thousands of artists at once.',
      'Cartoons create motion because the brain blends fast pictures together.',
      'A flipbook is harder to make than a movie.',
      'The eye can only ever see one picture at a time.',
      'Stick figures are the easiest thing to draw.',
    ],
    answer: 1,
    explain:
      "The passage explains that the brain holds each picture briefly and blurs quick pictures into motion, which is how cartoons seem to move.",
    difficulty: 2,
  },
  {
    id: 'rc3-073',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb22',
    passage:
      "Cartoons trick your eyes with a habit those eyes cannot help. When you see a picture, your brain holds on to it for a split second after it disappears. Show a series of slightly different pictures fast enough, and your brain blurs them together into smooth motion. A flipbook is the simplest example: draw a stick figure a little farther along on each page, flick the pages with your thumb, and the figure seems to walk. Early cartoons worked the same way, using thousands of hand-drawn pictures photographed one at a time. Each single drawing is frozen, but speed makes them come alive.",
    prompt: 'According to the passage, a flipbook seems to move when you',
    choices: [
      'draw the same picture on every page',
      'hold it up to a bright light',
      'flick the pages quickly with your thumb',
      'photograph each page one at a time',
      'read it very slowly',
    ],
    answer: 2,
    explain:
      "The passage says you flick the pages with your thumb and the figure seems to walk.",
    difficulty: 1,
  },
  {
    id: 'rc3-074',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb22',
    passage:
      "Cartoons trick your eyes with a habit those eyes cannot help. When you see a picture, your brain holds on to it for a split second after it disappears. Show a series of slightly different pictures fast enough, and your brain blurs them together into smooth motion. A flipbook is the simplest example: draw a stick figure a little farther along on each page, flick the pages with your thumb, and the figure seems to walk. Early cartoons worked the same way, using thousands of hand-drawn pictures photographed one at a time. Each single drawing is frozen, but speed makes them come alive.",
    prompt: "As used in the passage, the word 'frozen' most nearly means",
    choices: ['very cold', 'still and not moving', 'broken apart', 'brightly colored', 'soaking wet'],
    answer: 1,
    explain:
      "Each single drawing is frozen, but speed makes them come alive, so frozen here means still and not moving.",
    difficulty: 2,
  },

  // ---- pb23 — Why popcorn pops (food / science) ----
  {
    id: 'rc3-075',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb23',
    passage:
      "Popcorn is the only kind of corn that truly pops, and the secret is sealed inside each kernel. A drop of water is trapped within a ring of soft starch, and all of it is wrapped in a hard, waterproof shell. When the kernel heats up, that trapped water turns to steam and pushes harder and harder against the shell. At about the temperature of a hot oven, the shell can no longer hold, and it bursts. The steam explodes outward, the soft starch puffs up and turns inside out, and it cools almost at once into the crunchy white piece you eat. Other kinds of corn simply leak and never pop.",
    prompt: 'According to the passage, what makes a kernel finally pop?',
    choices: [
      'The shell soaks up water from the pot.',
      'The starch melts into a liquid.',
      'Trapped water turns to steam and bursts the shell.',
      'The kernel dries out completely.',
      'Oil soaks into the center of the kernel.',
    ],
    answer: 2,
    explain:
      "The passage says the trapped water turns to steam and pushes until the shell can no longer hold and bursts.",
    difficulty: 2,
  },
  {
    id: 'rc3-076',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb23',
    passage:
      "Popcorn is the only kind of corn that truly pops, and the secret is sealed inside each kernel. A drop of water is trapped within a ring of soft starch, and all of it is wrapped in a hard, waterproof shell. When the kernel heats up, that trapped water turns to steam and pushes harder and harder against the shell. At about the temperature of a hot oven, the shell can no longer hold, and it bursts. The steam explodes outward, the soft starch puffs up and turns inside out, and it cools almost at once into the crunchy white piece you eat. Other kinds of corn simply leak and never pop.",
    prompt: 'The passage suggests that other kinds of corn cannot pop because',
    choices: [
      'their shells let the steam leak out',
      'they hold no starch at all',
      'they are too small to heat',
      'they never contain any water',
      'their shells are much too thick',
    ],
    answer: 0,
    explain:
      "Popcorn pops because its hard shell traps the steam until it bursts. The passage says other corn simply leaks and never pops, so its shell lets the steam escape.",
    difficulty: 3,
  },
  {
    id: 'rc3-077',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb23',
    passage:
      "Popcorn is the only kind of corn that truly pops, and the secret is sealed inside each kernel. A drop of water is trapped within a ring of soft starch, and all of it is wrapped in a hard, waterproof shell. When the kernel heats up, that trapped water turns to steam and pushes harder and harder against the shell. At about the temperature of a hot oven, the shell can no longer hold, and it bursts. The steam explodes outward, the soft starch puffs up and turns inside out, and it cools almost at once into the crunchy white piece you eat. Other kinds of corn simply leak and never pop.",
    prompt: "As used in the passage, the word 'sealed' most nearly means",
    choices: ['closed up tight', 'cooked through', 'left wide open', 'cooled down', 'cut in half'],
    answer: 0,
    explain:
      "The water is sealed inside the kernel by a hard, waterproof shell, so sealed means closed up tight.",
    difficulty: 2,
  },

  // ---- pb24 — The first snow (narrative) ----
  {
    id: 'rc3-078',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb24',
    passage:
      "The moving truck had barely pulled away when the first snow of Aisha's life began to fall. Back in Houston she had never once seen it. Now fat flakes drifted past the window of a house that did not yet feel like home. Her father was still unpacking boxes and did not notice. Aisha pulled on two pairs of socks, found her thin jacket, and went out to stand in the empty yard. The snow made no sound at all. An older girl next door was shoveling a walk, and she looked up and waved. Aisha waved back, and the new street felt a little less strange.",
    prompt: 'According to the passage, why had Aisha never seen snow before?',
    choices: [
      'She had always stayed indoors in winter.',
      'She had lived in Houston, where it does not snow.',
      'She was too young to remember it.',
      'Her family moved somewhere new every winter.',
      'She had been sick during past snows.',
    ],
    answer: 1,
    explain:
      "The passage says back in Houston she had never once seen snow, so it was because she used to live where it does not snow.",
    difficulty: 2,
  },
  {
    id: 'rc3-079',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb24',
    passage:
      "The moving truck had barely pulled away when the first snow of Aisha's life began to fall. Back in Houston she had never once seen it. Now fat flakes drifted past the window of a house that did not yet feel like home. Her father was still unpacking boxes and did not notice. Aisha pulled on two pairs of socks, found her thin jacket, and went out to stand in the empty yard. The snow made no sound at all. An older girl next door was shoveling a walk, and she looked up and waved. Aisha waved back, and the new street felt a little less strange.",
    prompt: 'How does Aisha most likely feel at the end of the passage?',
    choices: [
      'Angry about the move',
      'Bored and restless',
      'A little more at home and less alone',
      'Frightened of the older girl',
      'Worried about her father',
    ],
    answer: 2,
    explain:
      "After the neighbor waves and Aisha waves back, the passage says the new street felt a little less strange, which means she feels more at home.",
    difficulty: 2,
  },
  {
    id: 'rc3-080',
    subject: 'reading',
    kind: 'reading',
    passageId: 'pb24',
    passage:
      "The moving truck had barely pulled away when the first snow of Aisha's life began to fall. Back in Houston she had never once seen it. Now fat flakes drifted past the window of a house that did not yet feel like home. Her father was still unpacking boxes and did not notice. Aisha pulled on two pairs of socks, found her thin jacket, and went out to stand in the empty yard. The snow made no sound at all. An older girl next door was shoveling a walk, and she looked up and waved. Aisha waved back, and the new street felt a little less strange.",
    prompt: "As used in the passage, the word 'drifted' most nearly means",
    choices: ['fell hard', 'floated slowly', 'melted fast', 'blew away', 'piled up'],
    answer: 1,
    explain:
      "The fat flakes drifted past the window, meaning they floated down slowly and gently.",
    difficulty: 1,
  },
];
