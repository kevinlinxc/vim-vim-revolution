'use client';

import { useGame } from './GameProvider';

export default function LyricDisplay({ currentLyric }: { currentLyric: string }) {
  const { state } = useGame();

  if (state.phase === 'idle' || state.phase === 'finished') {
    return null;
  }

  return (
    <div className="text-xl font-bold text-white leading-tight truncate">
      {currentLyric || '...'}
    </div>
  );
}
