'use client';

import type { GameCanvasProps } from '@/lib/games';
import { useCanvasGame } from '@/lib/useCanvasGame';

/** Placeholder. Being built. */
export default function Breakout({ paused }: GameCanvasProps) {
  const { canvasRef } = useCanvasGame({
    active: !paused,
    step: (ctx, dt, cw, ch) => {
      ctx.fillStyle = '#141425';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('coming soon', cw / 2, ch / 2);
      ctx.textAlign = 'left';
    },
  });
  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />;
}
