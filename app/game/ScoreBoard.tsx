'use client';

import { useGame } from './GameProvider';
import { totalLyrics } from './songData';

function Pill({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-1.5 bg-zinc-800 min-w-[80px] ${className ?? ''}`}>
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <span className="text-lg font-bold tabular-nums">{children}</span>
    </div>
  );
}

export default function ScoreBoard() {
  const { state } = useGame();

  const progress = totalLyrics > 0
    ? Math.round((state.lyricsCompleted / totalLyrics) * 100)
    : 0;

  const comboClass = state.combo >= 5
    ? 'text-yellow-400'
    : state.combo >= 3
      ? 'text-green-400'
      : 'text-white';

  return (
    <div className="grid grid-cols-2 gap-2">
      <Pill label="Score">
        <span className="text-white">{state.score.toLocaleString()}</span>
      </Pill>
      <Pill label="Combo">
        <span className={comboClass}>{state.combo}x</span>
      </Pill>
      <Pill label="Max">
        <span className="text-zinc-400">{state.maxCombo}x</span>
      </Pill>
      <Pill label={state.phase === 'idle' ? 'Ready' : `${state.lyricsCompleted}/${totalLyrics}`}>
        <span className="text-white">
          {state.phase === 'idle' ? '-' : `${progress}%`}
        </span>
      </Pill>
    </div>
  );
}
