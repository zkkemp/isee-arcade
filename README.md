# ISEE Arcade

Three arcade games with real sprite art that stop **when you die or clear a level**
and make you answer an ISEE question before you carry on. Built for **ISEE Lower
Level** (taken by students in grades 4–5 applying for grade 5–6 admission).

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

## Passcode

The deployed site is behind a 4-digit passcode so a random visitor with the link
can't load it. Enter it once per device and it's remembered.

To change it:

```bash
npm run passcode -- 1234
```

That prints a `NEXT_PUBLIC_PASSCODE_SHA256=...` line. Set that variable in the
Vercel project settings and redeploy. Leaving it unset disables the gate entirely,
which is why `npm run dev` doesn't ask for a passcode locally.

**This is a speed bump, not security.** The app is a static site, so the check runs
in the browser and someone determined could bypass it by reading the bundle. Storing
a hash rather than the plaintext at least keeps the passcode out of the shipped
JavaScript. There's no personal data in the app to protect — the point is just to
keep strangers from stumbling in.

## How the study gate works

The games are real games and you can lose. The learning is wired into the reward
loop rather than interrupting play:

| Event | Behavior |
| --- | --- |
| **Never mid-play** | A question never breaks up a run. Play is uninterrupted. |
| Death | A question appears instead of Game Over. |
| Level cleared | A question before the next level. |
| Correct | +50 points, straight back into the game. |
| **Wrong** | You get **another question of the same kind**, and another, until you get one right. A missed reading passage means another reading passage. A missed fraction question means the same kind of fraction question with different numbers. |
| Runs | Never truly end. Answering is how you get back in, so she stops when she wants to. |

Two things run quietly in the background:

- **Adaptive difficulty** - recent accuracy above 85% pulls harder questions; below
  50% eases off.
- **Spaced repetition** - roughly a third of gates draw from the pool of
  previously missed questions.

Progress is stored in `localStorage` on the device. There is no account, no server,
and no data leaves the device. `/progress` shows accuracy by subject, the review
pool, and high scores - that page is for a parent to glance at.

## Question bank

Two kinds of question, because they need different treatment.

**Fixed text** (620 questions) - a synonym cannot be parameterized:

| File | Count | Contents |
| --- | --- | --- |
| `vocab/{ab,cd,eh,im,nr,sz}.ts` | 510 | Synonyms, partitioned by first letter |
| `verbal.ts` | 70 | 40 synonyms + 30 sentence completions |
| `reading.ts` | 40 | 20 short passages, 2 questions each |

550 distinct vocabulary words in total.

**Templates** (70 families) - math and quantitative reasoning **regenerate their
numbers every single time**:

| File | Count | Contents |
| --- | --- | --- |
| `mathTemplates.ts` | 40 | Math Achievement - fractions, decimals, percents, geometry, measurement |
| `quantTemplates.ts` | 30 | Quantitative Reasoning - patterns, estimation, probability, ratios |

This is the point: seeing `1/3 + 1/6` enough times makes the answer recall rather
than arithmetic. A template keeps the shape and rebuilds the numbers, so the work
has to be done again. It also makes the wrong-answer retry meaningful - you get the
same shape with new numbers rather than a second crack at the same values.

A generated instance carries its **template's** id, so the review pool tracks the
family rather than one instance.

### Adding questions

Fixed text: append to the relevant file following the `Question` type in
`lib/questions/types.ts`. Templates: add a `QuestionTemplate` using the helpers in
`lib/questions/templates.ts` (`randInt`, `pick`, `buildChoices`, `frac`, `money`).
Then:

```bash
npm run check
```

Neither check can tell you an answer key is factually wrong - verify new questions
by hand.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run check` | Typecheck + question bank + game logic |
| `npm run check:questions` | Question bank structural validation |
| `npm run check:logic` | Level geometry, question picker, progress bookkeeping |
| `npm run icons` | Regenerate PWA icons from `scripts/make-icons.mjs` |

`check:logic` is the one worth knowing about. It executes things that cannot be
verified by reading them:

- **Level geometry** - 30 generated levels checked for unjumpable pits, coins
  embedded in walls, enemies standing over holes, and unreachable flags. Any of
  those makes a level unwinnable, and no type check would catch it.
- **Every template x 300 seeds** - asserts the generator never throws, the four
  choices are distinct *as values* (so `1/7` and `2/14` can't both be offered),
  the marked answer is the computed one, the explanation references the generated
  numbers, and regenerating actually changes them.
- **The retry path** - a wrong answer must lead to the same kind of question, and
  a templated retry must produce different numbers.

## Layout

```
app/
  page.tsx            game picker
  play/[game]/        one route per game
  progress/           parent-facing progress view
components/
  GameShell.tsx       score, gating, HUD - owns everything but the canvas
  QuestionGate.tsx    the full-screen question view
  TouchOverlay.tsx    touch zones layered over the canvas
  PasscodeGate.tsx    optional passcode wrapper
  games/              Frogger.tsx, Snake.tsx, Platformer.tsx
lib/
  questions/          fixed bank, templates, adaptive picker
  sprites.ts          atlas loading + frame drawing
  progress.ts         localStorage, streaks, spaced-repetition bookkeeping
  platformerLevel.ts  procedural level generation (pure, so it can be validated)
  useCanvasGame.ts    retina canvas + delta-timed loop that pauses on a gate
  input.ts            one input surface for keyboard and touch
public/assets/sprites/  Kenney atlases (CC0) + frame maps
```

Games are deliberately dumb about scoring: they call `api.addScore`, `api.died`,
and `api.requestGate`, and `GameShell` owns the rest. Adding a fourth game means
writing one canvas component and adding an entry to `lib/games.ts`.

## Controls

**Touch** - controls sit on top of the game, not in a small pad underneath:

- *Coin Runner*: hold the arrows in the bottom-left to run; **tap anywhere on the
  right half of the screen to jump**. No aiming for a small target.
- *Road Hopper / Byte Snake*: **tap the edge of the play area** in the direction you
  want to move.

**Keyboard** - arrow keys or WASD, Space to jump in Coin Runner. In a question,
`1`-`4` or `A`-`D` to answer and Enter to advance.

## Art credits

Sprites are from [Kenney](https://kenney.nl), released under
**CC0 1.0 (public domain)** - no attribution required, but credited anyway because
it is good work:

- *New Platformer Pack* - terrain, characters, coins, flags, enemies, backgrounds,
  and the frog and log bridge used by Road Hopper
- *Racing Pack* - the top-down cars in Road Hopper

Only the frames actually used are committed: four atlas PNGs plus JSON frame maps
and five car PNGs, about 290 KB total. License texts are alongside them in
`public/assets/sprites/`.
