'use client';

import { useCallback, useRef } from 'react';
import type { Direction, InputController } from '@/lib/input';

/**
 * A real four-way control pad in a strip BELOW the canvas, for the games that
 * move a cell at a time - Dot Muncher, Byte Snake, Road Hopper.
 *
 * The old scheme was invisible tap-zones layered over the play area, and the
 * feedback was blunt and repeated: "the controls are still not working", "too
 * hard to move". A thumb had nothing to aim at. This is the opposite: big,
 * obvious, labelled buttons that sit where the thumb already rests, plus the
 * whole play area is a swipe surface (see TouchOverlay). Between the two you can
 * either flick the board or press the pad, whichever feels natural.
 *
 * Each press fires one tap immediately, then auto-repeats while held so holding
 * "up" keeps you hopping or steering without machine-gun tapping. Games consume
 * one tap per frame, so repeats can never outrun the game.
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

  const cell =
    'flex items-center justify-center rounded-2xl border-2 text-2xl font-bold text-white transition active:scale-95 select-none';
  const cellStyle = {
    borderColor: 'rgba(255,255,255,0.22)',
    background: 'rgba(255,255,255,0.07)',
  };
  const upDownStyle = { borderColor: `${accent}99`, background: `${accent}22`, color: accent };

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

  return (
    <div
      className="flex flex-shrink-0 items-center justify-center pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      style={{ touchAction: 'none' }}
    >
      {/* A plus laid out on a 3x3 grid: the four arms are the buttons, the
          corners and centre are empty spacers. */}
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        <span />
        <button
          type="button"
          aria-label="Move up"
          className={`${cell} h-16 w-20`}
          style={upDownStyle}
          {...handlers('up')}
        >
          ▲
        </button>
        <span />

        <button
          type="button"
          aria-label="Move left"
          className={`${cell} h-16 w-20`}
          style={cellStyle}
          {...handlers('left')}
        >
          ◀
        </button>
        <span />
        <button
          type="button"
          aria-label="Move right"
          className={`${cell} h-16 w-20`}
          style={cellStyle}
          {...handlers('right')}
        >
          ▶
        </button>

        <span />
        <button
          type="button"
          aria-label="Move down"
          className={`${cell} h-16 w-20`}
          style={upDownStyle}
          {...handlers('down')}
        >
          ▼
        </button>
        <span />
      </div>
    </div>
  );
}
