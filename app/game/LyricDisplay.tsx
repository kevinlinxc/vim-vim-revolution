'use client';

import { useGame } from './GameProvider';
import { totalLyrics } from './songData';

interface LyricDisplayProps {
  currentLyric: string;
  nextLyric: string;
  currentLine: number | null;
}

export default function LyricDisplay({
  currentLyric,
  nextLyric,
  currentLine,
}: LyricDisplayProps) {
  const { state } = useGame();

  if (state.phase === 'idle') {
    return null;
  }

  if (state.phase === 'countdown') {
    return (
      <div className="flex flex-col gap-2 p-3 bg-zinc-900 rounded-lg border border-zinc-700">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">
          Up first
        </div>
        <div className="text-xl font-bold text-white leading-tight">
          {currentLyric || '...'}
        </div>
        {nextLyric && (
          <div className="text-sm text-zinc-500 leading-tight">
            then: {nextLyric}
          </div>
        )}
      </div>
    );
  }

  if (state.phase === 'finished') {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-zinc-900 rounded-lg border border-zinc-700">
        <div className="text-2xl font-bold text-yellow-400">Game Over!</div>
        <div className="text-lg text-zinc-300">
          Final Score: {state.score.toLocaleString()}
        </div>
        <div className="text-sm text-zinc-500">
          Max Combo: {state.maxCombo}x | Completed: {state.lyricsCompleted}/{totalLyrics}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-zinc-900 rounded-lg border border-zinc-700">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">
        Now
      </div>
      <div className="text-xl font-bold text-white leading-tight">
        {currentLyric || '...'}
      </div>
      {currentLine !== null && (
        <div className="text-xs text-purple-400">
          Line {currentLine + 1}
        </div>
      )}
      {nextLyric && (
        <div className="mt-2">
          <div className="text-xs text-zinc-600 uppercase tracking-wider">
            Next
          </div>
          <div className="text-sm text-zinc-500 leading-tight">
            {nextLyric}
          </div>
        </div>
      )}
    </div>
  );
}
