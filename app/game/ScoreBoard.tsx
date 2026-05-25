'use client';

import { useGame } from './GameProvider';
import { totalLyrics } from './songData';

export default function ScoreBoard() {
  const { state } = useGame();

  const progress = totalLyrics > 0
    ? Math.round((state.lyricsCompleted / totalLyrics) * 100)
    : 0;

  const comboClass = state.combo >= 5
    ? 'text-yellow-400'
    : state.combo >= 3
      ? 'text-green-400'
      : 'text-zinc-300';

  return (
    <div className="flex items-center gap-5 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Score</span>
        <span className="text-sm font-bold text-white tabular-nums">
          {state.score.toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Combo</span>
        <span className={`text-sm font-bold tabular-nums transition-colors duration-150 ${comboClass}`}>
          {state.combo}x
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-zinc-500 uppercase tracking-wider text-[10px]">Max</span>
        <span className="text-sm font-semibold text-zinc-400 tabular-nums">
          {state.maxCombo}x
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-zinc-500 uppercase tracking-wider text-[10px]">
          {state.lyricsCompleted}/{totalLyrics}
        </span>
        <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
