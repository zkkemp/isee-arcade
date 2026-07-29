'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { Direction, InputController } from '@/lib/input';

/**
 * Split two-thumb controls in a strip BELOW the canvas, for the games that move a
 * cell at a time - Dot Muncher, Byte Snake, Road Hopper, and Tetra Stack.
 *
 * The history: invisible tap-zones were "not working"; a single centred plus-pad
 * was "one giant controller in the middle" and still awkward. This is the
 * requested layout - two hands, split: a LEFT-thumb cluster in the bottom-left
 * with ◀ / ▶, and a RIGHT-thumb cluster in the bottom-right with ▲ / ▼. Both
 * thumbs rest where they naturally fall on an iPad held in two hands, and the
 * whole play area is still a swipe surface (see TouchOverlay), so a flick works
 * too. For Tetra the mapping reads the same way it plays: left cluster moves the
 * piece left/right, the right cluster's ▲ rotates and ▼ soft-drops.
 *
 * Each press fires one tap immediately, then auto-repeats while held so holding a
 * direction keeps you going without machine-gun tapping. Games consume one tap
 * per frame, so repeats can never outrun the game.
 */
export default function DPad({
  input,
  accent,
  disabled,
}: {
  input: InputController;
  accent: string;
  disabled: boolean;
}) {
  const repeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (repeatRef.current) {
      clearInterval(repeatRef.current);
      repeatRef.current = null;
    }
  }, []);

  // A press that ends while the tab is hidden or the component unmounts must not
  // leave an interval firing taps forever.
  useEffect(() => stop, [stop]);

  const press = useCallback(
    (dir: Direction) => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      input.tap(dir);
      stop();
      // Hold to keep going. 130ms is brisk enough to feel responsive but slow
      // enough that a deliberate single press is still a single move.
      repeatRef.current = setInterval(() => input.tap(dir), 130);
    },
    [input, stop],
  );

  if (disabled) return null;

  const btn =
    'flex items-center justify-center rounded-2xl border-2 font-bold text-white transition active:scale-95 select-none touch-none';

  const handlers = (dir: Direction) => ({
    onPointerDown: press(dir),
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      stop();
    },
    onPointerCancel: stop,
    onLostPointerCapture: stop,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const neutral = { borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.07)' };
  const accented = { borderColor: `${accent}99`, background: `${accent}22`, color: accent };

  return (
    <div
      className="flex flex-shrink-0 items-end justify-between px-1 pb-1.5 sm:px-3"
      style={{ touchAction: 'none' }}
    >
      {/* LEFT thumb: move left / right, side by side. */}
      <div className="flex gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Move left"
          className={`${btn} h-16 w-[4.5rem] text-2xl sm:h-20 sm:w-24 sm:text-3xl`}
          style={neutral}
          {...handlers('left')}
        >
          ◀
        </button>
        <button
          type="button"
          aria-label="Move right"
          className={`${btn} h-16 w-[4.5rem] text-2xl sm:h-20 sm:w-24 sm:text-3xl`}
          style={neutral}
          {...handlers('right')}
        >
          ▶
        </button>
      </div>

      {/* RIGHT thumb: up over down. */}
      <div className="flex flex-col gap-2 sm:gap-3">
        <button
          type="button"
          aria-label="Move up"
          className={`${btn} h-[3.4rem] w-[4.5rem] text-2xl sm:h-[4.4rem] sm:w-24 sm:text-3xl`}
          style={accented}
          {...handlers('up')}
        >
          ▲
        </button>
        <button
          type="button"
          aria-label="Move down"
          className={`${btn} h-[3.4rem] w-[4.5rem] text-2xl sm:h-[4.4rem] sm:w-24 sm:text-3xl`}
          style={accented}
          {...handlers('down')}
        >
          ▼
        </button>
      </div>
    </div>
  );
}
