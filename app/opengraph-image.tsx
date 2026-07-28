import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/*
 * THESIS: Sharing should feel like handing someone an arcade marquee, not a blank
 * browser link. OWN-WORLD: midnight navy, electric blue, trophy gold, and the
 * established brain-and-bolt key art. STORY: this is a family learning arcade
 * where real practice unlocks real play. FIRST VIEWPORT: oversized brand art owns
 * the left half; a short promise and product URL anchor the right. FORM: a narrow
 * extension of the existing identity, composed as a cinematic 1200×630 title card.
 */

export const alt =
  'ISEE Arcade — a family learning arcade with real games, adaptive practice, and saved progress.';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const logoData = await readFile(join(process.cwd(), 'public/icon-512.png'), 'base64');
  const logoSrc = `data:image/png;base64,${logoData}`;

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#020617',
          color: '#f8fbff',
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'radial-gradient(circle at 25% 48%, rgba(0, 119, 255, 0.38), transparent 42%), linear-gradient(118deg, #020617 0%, #061744 58%, #020617 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            left: 32,
            top: 34,
            width: 548,
            height: 562,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 48,
            background: 'rgba(0, 31, 112, 0.58)',
            boxShadow: '0 28px 70px rgba(0, 91, 255, 0.34)',
          }}
        >
          {/* ImageResponse supports data-URI image sources for local assets. */}
          <img
            src={logoSrc}
            alt=""
            width="512"
            height="512"
            style={{
              width: 512,
              height: 512,
              borderRadius: 38,
            }}
          />
        </div>

        <div
          style={{
            position: 'relative',
            marginLeft: 620,
            width: 520,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingRight: 52,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: 30,
              color: '#ffd21c',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 3.5,
            }}
          >
            BUILT FOR FAMILIES
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 72,
              lineHeight: 0.98,
              fontWeight: 900,
              letterSpacing: -2,
            }}
          >
            <span>REAL GAMES.</span>
            <span style={{ color: '#52c7ff' }}>SMARTER PRACTICE.</span>
          </div>

          <div
            style={{
              display: 'flex',
              maxWidth: 470,
              marginTop: 30,
              color: '#d7e7ff',
              fontSize: 28,
              lineHeight: 1.3,
              fontWeight: 600,
            }}
          >
            Study, play, and build progress that follows every learner.
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 46,
              color: '#9acbff',
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            isee-arcade.vercel.app
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 38,
            top: 38,
            width: 13,
            height: 92,
            display: 'flex',
            background: '#ffd21c',
            boxShadow: '8px 10px 0 #006dff',
          }}
        />
      </div>
    ),
    size,
  );
}
