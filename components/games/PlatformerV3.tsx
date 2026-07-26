'use client';

import type { GameCanvasProps } from '@/lib/games';
import PlatformerV2 from './PlatformerV2';

/**
 * Coin Runner: Skybound Kingdom.
 *
 * A deliberately thin edition wrapper: it shares V2's verifier-proven world
 * generation, collision, movement, scoring, gates, and touch controls while
 * selecting V3's panoramic original art and crystal-sky presentation.
 */
export default function PlatformerV3(props: GameCanvasProps) {
  return <PlatformerV2 {...props} edition="skybound" />;
}
