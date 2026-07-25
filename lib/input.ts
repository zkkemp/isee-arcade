'use client';

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * One input surface for keyboard and on-screen buttons.
 *
 * Games read two different styles from it:
 *  - `held` for continuous movement (platformer walking, snake steering)
 *  - `consumeTap()` for discrete one-cell moves (frogger hops)
 * Taps are queued rather than sampled so a fast double-tap is never dropped
 * between animation frames.
 */
export class InputController {
  held: Record<Direction, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
  };

  private tapQueue: Direction[] = [];
  private jumpEdge = false;
  jumpHeld = false;

  press(dir: Direction): void {
    if (!this.held[dir]) this.tapQueue.push(dir);
    this.held[dir] = true;
  }

  release(dir: Direction): void {
    this.held[dir] = false;
  }

  /** Queues a hop without implying the key is being held. */
  tap(dir: Direction): void {
    this.tapQueue.push(dir);
    if (this.tapQueue.length > 3) this.tapQueue.shift();
  }

  consumeTap(): Direction | null {
    return this.tapQueue.shift() ?? null;
  }

  pressJump(): void {
    if (!this.jumpHeld) this.jumpEdge = true;
    this.jumpHeld = true;
  }

  releaseJump(): void {
    this.jumpHeld = false;
  }

  /** True once per press. Lets the platformer avoid auto-bouncing on a held button. */
  consumeJump(): boolean {
    const j = this.jumpEdge;
    this.jumpEdge = false;
    return j;
  }

  clear(): void {
    this.held = { up: false, down: false, left: false, right: false };
    this.tapQueue = [];
    this.jumpEdge = false;
    this.jumpHeld = false;
  }
}

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

const JUMP_KEYS = new Set([' ', 'Spacebar', 'z', 'Z', 'ArrowUp', 'w', 'W']);

/** Wires window keyboard events into a controller. Returns a cleanup function. */
export function bindKeyboard(input: InputController): () => void {
  const onDown = (e: KeyboardEvent) => {
    const dir = KEY_MAP[e.key];
    if (dir) {
      // Arrow keys scroll the page on iPad-with-keyboard and in desktop Safari.
      e.preventDefault();
      input.press(dir);
    }
    if (JUMP_KEYS.has(e.key)) {
      e.preventDefault();
      input.pressJump();
    }
  };
  const onUp = (e: KeyboardEvent) => {
    const dir = KEY_MAP[e.key];
    if (dir) input.release(dir);
    if (JUMP_KEYS.has(e.key)) input.releaseJump();
  };
  const onBlur = () => input.clear();

  window.addEventListener('keydown', onDown, { passive: false });
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
  };
}
