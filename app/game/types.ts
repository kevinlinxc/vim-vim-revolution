export interface LyricLine {
  text: string;
  startTime: number;
  endTime: number;
}

export interface LyricPosition {
  lineNumber: number;
  startColumn: number;
  endColumn: number;
}

export type GamePhase = 'idle' | 'countdown' | 'playing' | 'paused' | 'finished';

export interface GameState {
  phase: GamePhase;
  score: number;
  combo: number;
  maxCombo: number;
  lyricsCompleted: number;
  currentLyricIndex: number;
  board: string[];
  lyricPositions: LyricPosition[];
  completedLyrics: Set<number>;
  countdownValue: number;
}

export type GameAction =
  | { type: 'START_COUNTDOWN' }
  | { type: 'SET_COUNTDOWN'; value: number }
  | { type: 'START_PLAYING' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'FINISH' }
  | { type: 'RESTART'; board: string[]; lyricPositions: LyricPosition[] }
  | { type: 'ADVANCE_LYRIC' }
  | { type: 'COMPLETE_LYRIC'; lyricIndex: number; timeRemaining: number }
  | { type: 'BREAK_COMBO' };

export type FeedbackRating = 'perfect' | 'good' | 'bad' | 'miss';

export interface FeedbackEvent {
  id: number;
  rating: FeedbackRating;
  points: number;
  lineNumber: number;
  endColumn: number;
  createdAt: number;
}
