'use client';

import { useEffect, useState } from 'react';

/**
 * Sprite atlas loading.
 *
 * Art is Kenney's New Platformer Pack (CC0) — see
 * public/assets/sprites/KENNEY-LICENSE.txt. Each category ships as one PNG plus
 * a JSON frame map generated from the pack's XML, so there is no XML parsing at
 * runtime and one HTTP request per category.
 *
 * 433 frames across four atlases, 268 KB total.
 */

/** [x, y, width, height] within the atlas image. */
export type Frame = [number, number, number, number];

export const ATLAS_NAMES = ['backgrounds', 'characters', 'enemies', 'tiles'] as const;
export type AtlasName = (typeof ATLAS_NAMES)[number];

export type Atlas = {
  image: HTMLImageElement;
  frames: Record<string, Frame>;
};

/**
 * Top-down cars, from Kenney's Racing Pack (CC0) — see
 * public/assets/sprites/cars/KENNEY-RACING-LICENSE.txt. Only five were needed,
 * so they stay as individual files rather than an atlas.
 */
export const CAR_NAMES = [
  'car_blue_1',
  'car_red_1',
  'car_yellow_1',
  'car_green_1',
  'car_black_small_1',
] as const;

export type SpriteSet = Record<AtlasName, Atlas> & {
  cars: Record<string, HTMLImageElement>;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

async function loadAtlas(name: AtlasName): Promise<Atlas> {
  const [image, frames] = await Promise.all([
    loadImage(`/assets/sprites/${name}.png`),
    fetch(`/assets/sprites/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`failed to load ${name}.json`);
      return r.json() as Promise<Record<string, Frame>>;
    }),
  ]);
  return { image, frames };
}

// Module-level so navigating between games does not re-download anything.
let pending: Promise<SpriteSet> | null = null;

export function loadSprites(): Promise<SpriteSet> {
  if (!pending) {
    pending = Promise.all([
      Promise.all(ATLAS_NAMES.map(loadAtlas)),
      Promise.all(CAR_NAMES.map((n) => loadImage(`/assets/sprites/cars/${n}.png`))),
    ]).then(([[backgrounds, characters, enemies, tiles], carImages]) => ({
      backgrounds,
      characters,
      enemies,
      tiles,
      cars: Object.fromEntries(CAR_NAMES.map((n, i) => [n, carImages[i]])),
    }));
  }
  return pending;
}

/**
 * Returns the atlases once loaded, or null while loading. Games draw a simple
 * placeholder until it resolves rather than blocking the whole page.
 */
export function useSprites(): SpriteSet | null {
  const [set, setSet] = useState<SpriteSet | null>(null);

  useEffect(() => {
    let alive = true;
    loadSprites()
      .then((s) => {
        if (alive) setSet(s);
      })
      .catch((err) => {
        // A missing atlas should not take the game down — the renderers fall
        // back to flat shapes when this stays null.
        console.error('sprite load failed', err);
      });
    return () => {
      alive = false;
    };
  }, []);

  return set;
}

/**
 * Draws one named frame. Silently skips unknown names so a typo degrades to a
 * missing sprite rather than a crashed animation loop.
 */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  name: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  flipX = false,
): void {
  const f = atlas.frames[name];
  if (!f) return;
  const [sx, sy, sw, sh] = f;

  if (flipX) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas.image, sx, sy, sw, sh, 0, 0, dw, dh);
    ctx.restore();
    return;
  }
  ctx.drawImage(atlas.image, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Draws a whole image rotated about its center. The car sprites point up, so
 * horizontal traffic needs a quarter turn.
 */
export function drawRotated(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  w: number,
  h: number,
  radians: number,
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radians);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** Picks a frame from a list by elapsed time, for looping animations. */
export function animFrame(names: string[], time: number, fps = 8): string {
  return names[Math.floor(time * fps) % names.length];
}
