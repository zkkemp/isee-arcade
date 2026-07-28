# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Parents set up and supervise family accounts. Children use the app on phones, iPads,
and computers for grade-level practice, ISEE preparation, and recreational games.
The youngest learners may not yet read independently.

## Product Purpose

ISEE Arcade makes sustained study practice feel worth returning to. Children answer
age-appropriate questions, earn play, build mastery, and keep their progress over
time. Parents choose each child's level, study-block length, and daily time allowance
and can review results without managing day-to-day play.

## Positioning

The product combines substantial arcade and tabletop games with adaptive study
blocks, family-managed learner profiles, and test-preparation progress rather than
presenting ordinary worksheets with superficial game rewards.

## Operating Context

The app is a touch-first installable web app used primarily at home. One parent
account may manage multiple child accounts. Children may share a family iPad or sign
in on another device. Parents can create and reset child credentials, choose learning
levels, set question counts, and enforce daily active-use limits.

## Capabilities and Constraints

- Current learning modes include Kindergarten, First Grade, Third Grade, and ISEE
  Lower Level; the confirmed roadmap adds every generic grade through Eighth Grade
  plus ISEE Middle and Upper Levels.
- The existing ISEE Lower Level bank is protected content and must not be weakened,
  replaced, or casually rewritten while new banks are added.
- Parent and child logins use simple usernames and passwords without user-facing
  email addresses. Passwords may be six characters and may contain only letters or
  only numbers.
- Daily limits allow an in-progress question block or game run to finish safely
  before locking.
- Each family's data must be isolated with database Row Level Security.
- KEMPCO and the FSM/work-order product are strictly outside this product's scope.

## Brand Commitments

The current product name is ISEE Arcade while a broader permanent name remains an
open decision. The established identity uses the blue brain, electric lightning
bolt, gold arcade lettering, and high-energy game presentation found in
`public/icon-512.png`. New branded surfaces must remain recognizable as the same
product.

## Evidence on Hand

- Production app icon: `public/icon-512.png`
- Existing game catalog and learning flows in `app/`, `components/`, and `lib/`
- Existing structural and gameplay checks in `scripts/`
- No testimonials, customer counts, outcome guarantees, or commercial claims have
  been supplied and none should be fabricated.

## Product Principles

1. Learning controls the reward loop without interrupting children mid-task.
2. Parents configure the boundaries; children get a simple, independent experience.
3. Difficulty and explanations must match the selected learner—not leak across levels.
4. Real progress persists across devices and remains private to the family.
5. Games must be enjoyable on their own, responsive on touch screens, and dependable.

## Accessibility & Inclusion

Pre-readers need large, obvious visuals and optional spoken prompts. Controls must
work reliably with touch, support reduced motion, maintain readable contrast, and
avoid requiring precise pointer input. Audio must remain user-controlled.
