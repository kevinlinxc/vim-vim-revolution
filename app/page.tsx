'use client';

import { useRef, useMemo, useCallback, useState } from 'react';
import { GameProvider, useGame } from './game/GameProvider';
import MonacoEditor, { type MonacoEditorHandle } from './game/MonacoEditor';
import { useGameEngine } from './game/useGameEngine';
import ScoreBoard from './game/ScoreBoard';
import LyricDisplay from './game/LyricDisplay';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimelineBar({
  currentTime,
  duration,
}: {
  currentTime: number;
  duration: number;
}) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-xs text-zinc-500 tabular-nums min-w-[2.5rem] text-right">
        {formatTime(currentTime)}
      </span>
      <div className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums min-w-[2.5rem]">
        {formatTime(duration)}
      </span>
    </div>
  );
}

function GameContent() {
  const { state } = useGame();
  const editorRef = useRef<MonacoEditorHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const {
    startGame,
    togglePause,
    restartGame,
    getCurrentLyricText,
    getNextLyricText,
    getCurrentLineNumber,
    audioTime,
    audioDuration,
  } = useGameEngine(editorRef, audioRef, editorReady);

  const boardText = useMemo(() => state.board.join('\n'), [state.board]);
  const handleEditorChange = useCallback(() => {}, []);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
  }, []);

  const handleRestart = useCallback(() => {
    setEditorReady(false);
    setGameKey(k => k + 1);
    restartGame();
  }, [restartGame]);

  const currentLyric = getCurrentLyricText();
  const nextLyric = getNextLyricText();
  const currentLine = getCurrentLineNumber();

  const isPlaying = state.phase === 'playing';
  const canPause = state.phase === 'playing' || state.phase === 'paused';
  const isIdle = state.phase === 'idle';

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-white">
      <audio
        ref={audioRef}
        src="/dont-stop-me-now.mp3"
        preload="auto"
      />

      <div className="flex flex-col h-full relative">
        {isIdle && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-950/70 pointer-events-auto">
            <h1 className="text-5xl font-bold tracking-tight">
              Vim Vim Revolution
            </h1>
            <p className="text-zinc-400 text-lg max-w-md text-center">
              Navigate the editor with vim motions and type the lyrics
              to the beat of the song.
            </p>
            <div className="text-sm text-zinc-600">
              &quot;Don&apos;t Stop Me Now&quot; — Queen
            </div>
            <button
              onClick={startGame}
              className="px-10 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors text-xl"
            >
              Start
            </button>
            <div className="text-xs text-zinc-600 mt-2">
              Vim keys: h j k l w b 0 $ / ? gg G
            </div>
          </div>
        )}

        {state.phase === 'countdown' && (
          <div className="flex items-center justify-center py-2 bg-purple-900/30 border-b border-purple-800/50">
            <span className="text-2xl font-bold text-purple-400 animate-pulse tabular-nums">
              {state.countdownValue}
            </span>
            <span className="ml-3 text-sm text-purple-400/60">Get ready — scan the board</span>
          </div>
        )}

        <div className="flex items-start gap-4 p-3 bg-zinc-900 border-b border-zinc-800">
          <div className="flex-1">
            <LyricDisplay
              currentLyric={currentLyric}
              nextLyric={nextLyric}
              currentLine={currentLine}
            />
          </div>
          <ScoreBoard />
        </div>

        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
          {isIdle ? (
            <button
              onClick={startGame}
              className="px-4 py-1 rounded text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              ▶ Start
            </button>
          ) : (
            <button
              onClick={canPause ? togglePause : undefined}
              disabled={!canPause}
              className="px-3 py-1 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
          )}
          <button
            onClick={handleRestart}
            className="px-3 py-1 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
            title="Restart"
          >
            ↺ Restart
          </button>
          <div className="flex-1">
            <TimelineBar currentTime={audioTime} duration={audioDuration} />
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <MonacoEditor
            key={gameKey}
            ref={editorRef}
            value={boardText}
            onEditorChange={handleEditorChange}
            onReady={handleEditorReady}
          />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <GameProvider>
      <GameContent />
    </GameProvider>
  );
}
