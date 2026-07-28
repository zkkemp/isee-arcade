'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { drawCharacterFace, type Character } from '@/lib/characters';

/**
 * A character's face on its own small canvas.
 *
 * Redrawn at device pixel ratio rather than scaled with CSS, so it stays crisp on
 * a Retina iPad instead of going soft the way an upscaled bitmap would.
 */
export default function CharacterFace({
  character,
  size,
  className,
  look = 0,
}: {
  character: Character;
  size: number;
  className?: string;
  look?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const portrait = character.portrait;

  useEffect(() => {
    if (portrait) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // Inset slightly: ears and stray hair are drawn outside the head radius.
    drawCharacterFace(ctx, character, size / 2, size / 2, size * 0.82, { look });
  }, [character, size, look, portrait]);

  if (portrait) {
    return (
      <Image
        src={portrait}
        width={size}
        height={size}
        alt={character.name}
        className={`object-cover ${className ?? ''}`}
        draggable={false}
      />
    );
  }

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
      aria-label={character.name}
      role="img"
    />
  );
}
