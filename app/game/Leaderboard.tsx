'use client'

interface LeaderboardEntry {
  id: number
  score: number
  handle: string
  created_at: string
}

export default function Leaderboard({ entries, loading }: { entries: LeaderboardEntry[]; loading?: boolean }) {
  if (loading) {
    return (
      <p className="text-sm text-zinc-500 text-center py-2">
        Loading...
      </p>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-zinc-500 text-center py-2">
        No scores yet. Be the first!
      </p>
    )
  }

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-zinc-500 pb-2 mb-1 border-b border-zinc-700">
        <span>#</span>
        <span>Name</span>
        <span>Score</span>
      </div>
      <div className="space-y-0.5">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`flex justify-between items-center py-1 px-1 rounded text-sm ${
              i === 0 ? 'text-yellow-400 font-semibold' : 'text-zinc-300'
            }`}
          >
            <span className="w-6 text-zinc-500 text-xs">{i + 1}</span>
            <span className="flex-1 truncate">{entry.handle || '???'}</span>
            <span className="tabular-nums">{entry.score.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
