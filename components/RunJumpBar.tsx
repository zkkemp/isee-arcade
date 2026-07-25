'use client';

import type { Direction, InputController } from '@/lib/input';

/**
 * Run and jump controls in a strip BELOW the canvas rather than on top of it.
 *
 * When these sat over the canvas the game had to reserve a band at the bottom to
 * stay clear of them, which pushed the whole playfield down to thumb level and
 * left half the screen as empty sky. Giving them their own space lets the canvas
 * be a proper window near the top.
 */
export default function RunJumpBar({
  input,
  accent,
  disabled,
}: {
  input: InputController;
  accent: string;
  disabled: boolean;
}) {
  const hold = (dir: Direction) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
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

  if (disabled) return null;

  const btn =
    'flex items-center justify-center rounded-2xl border-2 font-bold transition active:scale-95 select-none';

  return (
    <div
      className="flex flex-shrink-0 items-stretch gap-2.5 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))]"
      style={{ touchAction: 'none' }}
    >
      <button
        type="button"
        aria-label="Move left"
        className={`${btn} h-[76px] w-[84px] text-2xl`}
        style={{ borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.07)', color: '#fff' }}
        {...hold('left')}
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="Move right"
        className={`${btn} h-[76px] w-[84px] text-2xl`}
        style={{ borderColor: 'rgba(255,255,255,0.22)', background: 'rgba(255,255,255,0.07)', color: '#fff' }}
        {...hold('right')}
      >
        ▶
      </button>

      {/* Jump is the big one, and tapping the right half of the game works too. */}
      <button
        type="button"
        aria-label="Jump"
        className={`${btn} h-[76px] flex-1 text-sm uppercase tracking-[0.2em]`}
        style={{ borderColor: `${accent}99`, background: `${accent}26`, color: accent }}
        onPointerDown={(e) => {
          e.preventDefault();
          input.pressJump();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          input.releaseJump();
        }}
        onPointerCancel={() => input.releaseJump()}
        onContextMenu={(e) => e.preventDefault()}
      >
        Jump
      </button>
    </div>
  );
}
