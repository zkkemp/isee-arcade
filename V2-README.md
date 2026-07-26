# ISEE Arcade — game and interface refresh

This review copy was created from the clean `isee-arcade` commit `461a2cc`.
The original repository was not edited.

## Latest refresh

- **Coin Runner: Skybound** (`platformer3`)
  - A genuinely separate V3 presentation built on the verifier-proven platformer
    simulation, so the original and Storybook editions remain available
  - New original panoramic pixel-art kingdom, crystal terrain and blocks,
    sky-creature enemies, beacon goal, portal wipe, HUD and world intros
  - Three deterministic star relics in every level, bonus scoring and secret-cache
    discovery callouts
  - The 25 levels retain their tested enemies, movers, springs, portals, secrets,
    checkpoints, power-ups and multiple biomes
- **Ten original games inspired by classic play patterns**
  - **Diamond Derby** — pitch-timing baseball
  - **Paper Route** — neighborhood delivery and obstacle dodging
  - **Pyramid Hop** — color-changing isometric tile hopping
  - **Reversi** — legal line flips, passes and computer play
  - **Mini Backgammon** — dice movement, hits, bar re-entry and bearing off
  - **Sea Battle** — hidden-fleet strategy against the computer
  - **Paddle Duel** — first-to-seven neon paddle competition
  - **Asteroid Patrol** — wraparound space steering and splitting rocks
  - **Star Defender** — fixed-screen formation defense
  - **Lunar Lander** — fuel, momentum and soft-landing challenges
- **Coin Runner: Storybook** (`platformer2`)
  - A distinct original 16-bit storybook-console presentation, with illustrated
    terrain, depth layers, paper grain, brighter landmarks and a custom HUD
  - Smoother animation when the hero stops and more stable camera settling
  - Doors work by tapping jump while standing in them or by briefly holding still
  - 25 generated levels retain their worlds, enemies, moving platforms, springs,
    pits, secrets, power-ups and warp doors
- **Coin Runner** (`platformer`)
  - The same stopping and warp-door fixes were applied to the original edition
- **Bubble Pop** (`bubblepop`)
  - Touch shots fire on press, including a safe straight-up shot from the launcher
  - Persistent aim guide plus keyboard aiming and firing
- **Sky Stack** (`skystack`)
  - Each level now becomes faster and narrows the target while keeping a fair cap
  - The HUD communicates the current width and speed
- **Dash Run, Road Hopper and Brick Buster**
  - New lighting, depth, biome cues, motion treatment and clearer gameplay feedback
- **Kid Sudoku**
  - In-game board-size selector from 4×4 through 10×10
  - Fast, deterministic puzzle construction with unique solutions
- **Color Dash** (`cardmatch`)
  - Replaces the old Color Cascade name
  - Familiar color/number matching plus Skip, Reverse, Draw Two and Wild cards
  - A visible **Call One** button; forgetting to call before playing down to one
    card draws a two-card penalty
- **Question listening**
  - Questions never read automatically
  - Speaker buttons start and stop speech on demand
  - The game prefers a smoother high-quality system voice when one is installed
- **Shared game finish**
  - Every game receives a subtle glass, vignette and scanline treatment in the
    refreshed game frame
- **Byte Snake: Garden** (`snake2`)
  - Garden planter arena, textured grass and firefly motes
  - Connected dimensional snake artwork and expressive head
  - Glowing fruit-gem and pickup celebration
  - The superseded original Byte Snake entry and component were removed

## Earlier additions

- **Fruit Catch: Orchard** (`fruit2`)
  - Layered orchard scenery, leafy canopy and drifting petals
  - Textured basket and clearer good-fruit versus bad-item silhouettes
  - Catch shimmer and richer object lighting
- **Tap Attack: Carnival** (`tapattack2`)
  - Storybook carnival-garden board with pennants and warm lighting
  - Dimensional holes, expressive friendly critters and unmistakable grumps
  - Confetti-like hit feedback
- **Arcade catalog**
  - Illustrated game cards and grouped collections
  - V2 editions are clearly labeled
- **Three entirely new games**
  - **Sky Stack** (`skystack`) — one-tap timing and tower building
  - **Starfall Squadron** (`starfall`) — drag-to-fly, auto-firing space waves
  - **Firefly Orbit** (`firefly`) — one-tap garden timing challenge
- **Shared interface refresh**
  - Richer game HUD, clearer play-time clock and framed stages across every game
  - Friendlier player, speed-selection and progress cards
  - Parent-facing suggested practice focus on the progress dashboard
- **Pre-reader study mode**
  - Kindergarten and first-grade prompts offer optional speaker controls
  - Every answer choice has its own replay button
  - Single-digit choices add countable dot pictures
  - New visible apple/star comparison prompts reduce reliance on reading
- **Expanded challenge**
  - Six new harder third-grade question families covering multi-step arithmetic,
    fractions, perimeter, survey totals, patterns and vocabulary

## Verification completed

- TypeScript typecheck
- ESLint
- Production build with 41 game routes (45 static pages total)
- All game and logic verifier scripts
- Focused rule checks for all ten classic-inspired games
- Question-bank structural checks
- Sprite-reference checks
- Coin Runner brute-force reachability across 75 generated levels

## Review locally

Install dependencies if needed, then run:

```bash
npm run dev
```

Start with **Coin Runner: Skybound** or the **Classics Reimagined** collection.
