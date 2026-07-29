import { KINGDOM_THEME } from './kingdomMusic';

/**
 * A small set of original musical worlds shared by related games. Keeping the
 * palette intentionally small makes the arcade feel coherent while each theme
 * remains quiet enough for repeat play.
 */
export type MusicTheme =
  | 'storybook'
  | 'kingdom'
  | 'rift'
  | 'motion'
  | 'space'
  | 'puzzle';

export type MusicPattern = {
  stepMs: number;
  melody: Array<number | null>;
  bass: number[];
  melodyWave: OscillatorType;
  bassWave: OscillatorType;
  melodyGain: number;
  bassGain: number;
};

export const MUSIC_PATTERNS: Record<MusicTheme, MusicPattern> = {
  storybook: {
    stepMs: 430,
    melody: [72, 76, 79, null, 76, 74, 72, null, 69, 72, 76, null, 74, 72, 67, null],
    bass: [48, 45, 50, 43],
    melodyWave: 'sine',
    bassWave: 'triangle',
    melodyGain: 0.2,
    bassGain: 0.12,
  },
  kingdom: {
    stepMs: 340,
    melody: KINGDOM_THEME,
    bass: [40, 40, 43, 43, 38, 38, 35, 35],
    melodyWave: 'triangle',
    bassWave: 'sine',
    melodyGain: 0.17,
    bassGain: 0.1,
  },
  rift: {
    stepMs: 470,
    melody: [64, null, 67, 71, null, 69, 67, null, 62, null, 66, 69, null, 67, 64, null],
    bass: [35, 38, 33, 40],
    melodyWave: 'sine',
    bassWave: 'triangle',
    melodyGain: 0.15,
    bassGain: 0.11,
  },
  motion: {
    stepMs: 360,
    melody: [67, 71, 74, null, 71, 76, 74, null, 69, 72, 76, null, 72, 71, 67, null],
    bass: [43, 47, 45, 40],
    melodyWave: 'triangle',
    bassWave: 'sine',
    melodyGain: 0.16,
    bassGain: 0.1,
  },
  space: {
    stepMs: 520,
    melody: [76, null, 71, 74, null, 79, null, 74, 72, null, 69, 71, null, 76, null, 67],
    bass: [33, 38, 35, 40],
    melodyWave: 'sine',
    bassWave: 'sine',
    melodyGain: 0.15,
    bassGain: 0.09,
  },
  puzzle: {
    stepMs: 460,
    melody: [72, 76, null, 79, 76, null, 74, 71, 69, 72, null, 76, 74, null, 71, 67],
    bass: [48, 45, 43, 47],
    melodyWave: 'sine',
    bassWave: 'triangle',
    melodyGain: 0.14,
    bassGain: 0.08,
  },
};

