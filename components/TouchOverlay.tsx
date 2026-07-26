'use client';

import { useEffect, useState } from 'react';
import type { ControlScheme } from '@/lib/games';
import type { Direction, InputController } from '@/lib/input';

/**
 * Touch controls layered over the canvas.
 *
 * - dpad: the whole play area is a swipe surface - flick up/down/left/right to
 *   move. There is ALSO a real button pad below the canvas (see DPad), so you
 *   can flick the board or press the pad, whichever feels natural. The old
 *   invisible tap-zones were replaced after repeated "controls not working" /
 *   "too hard to move" feedback: a swipe is unambiguous and a labelled pad gives
 *   the thumb something to aim at.
 * - lanes: tap a half to change lane; flick up ANYWHERE to jump, on a very
 *   forgiving threshold ("make it way easier to swipe up anywhere").
 * - paddle: drag anywhere and the paddle follows.
 * - grid: tap and drag on a puzzle board, both axes reported.
 * - run-jump: the right half is the jump button; run buttons live in a strip
 *   below the canvas.
 *
 * Pointer events (not click) so holding reads as held, and touch-action:none so
 * dragging a thumb never scrolls the page.
 */

/** A flick this many CSS px in the dominant axis counts as a swipe. Low, so a
 *  small nudge already moves - the whole complaint was that moving was hard. */
const SWIPE_MIN = 22;
/** A shorter upward flick jumps, because the runner jump had to get much easier. */
const JUMP_MIN = 18;

export default function TouchOverlay({
  scheme,
  input,
  disabled,
}: {
  scheme: ControlScheme;
  input: InputController;
  disabled: boolean;
}) {
  // The hint is for the first run only; it gets in the way after that.
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    if (!showHint) return;
    const t = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(t);
  }, [showHint]);

  // Releasing everything when play pauses avoids resuming mid-move.
  useEffect(() => {
    if (disabled) input.clear();
  }, [disabled, input]);

  if (disabled) return null;

  if (scheme === 'grid') {
    // Puzzle boards need both axes and press/release edges, reported normalised
    // so the game works out cells from its own layout.
    const report = (e: React.PointerEvent, down: boolean) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      input.setPointer(
        Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        down,
      );
    };
    return (
      <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
        <button
          type="button"
          aria-label="Play board"
          className="absolute inset-0 h-full w-full"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            setShowHint(false);
            report(e, true);
          }}
          onPointerMove={(e) => {
            if (!input.pointerDown) return;
            report(e, true);
          }}
          onPointerUp={(e) => report(e, false)}
          onPointerCancel={(e) => report(e, false)}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
    );
  }

  if (scheme === 'paddle') {
    // Drag anywhere: the paddle follows the finger. Reported normalised so the
    // game does not need to know the canvas size.
    const report = (e: React.PointerEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      input.setPointerX(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
    };
    return (
      <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
        <button
          type="button"
          aria-label="Move paddle"
          className="absolute inset-0 h-full w-full"
          onPointerDown={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            setShowHint(false);
            report(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 0 && e.pointerType === 'mouse') return;
            report(e);
          }}
          onPointerUp={() => input.setPointerX(null)}
          onPointerCancel={() => input.setPointerX(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {showHint && (
            <span className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80">
              Drag to move
            </span>
          )}
        </button>
      </div>
    );
  }

  if (scheme === 'lanes') {
    // Tap a half to change lane; flick upward ANYWHERE to jump. No buttons on
    // screen, because a runner needs the whole view unobstructed.
    let downX = 0;
    let downY = 0;
    const onDown = (e: React.PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (dir: Direction) => (e: React.PointerEvent) => {
      e.preventDefault();
      setShowHint(false);
      const dy = downY - e.clientY;
      const dx = e.clientX - downX;
      // Any real upward movement is a jump - deliberately generous. Only fall
      // back to a lane change when the gesture was not an upward flick.
      if (dy > JUMP_MIN && dy > Math.abs(dx)) {
        input.pressJump();
      } else {
        input.tap(dir);
      }
      // Jump is edge-triggered and consumed by the game, so release immediately.
      input.releaseJump();
    };
    return (
      <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
        {(['left', 'right'] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            aria-label={dir === 'left' ? 'Move left' : 'Move right'}
            className={`absolute inset-y-0 ${dir === 'left' ? 'left-0' : 'right-0'} w-1/2`}
            onPointerDown={onDown}
            onPointerUp={onUp(dir)}
            onContextMenu={(e) => e.preventDefault()}
          />
        ))}
        {showHint && (
          <span className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-white/80">
            Tap a side to move · swipe up to jump
          </span>
        )}
      </div>
    );
  }

  if (scheme === 'run-jump') {
    // Only the jump zone lives over the canvas. The run buttons moved to a strip
    // below it, because when they sat on the canvas the playfield had to be
    // squeezed down to thumb level to stay clear of them.
    return (
      <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
        <button
          type="button"
          aria-label="Jump"
          className="absolute inset-y-0 right-0 w-1/2"
          onPointerDown={(e) => {
            e.preventDefault();
            setShowHint(false);
            input.pressJump();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            input.releaseJump();
          }}
          onPointerCancel={() => input.releaseJump()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {showHint && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80">
              Tap to jump
            </span>
          )}
        </button>
      </div>
    );
  }

  // dpad: the entire play area is a 4-way swipe surface. A flick past SWIPE_MIN
  // in its dominant axis fires one move in that direction; the DPad below the
  // canvas covers precise single presses.
  let sx = 0;
  let sy = 0;
  const onSwipeDown = (e: React.PointerEvent) => {
    sx = e.clientX;
    sy = e.clientY;
  };
  const onSwipeUp = (e: React.PointerEvent) => {
    e.preventDefault();
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return;
    setShowHint(false);
    if (Math.abs(dx) > Math.abs(dy)) {
      input.tap(dx > 0 ? 'right' : 'left');
    } else {
      input.tap(dy > 0 ? 'down' : 'up');
    }
  };
  return (
    <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
      <button
        type="button"
        aria-label="Swipe to move"
        className="absolute inset-0 h-full w-full"
        onPointerDown={onSwipeDown}
        onPointerUp={onSwipeUp}
        onPointerCancel={onSwipeUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {showHint && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 px-4 py-1.5 text-center text-[11px] font-bold uppercase tracking-widest text-white/80">
            Swipe to move · or use the pad below
          </span>
        )}
      </button>
    </div>
  );
}
