import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

export const alt =
  'ISEE Arcade — studying earns playtime.';

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
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: 2.5,
            }}
          >
            STUDY. PLAY. LEVEL UP.
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 38,
              maxWidth: 650,
              fontSize: 84,
              lineHeight: 0.98,
              fontWeight: 900,
              letterSpacing: -2.2,
            }}
          >
            <span>Studying earns</span>
            <span style={{ color: '#52c7ff' }}>playtime.</span>
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
                    width: 108,
                    height: 108,
                    marginLeft: index === 0 ? 0 : -17,
                    padding: 5,
                    borderRadius: 27,
                    background: index < 2 ? '#a5f3fc' : '#c4b5fd',
                    boxShadow: '8px 10px 22px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <img
                    src={avatar.src}
                    alt={avatar.label}
                    width={98}
                    height={98}
                    style={{
                      width: 98,
                      height: 98,
                      borderRadius: 22,
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: 440,
            height: 510,
            marginTop: 80,
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
            width={428}
            height={428}
            style={{
              width: 428,
              height: 428,
              borderRadius: 28,
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
