# ISEE Arcade Design System

<!-- impeccable:design-schema 1 -->

## Direction

ISEE Arcade is a midnight family arcade: energetic for children, calm and legible for parents.
Authentication is the front door, not a settings feature. One credential form recognizes the
account role and moves the player directly into the correct environment.

## Product Modes

- **Sign in:** quiet, confident, and focused. The branded icon, one short promise, and the form
  must fit in the first phone viewport.
- **Child arcade:** vivid game artwork and clear reward-loop information. Account management stays
  out of the child experience.
- **Parent dashboard:** an inspection lane with restrained surfaces, direct labels, and visible
  access to Children, Reports, Learning Controls, Curriculum, and Parent Free Play.

## Visual Language

- Background: `#090812` with deep navy and indigo atmosphere.
- Primary surface: `#151527`.
- Primary action: cyan `#a5f3fc` with near-black text.
- Parent action: amber `#fde68a` with dark brown text.
- Selection: violet `#c4b5fd`.
- Error: rose-tinted surface with readable rose-white text.
- Corner radii: 12–16px for interactive surfaces; avoid excessive pills and nested cards.
- Shadows: dark, offset, and softly blurred; colored light is reserved for branded atmosphere.

## Typography

Use the existing bold rounded display face for identity and major actions. Body copy stays
sentence case, compact, and direct. Implementation terms such as “cloud,” “sandbox,” and
“player mode” never appear in user-facing navigation.

## Portrait Library

The selectable avatar system contains 48 consistent semi-realistic 3D illustrated portraits,
including an expanded range of blonde boys and girls.
Portraits are square, front-facing, diverse, expressive, and readable at 38–64px. They use a
shared midnight arcade background and remain illustrated rather than photographic. Picker
portraits and lightweight gameplay drawings always represent the same human character identity.

A separate **Fantastic friends** group adds 16 original non-human avatars—aliens, robots,
creatures, celestial buddies, and emoji-like characters—using the same lighting and portrait
framing. They remain original and avoid recognizable franchise designs.

## Interaction Rules

- Username and password are the only initial choices.
- Account role determines the destination automatically.
- Child accounts land in their own arcade and cannot see profile creation or parent controls.
- Parent accounts land in the dashboard and may explicitly enter Parent Free Play.
- Sign out always returns to the common sign-in screen.
- All primary controls have a minimum 44px touch target and a visible keyboard focus treatment.
- Browser zoom remains available.
