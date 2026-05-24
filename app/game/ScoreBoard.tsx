'use client';

import { useGame } from './GameProvider';
import { totalLyrics } from './songData';

export default function ScoreBoard() {
  const { state } = useGame();

  const progress = totalLyrics > 0
    ? Math.round((state.lyricsCompleted / totalLyrics) * 100)
    : 0;

  const comboClass = state.combo >= 5
    ? 'text-yellow-400 scale-110'
    : state.combo >= 3
      ? 'text-green-400'
      : '';

  return (
    <div className="flex flex-col gap-4 p-4 bg-zinc-900 rounded-lg border border-zinc-700 min-w-[180px]">
      <div className="text-center">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">Score</div>
        <div className="text-2xl font-bold text-white tabular-nums">
          {state.score.toLocaleString()}
        </div>
      </div>

      <div className="text-center">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">Combo</div>
        <div className={`text-xl font-bold tabular-nums transition-all duration-150 ${comboClass}`}>
          {state.combo}x
        </div>
      </div>

      <div className="text-center">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">Max Combo</div>
        <div className="text-lg font-semibold text-zinc-300 tabular-nums">
          {state.maxCombo}x
        </div>
      </div>

      <div className="text-center">
        <div className="text-xs text-zinc-500 uppercase tracking-wider">Progress</div>
        <div className="text-lg font-semibold text-zinc-300 tabular-nums">
          {state.lyricsCompleted} / {totalLyrics}
        </div>
        <div className="mt-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
