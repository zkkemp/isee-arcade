'use client';

import { useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * Native named <details> elements give us accessible, exclusive accordions, but
 * Safari can preserve the old scroll offset after it collapses the previously
 * open shelf. That leaves the newly opened shelf's heading above the viewport
 * and makes the player appear to have landed at the bottom of its games.
 *
 * Wait until both native toggles have finished, then anchor the category heading
 * just below the safe area. The correction runs only after a real tap or
 * keyboard activation, never during the initial server render.
 */
export default function StableGameCategory({
  accent,
  initiallyOpen,
  children,
}: {
  accent: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const userInitiated = useRef(false);

  const rememberIntent = () => {
    userInitiated.current = true;
  };

  return (
    <details
      ref={detailsRef}
      name="game-library"
      className="game-category overflow-hidden"
      style={
        {
          '--category-accent': accent,
          scrollMarginTop: 'calc(env(safe-area-inset-top) + 0.75rem)',
        } as CSSProperties
      }
      open={initiallyOpen || undefined}
      onPointerDown={rememberIntent}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') rememberIntent();
      }}
      onToggle={() => {
        const details = detailsRef.current;
        if (!details?.open || !userInitiated.current) return;
        userInitiated.current = false;
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            details.scrollIntoView({ block: 'start', behavior: 'smooth' });
          });
        });
      }}
    >
      {children}
    </details>
  );
}
