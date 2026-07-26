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
/**
 * Inline style shared by every button here, on top of the `select-none`
 * class. The bug this exists to kill: a fast press-and-hold on iOS Safari can
 * still trigger the native text-selection callout (the little copy/lookup
 * bubble, or the magnifier loupe) even when `user-select` is `none`, because
 * that callout is gated by a SEPARATE webkit-only property. `touch-action`
 * belongs on every button too, not just the row container - Safari has been
 * seen to honour it per-element rather than only inherited from an ancestor.
 */
const noCallout: React.CSSProperties = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

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
    onPointerCancel: (e: React.PointerEvent) => {
      e.preventDefault();
      input.release(dir);
    },
    onLostPointerCapture: (e: React.PointerEvent) => {
      e.preventDefault();
      input.release(dir);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  if (disabled) return null;

  const btn =
    'flex items-center justify-center rounded-2xl border-2 font-bold transition active:scale-95 select-none';

  return (
    <div
      className="flex flex-shrink-0 items-stretch gap-2.5 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] select-none"
      style={noCallout}
    >
      <button
        type="button"
        aria-label="Move left"
        className={`${btn} h-[104px] w-[100px] text-3xl`}
        style={{
          borderColor: 'rgba(255,255,255,0.22)',
          background: 'rgba(255,255,255,0.07)',
          color: '#fff',
          ...noCallout,
        }}
        {...hold('left')}
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="Move right"
        className={`${btn} h-[104px] w-[100px] text-3xl`}
        style={{
          borderColor: 'rgba(255,255,255,0.22)',
          background: 'rgba(255,255,255,0.07)',
          color: '#fff',
          ...noCallout,
        }}
        {...hold('right')}
      >
        ▶
      </button>

      {/* Jump is the big one, and tapping the right half of the game works too. */}
      <button
        type="button"
        aria-label="Jump"
        className={`${btn} h-[104px] flex-1 text-base uppercase tracking-[0.2em]`}
        style={{ borderColor: `${accent}99`, background: `${accent}26`, color: accent, ...noCallout }}
        onPointerDown={(e) => {
          e.preventDefault();
          input.pressJump();
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          input.releaseJump();
        }}
        onPointerCancel={(e) => {
          e.preventDefault();
          input.releaseJump();
        }}
        onLostPointerCapture={(e) => {
          e.preventDefault();
          input.releaseJump();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        Jump
      </button>
    </div>
  );
}
