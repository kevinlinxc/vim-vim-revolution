'use client';

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { GameState, GameAction, LyricPosition } from './types';
import { generateBoard } from './boardGenerator';
import { lyrics, totalLyrics, loadSongData } from './songData';

function makeInitialState(
  board?: string[],
  lyricPositions?: LyricPosition[],
): GameState {
  if (!board || !lyricPositions) {
    const generated = generateBoard(lyrics);
    board = generated.board;
    lyricPositions = generated.lyricPositions;
  }
  return {
    phase: 'idle',
    score: 0,
    combo: 0,
    maxCombo: 0,
    lyricsCompleted: 0,
    currentLyricIndex: 0,
    board,
    lyricPositions,
    completedLyrics: new Set<number>(),
    countdownValue: 3,
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_COUNTDOWN':
      return { ...state, phase: 'countdown', countdownValue: 3 };

    case 'SET_COUNTDOWN':
      return { ...state, countdownValue: action.value };

    case 'START_PLAYING':
      return { ...state, phase: 'playing' };

    case 'PAUSE':
      return { ...state, phase: 'paused' };

    case 'RESUME':
      return { ...state, phase: 'playing' };

    case 'FINISH':
      return { ...state, phase: 'finished' };

    case 'RESTART': {
      const generated = generateBoard(lyrics);
      return {
        ...state,
        phase: 'countdown',
        score: 0,
        combo: 0,
        maxCombo: 0,
        lyricsCompleted: 0,
        currentLyricIndex: 0,
        board: generated.board,
        lyricPositions: generated.lyricPositions,
        completedLyrics: new Set<number>(),
        countdownValue: 3,
      };
    }

    case 'ADVANCE_LYRIC': {
      const nextIndex = state.currentLyricIndex + 1;
      if (nextIndex >= totalLyrics) {
        return { ...state, phase: 'finished' };
      }
      return { ...state, currentLyricIndex: nextIndex };
    }

    case 'COMPLETE_LYRIC': {
      const { lyricIndex, timeRemaining } = action;
      if (state.completedLyrics.has(lyricIndex)) return state;

      const newCompleted = new Set(state.completedLyrics);
      newCompleted.add(lyricIndex);

      const basePoints = 100;
      const timeBonus = Math.floor(timeRemaining * 10);
      const comboMultiplier = Math.min(state.combo + 1, 10);
      const points = (basePoints + timeBonus) * comboMultiplier;
      const newCombo = state.combo + 1;

      return {
        ...state,
        score: state.score + points,
        combo: newCombo,
        maxCombo: Math.max(state.maxCombo, newCombo),
        lyricsCompleted: state.lyricsCompleted + 1,
        completedLyrics: newCompleted,
      };
    }

    case 'BREAK_COMBO':
      return { ...state, combo: 0 };

    case 'INIT_DATA':
      return makeInitialState();

    default:
      return state;
  }
}

interface GameContextValue {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, null, () => makeInitialState());

  useEffect(() => {
    loadSongData().then(() => {
      dispatch({ type: 'INIT_DATA' });
    });
  }, []);

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
