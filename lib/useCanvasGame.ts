'use client';

import { useEffect, useRef } from 'react';

type StepFn = (ctx: CanvasRenderingContext2D, dt: number, now: number) => void;

/**
 * Canvas plumbing shared by every game: crisp rendering on retina screens, a
 * fixed logical coordinate space, and a delta-timed animation loop that stops
 * cleanly when the study gate pauses play.
 *
 * `step` is kept in a ref so a game can close over fresh React state each
 * render without tearing down and restarting the loop.
 */
export function useCanvasGame(opts: {
  width: number;
  height: number;
  active: boolean;
  step: StepFn;
}) {
  const { width, height, active, step } = opts;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stepRef = useRef(step);

  // Declared before the loop effect so the freshest `step` is in place before
  // any frame runs, both on mount and on every subsequent render.
  useEffect(() => {
    stepRef.current = step;
  });

  // Size the backing store to the device pixel ratio once per mount / resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const apply = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
      }
    };

    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [width, height]);

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
      stepRef.current(ctx, dt, now);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  /** Draws a single frame outside the loop, e.g. right after a reset while paused. */
  const drawOnce = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) stepRef.current(ctx, 0, performance.now());
  };

  return { canvasRef, drawOnce };
}
