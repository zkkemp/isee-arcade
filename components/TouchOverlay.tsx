'use client';

import { useEffect, useRef, useState } from 'react';
import type { ControlScheme } from '@/lib/games';
import type { Direction, InputController } from '@/lib/input';

/**
 * Touch controls layered directly over the canvas instead of a small d-pad
 * underneath it.
 *
 * - run-jump: two hold-to-move buttons in the bottom-left, and the entire right
 *   side of the screen is the jump button. You never have to aim for a target.
 * - dpad: the four edges of the play area are tap zones, so a hop is a tap in
 *   the direction you want to go.
 *
 * Pointer events (not click) so holding reads as held, and touch-action:none so
 * dragging a thumb never scrolls the page.
 */
export default function TouchOverlay({
  scheme,
  input,
  accent,
  disabled,
}: {
  scheme: ControlScheme;
  input: InputController;
  accent: string;
  disabled: boolean;
}) {
  // The hint is for the first run only; it gets in the way after that.
  const [showHint, setShowHint] = useState(true);

  // Zone geometry is measured rather than expressed in percentages, because the
  // up/down zones deliberately straddle two different boxes: they cover the
  // board's top/bottom third AND the frame band beyond it, while left/right stay
  // on the board. That cannot be written as one set of CSS percentages.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    // Belt and braces: a ResizeObserver alone was observed not refreshing after a
    // viewport change, which would leave the zones positioned for the previous
    // orientation after an iPad rotate.
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

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

  const tap = (dir: Direction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      setShowHint(false);
      input.tap(dir);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

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
    // Tap a half to move that way; flick upward anywhere to jump. No buttons on
    // screen, because a runner needs the whole view unobstructed.
    let downY = 0;
    let downT = 0;
    const onDown = (e: React.PointerEvent) => {
      downY = e.clientY;
      downT = e.timeStamp;
    };
    const onUp = (dir: Direction) => (e: React.PointerEvent) => {
      e.preventDefault();
      setShowHint(false);
      const dy = downY - e.clientY;
      const dt = e.timeStamp - downT;
      // A quick upward flick is a jump; anything else is a lane change.
      if (dy > 28 && dt < 500) input.pressJump();
      else input.tap(dir);
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
            Tap a side to move · flick up to jump
          </span>
        )}
      </div>
    );
  }

  if (scheme === 'run-jump') {
    // Only the jump zone lives over the canvas now. The run buttons moved to a
    // strip below it, because when they sat on the canvas the playfield had to be
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

  // dpad zones.
  //
  // Left and right stay on the board. Up and down cover the board's top and
  // bottom thirds AND continue out into the frame bands above and below it,
  // because that is where a thumb naturally lands - the player reported reaching
  // up into the banner and nothing happening.
  const side = Math.min(box.w, box.h);
  const boardLeft = (box.w - side) / 2;
  const boardTop = (box.h - side) / 2;
  const sideInset = side * 0.24;
  const band = side * 0.34;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 z-10 select-none"
      style={{ touchAction: 'none' }}
    >
      {side > 0 && (
        <>
          <button
            type="button"
            aria-label="Move up"
            className="absolute"
            style={{
              left: boardLeft + sideInset,
              width: side - sideInset * 2,
              top: 0,
              height: boardTop + band,
            }}
            {...tap('up')}
          >
            {showHint && (
              <Chevron glyph="▲" accent={accent} style={{ bottom: 6 }} />
            )}
          </button>

          <button
            type="button"
            aria-label="Move down"
            className="absolute"
            style={{
              left: boardLeft + sideInset,
              width: side - sideInset * 2,
              top: boardTop + side - band,
              height: box.h - (boardTop + side - band),
            }}
            {...tap('down')}
          >
            {showHint && <Chevron glyph="▼" accent={accent} style={{ top: 6 }} />}
          </button>

          <button
            type="button"
            aria-label="Move left"
            className="absolute"
            style={{ left: boardLeft, width: sideInset, top: boardTop, height: side }}
            {...tap('left')}
          >
            {showHint && (
              <Chevron glyph="◀" accent={accent} style={{ top: '50%', marginTop: -12 }} />
            )}
          </button>

          <button
            type="button"
            aria-label="Move right"
            className="absolute"
            style={{
              left: boardLeft + side - sideInset,
              width: sideInset,
              top: boardTop,
              height: side,
            }}
            {...tap('right')}
          >
            {showHint && (
              <Chevron glyph="▶" accent={accent} style={{ top: '50%', marginTop: -12 }} />
            )}
          </button>

          {showHint && (
            <span
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80"
              style={{ top: boardTop + side / 2 - 12 }}
            >
              Tap a side to move
            </span>
          )}
        </>
      )}
    </div>
  );
}

function Chevron({
  glyph,
  accent,
  style,
}: {
  glyph: string;
  accent: string;
  style: React.CSSProperties;
}) {
  return (
    <span
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xl opacity-70"
      style={{ color: accent, ...style }}
    >
      {glyph}
    </span>
  );
}
