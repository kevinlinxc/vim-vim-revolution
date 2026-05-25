'use client';

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useGame } from './GameProvider';
import MonacoEditor, { type MonacoEditorHandle } from './MonacoEditor';
import { useGameEngine } from './useGameEngine';
import ScoreBoard from './ScoreBoard';
import FeedbackOverlay from './FeedbackOverlay';
import { useNickname } from './NicknameProvider';
import Leaderboard from './Leaderboard';

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

interface LeaderboardEntry {
  id: number
  score: number
  handle: string
  created_at: string
}

export default function GameContent() {
  const { state } = useGame();
  const { nickname, setNickname } = useNickname();
  const editorRef = useRef<MonacoEditorHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [editorReady, setEditorReady] = useState(false);
  const [gameKey, setGameKey] = useState(0);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbMessage, setLbMessage] = useState('');
  const [lbError, setLbError] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showLb, setShowLb] = useState(false);
  const [lbData, setLbData] = useState<LeaderboardEntry[]>([]);

  const {
    startGame,
    togglePause,
    restartGame,
    audioTime,
    audioDuration,
    feedbacks,
    dismissFeedback,
  } = useGameEngine(editorRef, audioRef, editorReady);

  const boardText = useMemo(() => state.board.join('\n'), [state.board]);
  const handleEditorChange = useCallback(() => {}, []);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
  }, []);

  const handleRestart = useCallback(() => {
    setEditorReady(false);
    setGameKey(k => k + 1);
    setSubmitted(false);
    setLbMessage('');
    setLbError(false);
    restartGame();
  }, [restartGame]);

  const openLeaderboard = useCallback(() => {
    setShowLb(true);
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => setLbData(data))
      .catch(() => {});
  }, []);

  const closeLeaderboard = useCallback(() => {
    setShowLb(false);
  }, []);

  useEffect(() => {
    if (state.phase !== 'finished') return

    let cancelled = false

    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setLeaderboard(data)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [state.phase])

  const handleSubmitScore = useCallback(async (handle: string) => {
    setSubmitting(true);
    setLbMessage('');
    setLbError(false);

    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle, score: state.score }),
      });
      const data = await res.json();

      if (res.ok) {
        setLeaderboard(data);
        setSubmitted(true);
        setNickname(handle);
        setLbMessage('Score submitted!');
        setLbError(false);
      } else {
        setLbMessage(data.error || 'Failed to submit score');
        setLbError(true);
      }
    } catch {
      setLbMessage('Network error');
      setLbError(true);
    } finally {
      setSubmitting(false);
    }
  }, [state.score, setNickname]);

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
              Please no lawsuit Konami 🙏
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
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="text-[12rem] font-bold text-purple-400/60 animate-pulse tabular-nums leading-none">
              {state.countdownValue}
            </div>
          </div>
        )}

        {state.phase === 'finished' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-6 p-10 bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="text-3xl font-bold text-yellow-400">Game Over!</div>
              <div className="text-6xl font-bold text-white tabular-nums">
                {state.score.toLocaleString()}
              </div>
              <div className="text-sm text-zinc-500">
                Max Combo: {state.maxCombo}x &middot; Completed: {state.lyricsCompleted}/{state.lyricPositions.length}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRestart}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors"
                >
                  Play Again
                </button>
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(`Just got ${state.score} score on vimvimrevolution.com!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg transition-colors inline-flex items-center gap-2"
                >
                  Share on 𝕏
                </a>
              </div>

              <div className="mt-4 pt-4 border-t border-zinc-700 w-full min-w-[300px]">
                <div className="text-sm font-semibold text-zinc-400 mb-3">Leaderboard</div>
                <Leaderboard entries={leaderboard} />

                <div className="mt-4 pt-4 border-t border-zinc-700">
                  {!submitted ? (
                    <NameEntryForm
                      savedNickname={nickname}
                      submitting={submitting}
                      onSubmit={handleSubmitScore}
                    />
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-green-400 mb-2">{lbMessage}</p>
                      <button
                        onClick={handleRestart}
                        className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg transition-colors"
                      >
                        Play Again
                      </button>
                    </div>
                  )}
                  {lbMessage && !submitted && (
                    <p className={`text-xs mt-2 text-center ${lbError ? 'text-red-400' : 'text-green-400'}`}>
                      {lbMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {showLb && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="flex flex-col gap-4 p-8 bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl min-w-[320px] max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="text-lg font-bold text-white">Leaderboard</div>
                <button
                  onClick={closeLeaderboard}
                  className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
                >
                  Close
                </button>
              </div>
              <Leaderboard entries={lbData} />
            </div>
          </div>
        )}

        <div className="flex items-center bg-zinc-900 border-b border-zinc-800">
          <div className="flex-1">
            <ScoreBoard />
          </div>
          <button
            onClick={openLeaderboard}
            className="px-3 py-1.5 mr-3 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
          >
            Leaderboard
          </button>
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

        <div className="flex-1 min-h-0 relative">
          <MonacoEditor
            key={gameKey}
            ref={editorRef}
            value={boardText}
            onEditorChange={handleEditorChange}
            onReady={handleEditorReady}
          />
          <FeedbackOverlay
            feedbacks={feedbacks}
            editorRef={editorRef}
            onDismiss={dismissFeedback}
          />
        </div>
      </div>
    </div>
  );
}

function NameEntryForm({
  savedNickname,
  submitting,
  onSubmit,
}: {
  savedNickname: string | null
  submitting: boolean
  onSubmit: (handle: string) => void
}) {
  const [value, setValue] = useState(savedNickname ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (trimmed) onSubmit(trimmed);
      }}
      className="flex items-center gap-2 w-full"
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter nickname"
        maxLength={20}
        className="flex-1 px-3 py-1.5 rounded text-sm bg-zinc-800 text-white border border-zinc-600 outline-none focus:border-purple-500"
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="px-4 py-1.5 rounded text-sm font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white transition-colors"
      >
        {submitting ? '...' : 'Submit'}
      </button>
    </form>
  );
}
