'use client';

import { useEffect, useRef } from 'react';

/**
 * Canvas plumbing shared by every game.
 *
 * The canvas fills its container rather than using a fixed logical size, so a
 * game occupies the whole screen on a phone and on an iPad in either
 * orientation. `step` receives the current size in CSS pixels each frame and
 * decides what that means: the platformer widens its view, the grid games scale
 * and centre a fixed board.
 *
 * Retina handling and delta timing live here too, and the loop stops cleanly
 * when a question pauses play.
 */
type StepFn = (ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => void;

export function useCanvasGame(opts: { active: boolean; step: StepFn }) {
  const { active, step } = opts;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const stepRef = useRef(step);

  // Declared before the loop effect so the freshest `step` is in place before
  // any frame runs, on mount and on every subsequent render.
  useEffect(() => {
    stepRef.current = step;
  });

  // Track the element's rendered size and keep the backing store matched to it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const apply = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 3);

      // Reassigning width/height clears the canvas and resets the transform, so
      // only do it when the size actually changed.
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(canvas);
    window.addEventListener('orientationchange', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // Clamp dt so a backgrounded tab does not teleport everything on return.
      const dt = Math.min((now - last) / 1000, 1 / 20);
      last = now;
      const { w, h } = sizeRef.current;
      if (w > 0 && h > 0) stepRef.current(ctx, dt, w, h);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return { canvasRef };
}

/**
 * Scales a fixed-size board to fit the canvas and centres it, returning the
 * scale used. Call inside ctx.save()/restore(). Used by the grid games, whose
 * layouts are inherently square.
 */
export function fitBoard(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  boardW: number,
  boardH: number,
): number {
  const scale = Math.min(canvasW / boardW, canvasH / boardH);
  ctx.translate((canvasW - boardW * scale) / 2, (canvasH - boardH * scale) / 2);
  ctx.scale(scale, scale);
  return scale;
}
