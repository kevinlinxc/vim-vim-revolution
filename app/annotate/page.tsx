"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ============================================================
// Types & helpers
// ============================================================

interface LyricLine {
  startTime: number;
  endTime: number;
  text: string;
}

function toSeconds(min: string, sec: string, frac: string): number {
  return (
    parseInt(min, 10) * 60 +
    parseInt(sec, 10) +
    parseInt(frac, 10) / (frac.length === 2 ? 100 : 1000)
  );
}

function parseDoubleLrc(raw: string): LyricLine[] {
  const regex =
    /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*-\s*\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.+)/;
  const entries: LyricLine[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(regex);
    if (!match) continue;

    entries.push({
      startTime: toSeconds(match[1], match[2], match[3]),
      endTime: toSeconds(match[4], match[5], match[6]),
      text: match[7].trim(),
    });
  }

  return entries;
}

function parseSingleLrc(raw: string): LyricLine[] {
  const regex = /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;
  const all: { startTime: number; text: string }[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(regex);
    if (!match) continue;

    all.push({
      startTime: toSeconds(match[1], match[2], match[3]),
      text: match[4].trim(),
    });
  }

  all.sort((a, b) => a.startTime - b.startTime);

  const result: LyricLine[] = [];

  for (let i = 0; i < all.length; i++) {
    if (!all[i].text) continue;

    let endTime: number;
    if (i + 1 < all.length) {
      endTime = all[i + 1].startTime;
    } else {
      endTime = all[i].startTime + 3.0; // placeholder, updated when audio loads
    }

    result.push({
      startTime: all[i].startTime,
      endTime,
      text: all[i].text,
    });
  }

  return result;
}

function parseLrc(raw: string): { lines: LyricLine[]; isSingle: boolean } {
  const doublePattern =
    /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*-\s*\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  // Detect format from first non-empty line
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (doublePattern.test(trimmed)) {
      return { lines: parseDoubleLrc(raw), isSingle: false };
    }
    break;
  }

  return { lines: parseSingleLrc(raw), isSingle: true };
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00.00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
}

function formatLrcExport(lines: LyricLine[]): string {
  return lines
    .map(
      (l) =>
        `[${formatTime(l.startTime)}]-[${formatTime(l.endTime)}] ${l.text}`,
    )
    .join("\n");
}

// ============================================================
// Constants
// ============================================================

const ROW_HEIGHT = 30;
const LABEL_WIDTH = 360;
const HANDLE_WIDTH = 10;
const MIN_DURATION = 0.05;

// ============================================================
// Drag state
// ============================================================

type DragState =
  | { type: "none" }
  | { type: "start"; index: number }
  | { type: "end"; index: number }
  | {
      type: "bar";
      index: number;
      startOffset: number;
      duration: number;
    }
  | { type: "playhead" };

// ============================================================
// Component
// ============================================================

