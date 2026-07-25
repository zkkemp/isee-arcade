'use client';

import { useEffect, useState } from 'react';
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

  const hold = (dir: Direction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      setShowHint(false);
      input.press(dir);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      input.release(dir);
    },
    onPointerCancel: () => input.release(dir),
    onLostPointerCapture: () => input.release(dir),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const tap = (dir: Direction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      setShowHint(false);
      input.tap(dir);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  if (scheme === 'run-jump') {
    return (
      <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }}>
        {/* Whole right side jumps. No aiming required. */}
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

        {/* Move buttons, bottom-left, thumb-sized. */}
        <div className="absolute bottom-5 left-4 flex gap-3">
          {(['left', 'right'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir === 'left' ? 'Move left' : 'Move right'}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 bg-white/25 text-2xl font-bold text-white shadow-lg backdrop-blur-md transition active:scale-90 active:bg-white/40"
              style={{ borderColor: 'rgba(255,255,255,0.7)' }}
              {...hold(dir)}
            >
              {dir === 'left' ? '◀' : '▶'}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // dpad: the edges of the PLAY AREA are the controls.
  //
  // The board is square and centred inside a taller canvas, so the zones have to
  // be confined to the board itself. Anchoring them to the whole canvas put "up"
  // and "down" on the empty frame bands above and below the board, which is
  // exactly where a thumb does not go.
  return (
    <div
      className="absolute inset-0 z-10 flex select-none items-center justify-center"
      style={{ touchAction: 'none' }}
    >
      <div
        className="relative aspect-square w-full"
        style={{ maxHeight: '100%', maxWidth: '100%' }}
      >
        <button
          type="button"
          aria-label="Move up"
          className="absolute left-[24%] right-[24%] top-0 h-[34%]"
          {...tap('up')}
        >
          {showHint && <Chevron glyph="▲" accent={accent} className="top-2" />}
        </button>
        <button
          type="button"
          aria-label="Move down"
          className="absolute bottom-0 left-[24%] right-[24%] h-[34%]"
          {...tap('down')}
        >
          {showHint && <Chevron glyph="▼" accent={accent} className="bottom-2" />}
        </button>
        <button
          type="button"
          aria-label="Move left"
          className="absolute bottom-0 left-0 top-0 w-[24%]"
          {...tap('left')}
        >
          {showHint && (
            <Chevron glyph="◀" accent={accent} className="left-2 top-1/2 -translate-y-1/2" />
          )}
        </button>
        <button
          type="button"
          aria-label="Move right"
          className="absolute bottom-0 right-0 top-0 w-[24%]"
          {...tap('right')}
        >
          {showHint && (
            <Chevron glyph="▶" accent={accent} className="right-2 top-1/2 -translate-y-1/2" />
          )}
        </button>

        {showHint && (
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80">
            Tap a side to move
          </span>
        )}
      </div>
    </div>
  );
}

function Chevron({
  glyph,
  accent,
  className,
}: {
  glyph: string;
  accent: string;
  className: string;
}) {
  return (
    <span
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 text-xl opacity-70 ${className}`}
      style={{ color: accent }}
    >
      {glyph}
    </span>
  );
}
