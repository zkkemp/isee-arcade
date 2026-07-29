import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

export const alt =
  'ISEE Arcade — practice unlocks real games, creative avatars, and family learning progress.';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

async function imageData(path: string): Promise<string> {
  const source = await readFile(join(process.cwd(), 'public', path));
  const data = path.endsWith('.webp') ? await sharp(source).png().toBuffer() : source;
  return `data:image/png;base64,${data.toString('base64')}`;
}

export default async function OpenGraphImage() {
  const [logo, colton, aria, nimbus, berrywing] = await Promise.all([
    imageData('icon-512.png'),
    imageData('avatars/colton.webp'),
    imageData('avatars/aria.webp'),
    imageData('avatars/nimbus.webp'),
    imageData('avatars/berrywing.webp'),
  ]);

  const avatars = [
    { src: colton, label: 'Kid avatar' },
    { src: aria, label: 'Kid avatar' },
    { src: nimbus, label: 'Nimbus character' },
    { src: berrywing, label: 'Berrywing character' },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: '#070713',
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
              'radial-gradient(circle at 78% 44%, rgba(0, 119, 255, 0.34), transparent 36%), radial-gradient(circle at 19% 14%, rgba(124, 58, 237, 0.2), transparent 32%), linear-gradient(118deg, #070713 0%, #09142f 58%, #050814 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 48,
            right: 48,
            top: 38,
            height: 7,
            display: 'flex',
            background: '#ffd21c',
            boxShadow: '9px 9px 0 #087cff',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: -82,
            bottom: -165,
            width: 430,
            height: 430,
            display: 'flex',
            borderRadius: 215,
            background: 'rgba(19, 76, 180, 0.18)',
          }}
        />

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            width: 715,
            height: '100%',
            padding: '78px 28px 52px 58px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: '#ffd21c',
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 3.2,
            }}
          >
            STUDY. PLAY. LEVEL UP.
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 28,
              maxWidth: 650,
              fontSize: 75,
              lineHeight: 0.98,
              fontWeight: 900,
              letterSpacing: -2.2,
            }}
          >
            <span>Practice earns</span>
            <span style={{ color: '#52c7ff' }}>real play.</span>
          </div>

          <div
            style={{
              display: 'flex',
              maxWidth: 615,
              marginTop: 27,
              color: '#d7e7ff',
              fontSize: 27,
              lineHeight: 1.32,
              fontWeight: 600,
            }}
          >
            Adaptive learning, 51 games, and a player for every imagination.
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {avatars.map((avatar, index) => (
                <div
                  key={avatar.label + index}
                  style={{
                    display: 'flex',
                    width: 82,
                    height: 82,
                    marginLeft: index === 0 ? 0 : -13,
                    padding: 4,
                    borderRadius: 22,
                    background: index < 2 ? '#a5f3fc' : '#c4b5fd',
                    boxShadow: '8px 10px 22px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <img
                    src={avatar.src}
                    alt={avatar.label}
                    width={74}
                    height={74}
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: 18,
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginLeft: 22,
              }}
            >
              <span
                style={{
                  color: '#f8fbff',
                  fontSize: 21,
                  fontWeight: 800,
                }}
              >
                88 playable avatars
              </span>
              <span
                style={{
                  marginTop: 5,
                  color: '#9acbff',
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                People, creatures, aliens &amp; more
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: 435,
            height: 530,
            marginTop: 68,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 38,
            background: '#081638',
            boxShadow: '16px 20px 0 rgba(0, 56, 150, 0.48)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 17,
              display: 'flex',
              borderRadius: 28,
              border: '2px solid rgba(82, 199, 255, 0.35)',
            }}
          />
          <img
            src={logo}
            alt="ISEE Arcade"
            width={402}
            height={402}
            style={{
              width: 402,
              height: 402,
              borderRadius: 28,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 34,
              right: 34,
              bottom: 23,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 46,
              borderRadius: 12,
              background: '#ffd21c',
              color: '#241900',
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: 1.3,
            }}
          >
            FAMILY LEARNING ARCADE
          </div>
        </div>
      </div>
    ),
    size,
  );
}
