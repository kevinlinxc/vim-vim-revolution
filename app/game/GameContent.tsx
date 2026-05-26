'use client';

import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useGame } from './GameProvider';
import MonacoEditor, { type MonacoEditorHandle } from './MonacoEditor';
import { useGameEngine } from './useGameEngine';
import ScoreBoard from './ScoreBoard';
import LyricDisplay from './LyricDisplay';
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
          className="h-full bg-gradient-to-r from-[#00992F] to-[#00cc3d] rounded-full"
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
  const [hideGameOver, setHideGameOver] = useState(false);

  const {
    startGame,
    togglePause,
    restartGame,
    getCurrentLyricText,
    audioTime,
    audioDuration,
    feedbacks,
    dismissFeedback,
  } = useGameEngine(editorRef, audioRef, editorReady);

  const boardText = useMemo(() => state.board.join('\n'), [state.board]);
  const handleEditorChange = useCallback(() => { }, []);

  const handleEditorReady = useCallback(() => {
    setEditorReady(true);
  }, []);

  const handleRestart = useCallback(() => {
    setEditorReady(false);
    setGameKey(k => k + 1);
    setSubmitted(false);
    setLbMessage('');
    setLbError(false);
    setHideGameOver(false);
    restartGame();
  }, [restartGame]);

  const openLeaderboard = useCallback(() => {
    setShowLb(true);
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => setLbData(data))
      .catch(() => { });
  }, []);

  const closeLeaderboard = useCallback(() => {
    setShowLb(false);
  }, []);

  useEffect(() => {
    if (state.phase === 'finished') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHideGameOver(false);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'finished') return

    let cancelled = false

    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        if (!cancelled) setLeaderboard(data)
      })
      .catch(() => { })

    return () => { cancelled = true }
  }, [state.phase])

  const currentLyric = getCurrentLyricText()

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
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-zinc-950/90 pointer-events-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/vim-vim-revolution-logo.png"
              alt="Vim Vim Revolution"
              className="w-48 h-48 object-contain"
            />
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Vim Vim Revolution
            </h1>
            <p className="text-[#B1B1B1] text-base max-w-md text-center">
              Type the lyrics in time with the song, in a Vim editor!
            </p>
            <button
              onClick={startGame}
              className="px-10 py-3 bg-[#00992F] hover:bg-[#007a25] text-white font-semibold rounded-lg text-xl"
            >
              Start
            </button>
            <HintsDropdown />

            <span className="text-xs text-zinc-600 mt-4">
              Created by{' '}
              <a
                href="https://x.com/linguinelabs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#B1B1B1]"
              >
                @linguinelabs
              </a>
            </span>
          </div>
        )}

        {state.phase === 'countdown' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="text-[12rem] font-bold text-[#00992F]/60 tabular-nums leading-none">
              {state.countdownValue}
            </div>
          </div>
        )}

        {state.phase === 'finished' && !hideGameOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-6 p-10 bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl max-h-[90vh] overflow-y-auto relative">
              <button
                onClick={() => setHideGameOver(true)}
                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-zinc-700 hover:bg-zinc-600 text-zinc-400 text-sm leading-none"
                aria-label="Close"
              >
                ✕
              </button>
              <div className="text-3xl font-bold text-yellow-400">Final Score</div>
              <div className="text-6xl font-bold text-white tabular-nums">
                {state.score.toLocaleString()}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleRestart}
                  className="px-6 py-2.5 bg-[#00992F] hover:bg-[#007a25] text-white font-semibold rounded-lg"
                >
                  Play Again
                </button>
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(`Just got a score of ${state.score}  on vimvimrevolution.com!`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-lg inline-flex items-center gap-2"
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
                        className="px-6 py-2 bg-[#00992F] hover:bg-[#007a25] text-white font-semibold rounded-lg"
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
              <span className="text-xs text-zinc-600 mt-4">
                Created by{' '}
                <a
                  href="https://x.com/linguinelabs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#B1B1B1]"
                >
                  @linguinelabs
                </a>
              </span>
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
                  className="px-3 py-1 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
                >
                  Close
                </button>
              </div>
              <Leaderboard entries={lbData} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex-1 min-w-0 flex items-center gap-3">
            <LyricDisplay currentLyric={currentLyric} />
            {state.phase === 'finished' && hideGameOver && (
              <button
                onClick={() => setHideGameOver(false)}
                className="px-4 py-1.5 rounded text-sm font-semibold bg-[#00992F] hover:bg-[#007a25] text-white"
              >
                Show Results
              </button>
            )}
          </div>
          <ScoreBoard />
          <button
            onClick={openLeaderboard}
            className={`px-3 py-1.5 rounded text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 shrink-0 ${state.phase === 'finished' ? 'hidden' : ''}`}
          >
            LB
          </button>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border-b border-zinc-800">
          {isIdle ? (
            <button
              onClick={startGame}
              className="px-4 py-1 rounded text-sm font-semibold bg-[#00992F] hover:bg-[#007a25] text-white"
            >
              ▶ Start
            </button>
          ) : (
            <button
              onClick={canPause ? togglePause : undefined}
              disabled={!canPause}
              className="px-3 py-1 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
          )}
          <button
            onClick={handleRestart}
            className="px-3 py-1 rounded text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-white"
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

function HintsDropdown() {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full max-w-sm mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 font-medium flex items-center justify-between"
      >
        How to Play / Vim Controls
        <span className={`text-xs ml-2 ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && (
        <div className="mt-2 px-4 py-3 bg-zinc-800/60 rounded-lg text-xs text-zinc-400 space-y-2 text-left">
          <div>
            <span className="text-[#B1B1B1] font-semibold">Movement:</span>{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">h</kbd>{' '}
            left,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">j</kbd>{' '}
            down,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">k</kbd>{' '}
            up,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">l</kbd>{' '}
            right
          </div>
          <div>
            <span className="text-[#B1B1B1] font-semibold">Words:</span>{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">w</kbd>{' '}
            next word,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">b</kbd>{' '}
            back word,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">e</kbd>{' '}
            end of word
          </div>
          <div>
            <span className="text-[#B1B1B1] font-semibold">Counts:</span>{' '}
            prefix any command with a number, e.g.{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">2j</kbd>{' '}
            moves down two lines
          </div>
          <div>
            <span className="text-[#B1B1B1] font-semibold">Insert mode:</span>{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">i</kbd>{' '}
            insert at cursor,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">a</kbd>{' '}
            append after,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">I</kbd>{' '}
            insert at line start,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">A</kbd>{' '}
            append at line end
            <br />
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">Esc</kbd>{' '}
            return to normal (movement) mode
          </div>
          <div>
            <span className="text-[#B1B1B1] font-semibold">Misc:</span>{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">0</kbd>{' '}
            line start,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">$</kbd>{' '}
            line end,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">gg</kbd>{' '}
            file start,{' '}
            <kbd className="px-1 py-0.5 bg-zinc-700 rounded text-zinc-300 text-[11px]">G</kbd>{' '}
            file end
          </div>
          <div className="pt-1">
            <a
              href="https://vim.rtorr.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#00992F] hover:underline"
            >
              Full cheat sheet (https://vim.rtorr.com/)
            </a>
          </div>
        </div>
      )}
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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter nickname"
        maxLength={20}
        className="flex-1 px-3 py-1.5 rounded text-sm bg-zinc-800 text-white border border-zinc-600 outline-none focus:border-[#00992F]"
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={submitting || !value.trim()}
        className="px-4 py-1.5 rounded text-sm font-semibold bg-[#00992F] hover:bg-[#007a25] disabled:opacity-40 text-white"
      >
        {submitting ? '...' : 'Submit'}
      </button>
    </form>
  );
}