export default function AnnotatePage() {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState("");
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [lrcFileName, setLrcFileName] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scale, setScale] = useState(18); // px per second
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(LABEL_WIDTH);

  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const lyricsColRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({ type: "none" });
  const lyricsRef = useRef(lyrics);
  const scaleRef = useRef(scale);
  const isSingleLrcRef = useRef(false);
  const dividerDraggingRef = useRef(false);
  const sidebarRef = useRef(sidebarWidth);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
  lyricsRef.current = lyrics;
  scaleRef.current = scale;
  sidebarRef.current = sidebarWidth;

  // ==========================================================
  // Coordinate helpers
  // ==========================================================

  const getTimeFromClientX = useCallback((clientX: number): number => {
    const el = timelineRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    return Math.max(0, x / scaleRef.current);
  }, []);

  // ==========================================================
  // Sidebar divider drag
  // ==========================================================

  const handleDividerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dividerDraggingRef.current = true;
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dividerDraggingRef.current) return;
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };
    const up = () => {
      dividerDraggingRef.current = false;
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, []);

  // ==========================================================
  // Drag handlers (lyric bars / playhead)
  // ==========================================================

  const handleDragMove = useCallback((e: MouseEvent) => {
    const d = dragRef.current;
    if (d.type === "none") return;

    const time = getTimeFromClientX(e.clientX);

    if (d.type === "playhead") {
      if (audioRef.current) audioRef.current.currentTime = time;
      return;
    }

    setLyrics((prev) => {
      const next = [...prev];

      if (d.type === "start") {
        next[d.index] = {
          ...next[d.index],
          startTime: Math.min(time, next[d.index].endTime - MIN_DURATION),
        };
      } else if (d.type === "end") {
        next[d.index] = {
          ...next[d.index],
          endTime: Math.max(time, next[d.index].startTime + MIN_DURATION),
        };
      } else if (d.type === "bar") {
        const newStart = Math.max(0, time - d.startOffset);
        next[d.index] = {
          ...next[d.index],
          startTime: newStart,
          endTime: newStart + d.duration,
        };
      }

      return next;
    });
  }, [getTimeFromClientX]);

  const handleDragUp = useCallback(() => {
    dragRef.current = { type: "none" };
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragUp);
    return () => {
      document.removeEventListener("mousemove", handleDragMove);
      document.removeEventListener("mouseup", handleDragUp);
    };
  }, [handleDragMove, handleDragUp]);

  // ==========================================================
  // Bar / handle mouse-down callbacks
  // ==========================================================

  const handleStartDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { type: "start", index };
    },
    [],
  );

  const handleEndDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { type: "end", index };
    },
    [],
  );

  const handleBarDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      const line = lyricsRef.current[index];
      const clickTime = getTimeFromClientX(e.clientX);
      dragRef.current = {
        type: "bar",
        index,
        startOffset: clickTime - line.startTime,
        duration: line.endTime - line.startTime,
      };
    },
    [getTimeFromClientX],
  );

  const handleTimelineBgDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== e.currentTarget) return;
      const time = getTimeFromClientX(e.clientX);
      if (audioRef.current) audioRef.current.currentTime = time;
      dragRef.current = { type: "playhead" };
    },
    [getTimeFromClientX],
  );

  // ==========================================================
  // Audio events
  // ==========================================================

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }, []);

  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  }, []);

  const seekTo = useCallback(
    (seconds: number) => {
      if (audioRef.current) {
        audioRef.current.currentTime = Math.max(
          0,
          Math.min(seconds, duration || Infinity),
        );
      }
    },
    [duration],
  );

  // Update last line's end time for single LRC when audio duration is known
  useEffect(() => {
    if (!isSingleLrcRef.current || duration <= 0 || lyrics.length === 0) return;
    setLyrics((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.endTime >= duration) return prev;
      const next = [...prev];
      next[next.length - 1] = { ...last, endTime: duration };
      return next;
    });
  }, [duration, lyrics.length]);

  // Sync playing state
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const p = () => setIsPlaying(true);
    const u = () => setIsPlaying(false);
    a.addEventListener("play", p);
    a.addEventListener("pause", u);
    a.addEventListener("ended", u);
    return () => {
      a.removeEventListener("play", p);
      a.removeEventListener("pause", u);
      a.removeEventListener("ended", u);
    };
  }, [audioSrc]);

  // ==========================================================
  // Sync vertical scroll between lyrics column and timeline
  // ==========================================================

  const handleTimelineScroll = useCallback(() => {
    const tl = timelineRef.current;
    const lc = lyricsColRef.current;
    if (tl && lc) lc.scrollTop = tl.scrollTop;
  }, []);

  // ==========================================================
  // File uploads
  // ==========================================================

  const handleAudioDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        if (audioSrc) URL.revokeObjectURL(audioSrc);
        setAudioSrc(URL.createObjectURL(file));
        setAudioFileName(file.name);
        setCurrentTime(0);
        setDuration(0);
      }
    },
    [audioSrc],
  );

  const handleLrcDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const r = new FileReader();
      r.onload = () => {
        const parsed = parseLrc(r.result as string);
        setLyrics(parsed.lines);
        isSingleLrcRef.current = parsed.isSingle;
      };
      r.readAsText(file);
      setLrcFileName(file.name);
    }
  }, []);

  const exportLrc = useCallback(() => {
    const blob = new Blob([formatLrcExport(lyrics)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lrcFileName || "output.lrc";
    a.click();
    URL.revokeObjectURL(url);
  }, [lyrics, lrcFileName]);

  // ==========================================================
  // Keyboard shortcuts
  // ==========================================================

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowRight" && !e.metaKey) {
        e.preventDefault();
        seekTo(currentTime + 0.5);
      } else if (e.code === "ArrowLeft" && !e.metaKey) {
        e.preventDefault();
        seekTo(currentTime - 0.5);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === null ? 0 : Math.min(lyrics.length - 1, prev + 1),
        );
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev === null ? lyrics.length - 1 : Math.max(0, prev - 1),
        );
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, seekTo, currentTime, lyrics.length]);

  // ==========================================================
  // Derived values
  // ==========================================================

  const timelineWidth = duration > 0 ? duration * scale : 60 * scale;
  const totalHeight = Math.max(lyrics.length * ROW_HEIGHT, 200);

  const activeIndex = (() => {
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (
        currentTime >= lyrics[i].startTime &&
        currentTime <= lyrics[i].endTime
      )
        return i;
    }
    return null;
  })();

  // Time ruler ticks (every N seconds)
  const rulerInterval = scale >= 30 ? 2 : scale >= 15 ? 5 : 10;
  const rulerTicks: number[] = [];
  const maxTick = Math.ceil((duration || 210) / rulerInterval) * rulerInterval;
  for (let t = 0; t <= maxTick; t += rulerInterval) {
    rulerTicks.push(t);
  }

  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div className="h-screen bg-zinc-950 text-zinc-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Back
          </a>
          <h1 className="text-base font-semibold tracking-tight">
            Lyric Annotator
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {audioFileName && (
            <span className="text-xs text-zinc-500 font-mono">{audioFileName}</span>
          )}
          {lyrics.length > 0 && (
            <button
              onClick={exportLrc}
              className="px-3 py-1.5 bg-[#00992F] text-white rounded text-xs font-medium hover:bg-[#007a25] transition-colors"
            >
              Export
            </button>
          )}
        </div>
      </header>

      {/* Player bar */}
      <div className="border-b border-zinc-800 px-4 py-2 flex items-center gap-4 shrink-0 bg-zinc-900/50">
        {audioSrc && (
          <audio
            ref={audioRef}
            src={audioSrc}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            preload="auto"
          />
        )}
        {!audioSrc ? (
          <button
            className="text-xs text-zinc-500 hover:text-zinc-300 font-mono px-2 py-1 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
            onClick={() => audioInputRef.current?.click()}
          >
            Load MP3
          </button>
        ) : (
          <>
            <button
              onClick={togglePlay}
              className="w-8 h-8 rounded-full bg-[#00992F] text-white flex items-center justify-center hover:bg-[#007a25] transition-colors shrink-0"
            >
              {isPlaying ? (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <rect x="4" y="3" width="4" height="14" rx="1" />
                  <rect x="12" y="3" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <polygon points="5,3 17,10 5,17" />
                </svg>
              )}
            </button>
            <span className="font-mono text-sm tabular-nums text-zinc-300">
              {formatTime(currentTime)}
            </span>
            <span className="text-zinc-600 text-sm">/</span>
            <span className="font-mono text-sm tabular-nums text-zinc-500">
              {formatTime(duration)}
            </span>
            <div className="flex-1" />
            <button
              onClick={() => seekTo(currentTime - 0.5)}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono px-1.5"
            >
              −0.5s
            </button>
            <button
              onClick={() => seekTo(currentTime + 0.5)}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono px-1.5"
            >
              +0.5s
            </button>
            <div className="border-l border-zinc-700 h-4 mx-1" />
            <button
              onClick={() => setScale((s) => Math.max(3, s - 5))}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono px-1"
            >
              −
            </button>
            <span className="text-[11px] text-zinc-600 font-mono w-8 text-center tabular-nums">
              {scale}px/s
            </span>
            <button
              onClick={() => setScale((s) => Math.min(60, s + 5))}
              className="text-xs text-zinc-500 hover:text-zinc-300 font-mono px-1"
            >
              +
            </button>
          </>
        )}
        <input
          ref={audioInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              if (audioSrc) URL.revokeObjectURL(audioSrc);
              setAudioSrc(URL.createObjectURL(f));
              setAudioFileName(f.name);
              setCurrentTime(0);
              setDuration(0);
            }
          }}
        />
      </div>

      {/* Main area: lyrics + timeline */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Lyrics sidebar */}
        <div
          ref={lyricsColRef}
          className="shrink-0 overflow-hidden select-none border-r border-zinc-800 h-full"
          style={{ width: sidebarWidth }}
        >
          {lyrics.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
              <p className="text-sm text-zinc-500 text-center">
                Drop a .lrc or .txt file
              </p>
              <button
                className="px-4 py-2 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 cursor-pointer transition-colors"
                onClick={() => lrcInputRef.current?.click()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const r = new FileReader();
                    r.onload = () => {
                      const parsed = parseLrc(r.result as string);
                      setLyrics(parsed.lines);
                      isSingleLrcRef.current = parsed.isSingle;
                    };
                    r.readAsText(file);
                    setLrcFileName(file.name);
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                Load .lrc
              </button>
              <input
                ref={lrcInputRef}
                type="file"
                accept=".lrc,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const r = new FileReader();
                    r.onload = () => {
                      const parsed = parseLrc(r.result as string);
                      setLyrics(parsed.lines);
                      isSingleLrcRef.current = parsed.isSingle;
                    };
                    r.readAsText(f);
                    setLrcFileName(f.name);
                  }
                }}
              />
            </div>
          ) : (
            <>
              {/* Column header */}
              <div className="h-6 border-b border-zinc-800 flex items-center px-3 text-[10px] text-zinc-600 font-mono sticky top-0 bg-zinc-950">
                <span className="w-8 text-right shrink-0">#</span>
                <span className="ml-2">start</span>
                <span className="mx-1">–</span>
                <span>end</span>
                <span className="ml-4">lyric</span>
              </div>
              <div>
                {lyrics.map((line, i) => (
                  <div
                    key={i}
                    className={`flex items-center h-[30px] px-3 border-b border-zinc-800/50 text-xs transition-colors cursor-pointer ${
                      selectedIndex === i
                        ? "bg-zinc-800"
                        : activeIndex === i
                          ? "bg-[#00992F]/10"
                          : "hover:bg-zinc-900"
                    }`}
                    onClick={() => {
                      setSelectedIndex(i);
                      seekTo(line.startTime);
                    }}
                  >
                    <span className="w-8 text-right text-zinc-600 font-mono shrink-0 tabular-nums">
                      {i + 1}
                    </span>
                    <span
                      className={`ml-2 font-mono tabular-nums shrink-0 ${
                        selectedIndex === i
                          ? "text-zinc-200"
                          : "text-zinc-500"
                      }`}
                    >
                      {formatTime(line.startTime)}
                    </span>
                    <span className="mx-1 text-zinc-700">-</span>
                    <span
                      className={`font-mono tabular-nums shrink-0 ${
                        selectedIndex === i
                          ? "text-zinc-200"
                          : "text-zinc-500"
                      }`}
                    >
                      {formatTime(line.endTime)}
                    </span>
                    <span
                      className={`ml-3 truncate ${
                        activeIndex === i
                          ? "text-[#00992F]"
                          : selectedIndex === i
                            ? "text-zinc-200"
                            : "text-zinc-400"
                      }`}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Resizable divider */}
        <div
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-[#00992F]/30 active:bg-[#00992F]/50 transition-colors relative z-30"
          onMouseDown={handleDividerDown}
        />

        {/* Timeline */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-auto"
          onScroll={handleTimelineScroll}
        >
          <div
            className="relative"
            style={{
              width: Math.max(timelineWidth, 1000),
              height: Math.max(totalHeight, 200),
            }}
            onMouseDown={handleTimelineBgDown}
          >
            {/* Time ruler */}
            <div
              className="sticky top-0 h-6 border-b border-zinc-700 bg-zinc-950 z-20"
              style={{ width: Math.max(timelineWidth, 1000) }}
            >
              {rulerTicks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 h-full border-l border-zinc-700/50"
                  style={{ left: t * scale }}
                >
                  <span className="absolute left-1 top-0.5 text-[10px] text-zinc-500 font-mono tabular-nums">
                    {formatTime(t)}
                  </span>
                </div>
              ))}
            </div>

            {/* Row backgrounds */}
            {lyrics.map((line, i) => (
              <div
                key={i}
                className="border-b border-zinc-800/30"
                style={{ height: ROW_HEIGHT }}
              />
            ))}

            {/* Interval bars (only when audio loaded) */}
            {audioSrc &&
              lyrics.map((line, i) => {
              const left = line.startTime * scale;
              const width = Math.max(
                4,
                (line.endTime - line.startTime) * scale,
              );
              const isActive = activeIndex === i;
              const isSelected = selectedIndex === i;

              let bg = "rgba(255,255,255,0.08)";
              if (isSelected) bg = "rgba(0,153,47,0.35)";
              else if (isActive) bg = "rgba(0,153,47,0.2)";

              return (
                <div
                  key={i}
                  className="absolute rounded group cursor-grab active:cursor-grabbing"
                  style={{
                    left,
                    top: ROW_HEIGHT + i * ROW_HEIGHT + 3,
                    width,
                    height: ROW_HEIGHT - 6,
                    background: bg,
                    border: isSelected
                      ? "1px solid rgba(0,153,47,0.5)"
                      : "1px solid transparent",
                    zIndex: isSelected ? 5 : 1,
                    transition: "background 0.1s, border 0.1s",
                  }}
                  onMouseDown={(e) => handleBarDown(e, i)}
                  onDoubleClick={() => {
                    setSelectedIndex(i);
                    seekTo(line.startTime);
                  }}
                >
                  {/* Left handle */}
                  <div
                    className="absolute top-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-col-resize rounded-l"
                    style={{
                      left: -HANDLE_WIDTH / 2,
                      width: HANDLE_WIDTH,
                      background: isSelected
                        ? "rgba(0,153,47,0.8)"
                        : "rgba(255,255,255,0.3)",
                    }}
                    onMouseDown={(e) => handleStartDown(e, i)}
                  />

                  {/* Right handle */}
                  <div
                    className="absolute top-0 bottom-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-col-resize rounded-r"
                    style={{
                      right: -HANDLE_WIDTH / 2,
                      width: HANDLE_WIDTH,
                      background: isSelected
                        ? "rgba(0,153,47,0.8)"
                        : "rgba(255,255,255,0.3)",
                    }}
                    onMouseDown={(e) => handleEndDown(e, i)}
                  />

                  {/* Label inside bar (visible when wide enough) */}
                  {width > 60 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-300 font-mono tabular-nums truncate pointer-events-none select-none px-1">
                      {formatTime(line.startTime)} – {formatTime(line.endTime)}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Playhead (only when audio loaded) */}
            {audioSrc && (
            <div
              className="absolute top-0 z-30 pointer-events-none"
              style={{
                left: currentTime * scale,
                height: Math.max(totalHeight, 200) + ROW_HEIGHT,
              }}
            >
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[#00992F]"
                style={{ left: 0 }}
              />
              {/* Drag handle */}
              <div
                className="absolute top-0 -translate-x-1/2 pointer-events-auto cursor-ew-resize"
                style={{ left: 0 }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const time = getTimeFromClientX(e.clientX);
                  if (audioRef.current) audioRef.current.currentTime = time;
                  dragRef.current = { type: "playhead" };
                }}
              >
                <svg width="11" height="9" viewBox="0 0 11 9">
                  <polygon points="5.5,0 11,9 0,9" fill="#00992F" />
                </svg>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-4 py-1.5 flex items-center justify-center gap-5 text-[11px] text-zinc-600 shrink-0 select-none">
        <span>
          <kbd className="text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
            Space
          </kbd>{" "}
          play/pause
        </span>
        <span>
          <kbd className="text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
            ←→
          </kbd>{" "}
          seek ±0.5s
        </span>
        <span>
          <kbd className="text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
            ↑↓
          </kbd>{" "}
          select line
        </span>
        <span>drag handles to adjust timing</span>
        <span>drag bar to shift both</span>
      </footer>
    </div>
  );
}
