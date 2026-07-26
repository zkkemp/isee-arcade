# ISEE Arcade — additive visual and game expansion

This review copy was created from the clean `isee-arcade` commit `461a2cc`.
The original repository was not edited.

## What is new

- **Coin Runner: Storybook** (`platformer2`)
  - Separate game component: `components/games/PlatformerV2.tsx`
  - Painted atmosphere, foreground depth, motes, lighting glaze and vignette
  - Clearer coins, power-ups and spike warnings
  - Entity grounding shadows and larger hero artwork
  - Original physics, levels, hitboxes and scoring preserved
- **Byte Snake: Garden** (`snake2`)
  - Separate game component: `components/games/SnakeV2.tsx`
  - Garden planter arena, textured grass and firefly motes
  - Connected dimensional snake artwork and expressive head
  - Glowing fruit-gem and pickup celebration
  - Original movement, collision, difficulty and scoring preserved
- **Fruit Catch: Orchard** (`fruit2`)
  - Separate game component: `components/games/FruitCatchV2.tsx`
  - Layered orchard scenery, leafy canopy and drifting petals
  - Textured basket and clearer good-fruit versus bad-item silhouettes
  - Catch shimmer and richer object lighting
  - Original catch geometry, spawning, lives and scoring preserved
- **Tap Attack: Carnival** (`tapattack2`)
  - Separate game component: `components/games/TapAttackV2.tsx`
  - Storybook carnival-garden board with pennants and warm lighting
  - Dimensional holes, expressive friendly critters and unmistakable grumps
  - Confetti-like hit feedback
  - Original scheduler, tap detection, lives and scoring preserved
- **Arcade catalog**
  - Illustrated game cards and grouped collections
  - V2 editions are clearly labeled
  - Original and remastered editions appear side by side
- **Three entirely new games**
  - **Sky Stack** (`skystack`) — one-tap timing and tower building
  - **Starfall Squadron** (`starfall`) — drag-to-fly, auto-firing space waves
  - **Firefly Orbit** (`firefly`) — one-tap garden timing challenge
- **Shared interface refresh**
  - Richer game HUD, clearer play-time clock and framed stages across every game
  - Friendlier player, speed-selection and progress cards
  - Parent-facing suggested practice focus on the progress dashboard
- **Pre-reader study mode**
  - Kindergarten and first-grade questions still narrate automatically
  - Every answer choice now has its own replay button
  - Single-digit choices add countable dot pictures
  - New visible apple/star comparison prompts reduce reliance on reading
- **Expanded challenge**
  - Six new harder third-grade question families covering multi-step arithmetic,
    fractions, perimeter, survey totals, patterns and vocabulary

## Safety model

Every original file in `components/games` is byte-for-byte identical to the
source version. Remasters and new games have their own IDs, components, metadata
and high-score slots.

## Verification completed

- TypeScript typecheck
- ESLint
- Production build with 31 game routes (35 static pages total)
- All game and logic verifier scripts
- Question-bank structural checks
- Sprite-reference checks
- Coin Runner brute-force reachability across 75 generated levels

## Review locally

Install dependencies if needed, then run:

```bash
npm run dev
```

Choose a game labeled **New edition** for a side-by-side remaster, or start with
the **Fresh from the workshop** collection to try the three entirely new games.
