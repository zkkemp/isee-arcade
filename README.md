# ISEE Arcade

Three arcade games that stop mid-play and make you answer an ISEE question before
you can keep going. Built for **ISEE Lower Level** (the level taken by students in
grades 4–5 applying for grade 5–6 admission).

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Putting it on an iPad or iPhone

Once deployed, open the site in **Safari** → Share → **Add to Home Screen**. It
installs as a standalone app (no browser chrome, its own icon, portrait-locked).

Note: iOS bakes the standalone display mode and scope into the icon **at install
time**. If you later change `public/manifest.webmanifest`, delete the home-screen
icon and re-add it, or the old settings stick.

## How the study gate works

The games are real games — you can lose. The learning is wired into the reward
loop rather than bolted on:

| Event | Behavior |
| --- | --- |
| Gate trigger | Road Hopper: each bank reached. Byte Snake: every 5 snacks. Coin Runner: every 10 coins + each flag. |
| Correct answer | +50 points and an extra life (up to 2 above the game's starting lives). |
| Wrong answer | The explanation appears and **Continue stays locked for 4 seconds**. You cannot button-mash past a question you just missed. |
| Last life lost | A question appears instead of Game Over. Get it right and you're back in; get it wrong and the run ends. |
| Missed questions | Go into a review pool and resurface in later sessions until answered correctly. |

Two other things run quietly in the background:

- **Adaptive difficulty** — recent accuracy above 85% pulls harder questions; below
  50% eases off.
- **Spaced repetition** — roughly a third of gates draw from the review pool of
  previously missed questions.

Progress is stored in `localStorage` on the device. There is no account, no server,
and no data leaves the device. `/progress` shows accuracy by subject, the review
pool, and high scores — that page is meant for a parent to glance at.

## Question bank

220 hand-written questions in `lib/questions/`:

| File | Count | Contents |
| --- | --- | --- |
| `verbal.ts` | 70 | 40 synonyms + 30 sentence completions |
| `quantitative.ts` | 55 | Quantitative Reasoning — patterns, estimation, probability, logic |
| `math.ts` | 55 | Math Achievement — fractions, decimals, percents, geometry, measurement |
| `reading.ts` | 40 | 20 short passages, 2 questions each |

### Adding questions

Append to the relevant file following the `Question` type in
`lib/questions/types.ts`, then run:

```bash
npm run check:questions
```

That validates ids, choice counts, answer-key ranges, duplicate choices, passage
integrity, non-ASCII characters, and answer-index distribution. It **cannot** tell
you that an answer key is factually wrong — check new questions by hand.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run check` | Typecheck + question bank + game logic |
| `npm run check:questions` | Question bank structural validation |
| `npm run check:logic` | Level geometry, question picker, progress bookkeeping |
| `npm run icons` | Regenerate PWA icons from `scripts/make-icons.mjs` |

`check:logic` is the one worth knowing about: Coin Runner's levels are generated
procedurally, so it validates 30 levels for unjumpable pits, coins embedded in
walls, enemies standing over holes, and an unreachable flag — failures that would
make a level unwinnable and that no type check would catch.

## Layout

```
app/
  page.tsx            game picker
  play/[game]/        one route per game
  progress/           parent-facing progress view
components/
  GameShell.tsx       score, lives, gating, HUD — owns everything but the canvas
  QuestionGate.tsx    the interrupt modal
  TouchControls.tsx   on-screen d-pad / run-jump buttons
  games/              Frogger.tsx, Snake.tsx, Platformer.tsx
lib/
  questions/          the bank + adaptive picker
  progress.ts         localStorage, streaks, spaced-repetition bookkeeping
  platformerLevel.ts  procedural level generation (pure, so it can be validated)
  useCanvasGame.ts    retina canvas + delta-timed loop that pauses on a gate
  input.ts            one input surface for keyboard and touch
```

Games are deliberately dumb about scoring: they call `api.addScore`,
`api.lifeLost`, and `api.requestGate`, and `GameShell` owns the rest. Adding a
fourth game means writing one canvas component and adding an entry to
`lib/games.ts`.

## Controls

Arrow keys or WASD; Space to jump in Coin Runner; `1`–`4` or `A`–`D` to answer a
question, Enter to continue. On touch devices the on-screen controls appear
automatically.
