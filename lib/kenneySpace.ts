'use client';

import { useEffect, useState } from 'react';

/**
 * A deliberately small selection from Kenney's Space Shooter Remastered pack.
 * The complete pack was reviewed, but only the sprites used by the two games
 * ship to children. See public/assets/kenney/space-shooter/KENNEY-LICENSE.txt.
 */
export const KENNEY_SPACE_SPRITES = [
  'player-ship-blue',
  'enemy-blue',
  'enemy-green',
  'enemy-red',
  'meteor-big-1',
  'meteor-big-2',
  'meteor-big-3',
  'meteor-big-4',
  'meteor-medium',
  'meteor-small',
  'shield',
] as const;

export type KenneySpaceSpriteName = (typeof KENNEY_SPACE_SPRITES)[number];
export type KenneySpaceSprites = Record<KenneySpaceSpriteName, HTMLImageElement>;

function loadImage(name: KenneySpaceSpriteName): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load Kenney space sprite: ${name}`));
    image.src = `/assets/kenney/space-shooter/${name}.png`;
  });
}

let pending: Promise<KenneySpaceSprites> | null = null;

export function loadKenneySpaceSprites(): Promise<KenneySpaceSprites> {
  if (!pending) {
    pending = Promise.all(KENNEY_SPACE_SPRITES.map(loadImage)).then(
      (images) =>
        Object.fromEntries(
          KENNEY_SPACE_SPRITES.map((name, index) => [name, images[index]]),
        ) as KenneySpaceSprites,
    );
  }
  return pending;
}

/**
 * Games retain their procedural fallbacks until the images arrive, so slow or
 * offline asset loading never leaves a blank playfield or blocks the loop.
 */
export function useKenneySpaceSprites(): KenneySpaceSprites | null {
  const [sprites, setSprites] = useState<KenneySpaceSprites | null>(null);

  useEffect(() => {
    let alive = true;
    loadKenneySpaceSprites()
      .then((loaded) => {
        if (alive) setSprites(loaded);
      })
      .catch((error) => {
        console.error('Kenney space sprites failed to load', error);
      });
    return () => {
      alive = false;
    };
  }, []);

  return sprites;
}
