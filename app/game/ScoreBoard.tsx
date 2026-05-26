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
    <div className="flex items-center gap-6 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 uppercase tracking-wider text-xs">Score</span>
        <span className="text-base font-bold text-white tabular-nums">
          {state.score.toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-zinc-500 uppercase tracking-wider text-xs">Combo</span>
        <span className={`text-base font-bold tabular-nums transition-colors duration-150 ${comboClass}`}>
          {state.combo}x
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-zinc-500 uppercase tracking-wider text-xs">Max</span>
        <span className="text-base font-semibold text-zinc-400 tabular-nums">
          {state.maxCombo}x
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-zinc-500 uppercase tracking-wider text-xs">
          {state.lyricsCompleted}/{totalLyrics}
        </span>
        <div className="w-20 h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
