'use client';

import type { ControlScheme } from '@/lib/games';
import type { Direction, InputController } from '@/lib/input';

/**
 * On-screen controls for touch devices. Writes into the same InputController the
 * keyboard uses, so games never care where a press came from.
 *
 * Pointer events (not click) so holding a button reads as held, and
 * touch-action:none so dragging a thumb across the pad does not scroll the page.
 */
export default function TouchControls({
  scheme,
  input,
  accent,
}: {
  scheme: ControlScheme;
  input: InputController;
  accent: string;
}) {
  const bind = (dir: Direction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      input.press(dir);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      input.release(dir);
    },
    onPointerCancel: () => input.release(dir),
    onPointerLeave: () => input.release(dir),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const jumpBind = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      input.pressJump();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      input.releaseJump();
    },
    onPointerCancel: () => input.releaseJump(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  const btn =
    'flex select-none items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] text-2xl font-bold text-white/80 active:bg-white/20 active:scale-95 transition';

  if (scheme === 'run-jump') {
    return (
      <div
        className="mt-3 flex w-full items-stretch justify-between gap-3 md:hidden"
        style={{ touchAction: 'none' }}
      >
        <div className="flex gap-3">
          <button type="button" aria-label="Move left" className={`${btn} h-20 w-20`} {...bind('left')}>
            ◀
          </button>
          <button type="button" aria-label="Move right" className={`${btn} h-20 w-20`} {...bind('right')}>
            ▶
          </button>
        </div>
        <button
          type="button"
          aria-label="Jump"
          className={`${btn} h-20 flex-1 text-base uppercase tracking-widest`}
          style={{ borderColor: `${accent}66`, color: accent }}
          {...jumpBind}
        >
          Jump
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex w-full justify-center md:hidden" style={{ touchAction: 'none' }}>
      <div className="grid grid-cols-3 grid-rows-3 gap-2">
        <span />
        <button type="button" aria-label="Up" className={`${btn} h-16 w-16`} {...bind('up')}>
          ▲
        </button>
        <span />
        <button type="button" aria-label="Left" className={`${btn} h-16 w-16`} {...bind('left')}>
          ◀
        </button>
        <span />
        <button type="button" aria-label="Right" className={`${btn} h-16 w-16`} {...bind('right')}>
          ▶
        </button>
        <span />
        <button type="button" aria-label="Down" className={`${btn} h-16 w-16`} {...bind('down')}>
          ▼
        </button>
        <span />
      </div>
    </div>
  );
}
