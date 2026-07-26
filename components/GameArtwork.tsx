import type { GameId } from '@/lib/games';

type ArtKind = 'adventure' | 'candy' | 'blocks' | 'arena' | 'tabletop' | 'words';

const ART_KIND: Record<GameId, ArtKind> = {
  platformer: 'adventure',
  platformer2: 'adventure',
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
      style={{ '--game-accent': accent } as React.CSSProperties}
      aria-hidden="true"
    >
      {game.endsWith('2') && (
        <span className="game-art__edition">New edition</span>
      )}
      <span className="game-art__sun" />
      <span className="game-art__backdrop game-art__backdrop--far" />
      <span className="game-art__backdrop game-art__backdrop--near" />
      <span className="game-art__track" />
      <span className="game-art__spark game-art__spark--one" />
      <span className="game-art__spark game-art__spark--two" />
      <span className="game-art__spark game-art__spark--three" />
      <span className="game-art__glyph">{icon}</span>
      <span className="game-art__shine" />
    </span>
  );
}
