# ISEE Arcade audit — July 27, 2026

## Scope

- All 49 game routes
- Home, progress, preparation, and Family Cloud screens
- 390 × 844 phone and 768 × 1024 iPad portrait layouts
- Touch targets, overflow, browser warnings, route failures, game-rule tests,
  question-bank validation, production build, and dependency security

## Verified

- Every game route renders at both audited sizes with no horizontal overflow.
- The live browser console remained clear during the route sweep.
- The complete automated suite passes, including platform physics, collision
  handling, 81,600 generated math/quantitative instances, question structure,
  adaptive difficulty, 42 Color-by-Number pictures, full backgammon rules,
  Diamond Derby outcomes, Pyramid Hop progression, Paddle Duel, and the new
  strategy games.
- The production build generates all 49 game paths successfully.
- Production dependencies report zero known vulnerabilities.

## Improvements in this pass

- Raised shared game-shell touch controls to a 44 × 44 minimum.
- Added a meaningful accessible game region and instructions to every game.
- Reworked Diamond Derby’s pitch strategy, defensive odds, field animation,
  player artwork, selection cards, and rules guidance.
- Enlarged and animated Pyramid Hop’s playfield, jewel cubes, hero, enemy, and
  level feedback.
- Rebuilt Color-by-Number into 42 original 1,200+ cell pictures with seven
  gallery pages, white painting surfaces, pinch zoom, two-finger pan, Fit,
  direct picture navigation, rich palettes, per-color completion, and
  learner-specific saves.
- Added three complete games with original presentation and tested rules:
  Starline Four, Mancala Garden, and Gem Code.
- Added a separate ISEE Arcade Supabase foundation for parent authentication,
  family isolation, child profiles, progress, vocabulary mastery, question
  attempts, scores, play sessions, recent games, and painting progress.

## Cloud design

The app remains local-first and playable offline. Once a parent signs in,
changes are debounced and mirrored to an RLS-protected family household. A
parent can also restore the family to another device. Kid passcodes stay local
and are never uploaded.

The Supabase migration and setup guide live in `supabase/`. The app needs only
the new ISEE Arcade project URL and publishable key. It does not require or
expose a service-role key.

## Recommended next additions

1. A parent-facing mastery dashboard with trend charts by learner, subject, and
   question skill after real cloud data has accumulated.
2. Parent invitation and password-recovery flows once the first separate
   Supabase project is connected.
3. A real-device Safari pass on the family’s physical iPads; viewport testing
   is complete, but real hardware remains the best check for multi-touch,
   speakers, safe areas, and PWA installation.
4. Future game candidates, in quality order: Tangram Workshop, Domino Trails,
   and Treasure Sweep. These add spatial composition, quantity recognition,
   and deductive planning without copying protected artwork or branding.

## Protected boundary

Shared provider accounts may be used for ISEE Arcade. Every KEMPCO/FSM project,
repository, database, credential, deployment, and file remains strictly
off-limits.
