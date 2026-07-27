import type { GameId } from '@/lib/games';

type ArtKind = 'adventure' | 'candy' | 'blocks' | 'arena' | 'tabletop' | 'words';

const ART_KIND: Record<GameId, ArtKind> = {
  platformer: 'adventure',
  platformer2: 'adventure',
  platformer3: 'adventure',
  diamond: 'candy',
  paperroute: 'adventure',
  pyramidhop: 'adventure',
  reversi: 'tabletop',
  backgammon: 'tabletop',
  seabattle: 'arena',
  paddleduel: 'arena',
  asteroids: 'arena',
  stardefender: 'arena',
  lunarlander: 'adventure',
  runner: 'adventure',
  climber: 'adventure',
  frogger: 'adventure',
  snake2: 'arena',
  maze: 'arena',
  breakout: 'arena',
  bubble: 'candy',
  fruit: 'candy',
  fruit2: 'candy',
  tapattack: 'arena',
  tapattack2: 'arena',
  match3: 'candy',
  blocks: 'blocks',
  tetris: 'blocks',
  merge: 'blocks',
  memory: 'candy',
  echo: 'candy',
  tictactoe: 'tabletop',
  checkers: 'tabletop',
  chess: 'tabletop',
  sudoku: 'tabletop',
  dots: 'tabletop',
  cards: 'tabletop',
  wordhunt: 'words',
  spelling: 'words',
  skystack: 'blocks',
  starfall: 'arena',
  firefly: 'adventure',
  mysteryfaces: 'tabletop',
  colorbynumber: 'candy',
  hangman: 'words',
  wordscramble: 'words',
  diceroyale: 'tabletop',
  starlinefour: 'tabletop',
  mancala: 'tabletop',
  gemcode: 'candy',
};

export default function GameArtwork({
  game,
  accent,
  icon,
  featured = false,
}: {
  game: GameId;
  accent: string;
  icon: string;
  featured?: boolean;
}) {
  return (
    <span
      className={`game-art game-art--${ART_KIND[game]} ${featured ? 'game-art--featured' : ''}`}
      data-game={game}
      style={{
        '--game-accent': accent,
        ...(game === 'platformer3'
          ? {
              backgroundImage:
                'linear-gradient(180deg, rgba(16,28,79,.02), rgba(14,18,66,.42)), url(/assets/coin-runner-v3/kingdom-quest-key-art.webp)',
              backgroundPosition: 'center',
              backgroundSize: 'cover',
            }
          : {}),
      } as React.CSSProperties}
      aria-hidden="true"
    >
      {(game === 'platformer2' || game === 'platformer3') && (
        <span className="game-art__edition">{game === 'platformer3' ? 'V3 edition' : 'V2 edition'}</span>
      )}
      <span className="game-art__sun" />
      <span className="game-art__backdrop game-art__backdrop--far" />
      <span className="game-art__backdrop game-art__backdrop--near" />
      <span className="game-art__track" />
      <span className="game-art__spark game-art__spark--one" />
      <span className="game-art__spark game-art__spark--two" />
      <span className="game-art__spark game-art__spark--three" />
      <span className="game-art__glyph">
        {game === 'backgammon' ? (
          <span className="game-art__backgammon-board">
            {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
          </span>
        ) : game === 'diceroyale' ? (
          <span className="game-art__five-dice">
            <i>⚄</i><i>⚂</i><i>⚅</i><i>⚀</i><i>⚃</i>
          </span>
        ) : icon}
      </span>
      <span className="game-art__shine" />
    </span>
  );
}
