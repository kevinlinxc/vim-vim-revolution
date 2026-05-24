'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGame } from './GameProvider';
import { lyrics, totalLyrics } from './songData';
import type { MonacoEditorHandle } from './MonacoEditor';
import type { editor } from 'monaco-editor';

const PRE_ACTIVE_SECONDS = 3;

export function useGameEngine(
  editorRef: React.RefObject<MonacoEditorHandle | null>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  editorReady: boolean,
) {
  const { state, dispatch } = useGame();
  const decorationIdsRef = useRef<string[]>([]);
  const typedCountsRef = useRef<Map<number, number>>(new Map());
  const preActiveIndicesRef = useRef<Set<number>>(new Set());
  const audioEndedRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [preActiveVersion, setPreActiveVersion] = useState(0);

  const updateDecorations = useCallback(() => {
    const ed = editorRef.current?.getEditor();
    const mc = editorRef.current?.getMonaco();
    if (!ed || !mc) return;

    const model = ed.getModel();
    if (!model) return;

    const decorations: editor.IModelDeltaDecoration[] = [];
    const typedCounts = typedCountsRef.current;
    const preActive = preActiveIndicesRef.current;

    for (let i = 0; i < lyrics.length; i++) {
      const pos = state.lyricPositions[i];
      if (!pos) continue;

      const line = pos.lineNumber + 1;
      const completed = state.completedLyrics.has(i);
      const isActive = i === state.currentLyricIndex && state.phase !== 'idle' && state.phase !== 'countdown';
      const isWarning = preActive.has(i) && !isActive;
      const typedCount = typedCounts.get(i) || 0;
      const target = lyrics[i].text;

      if (completed || typedCount >= target.length) {
        decorations.push({
          range: new mc.Range(line, pos.startColumn, line, pos.endColumn),
          options: { className: 'lyric-green' },
        });
        continue;
      }

      const remaining = target.substring(typedCount);

      let phClass: string;
      if (isActive) {
        phClass = 'lyric-placeholder-active';
      } else if (isWarning) {
        phClass = 'lyric-placeholder-warning';
      } else {
        phClass = 'lyric-placeholder';
      }

      let slotClass: string;
      if (typedCount > 0) {
        slotClass = isActive ? 'lyric-slot-active' : 'lyric-typing';
      } else {
        slotClass = isActive ? 'lyric-slot-active' : 'lyric-slot';
      }

      if (typedCount > 0) {
        decorations.push({
          range: new mc.Range(line, pos.startColumn, line, pos.startColumn + typedCount),
          options: { className: 'lyric-green' },
        });
      }

      decorations.push({
        range: new mc.Range(line, pos.startColumn + typedCount, line, pos.startColumn + typedCount),
        options: {
          showIfCollapsed: true,
          before: {
            content: remaining,
            inlineClassName: phClass,
          },
          beforeContentClassName: phClass,
        },
      });

      decorations.push({
        range: new mc.Range(line, pos.startColumn + typedCount, line, pos.endColumn),
        options: { className: slotClass },
      });
    }

    decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, decorations);
  }, [state.currentLyricIndex, state.completedLyrics, state.phase, state.lyricPositions, editorRef]);

  useEffect(() => {
    updateDecorations();
  }, [updateDecorations, editorReady, preActiveVersion]);

  useEffect(() => {
    const ed = editorRef.current?.getEditor();
    if (!ed) return;

    const disposable = ed.onDidChangeModelContent((e) => {
      if (state.phase !== 'playing') return;

      const monacoEditor = editorRef.current?.getEditor();
      if (!monacoEditor) return;
      const model = monacoEditor.getModel();
      if (!model) return;

      const counts = typedCountsRef.current;

      for (let i = 0; i < totalLyrics; i++) {
        if (state.completedLyrics.has(i) && counts.get(i) !== undefined) continue;

        const pos = state.lyricPositions[i];
        if (!pos) continue;

        const targetLine = pos.lineNumber + 1;

        let changeOverlaps = false;
        for (const change of e.changes) {
          const cs = change.range.startLineNumber;
          const ce = change.range.endLineNumber;
          if (cs <= targetLine && ce >= targetLine) {
            const csc = cs === targetLine ? change.range.startColumn : 1;
            const cec = ce === targetLine ? change.range.endColumn : 99999;
            if (cec >= pos.startColumn && csc <= pos.endColumn) {
              changeOverlaps = true;
              break;
            }
          }
        }

        if (!changeOverlaps) continue;

        const lineContent = model.getLineContent(targetLine);
        const slotText = lineContent.substring(pos.startColumn - 1, pos.endColumn - 1);
        const typed = slotText.replace(/\u200B/g, '');

        const target = lyrics[i].text;
        let matchLen = 0;
        for (let j = 0; j < typed.length && j < target.length; j++) {
          if (typed[j] === target[j]) matchLen++;
          else break;
        }

        counts.set(i, matchLen);
        updateDecorations();

        if (matchLen >= target.length) {
          const audio = audioRef.current;
          const timeRemaining = audio
            ? Math.max(0, lyrics[i].endTime - audio.currentTime)
            : 0;

          dispatch({
            type: 'COMPLETE_LYRIC',
            lyricIndex: i,
            timeRemaining,
          });

          if (i + 1 < totalLyrics) {
            dispatch({ type: 'ADVANCE_LYRIC' });
          }
        }
      }
    });

    return () => disposable.dispose();
  }, [state.phase, state.currentLyricIndex, state.completedLyrics, state.lyricPositions, editorRef, audioRef, dispatch, updateDecorations]);

  useEffect(() => {
    if (state.phase !== 'playing') return;

    const audio = audioRef.current;
    if (!audio) return;

    const interval = setInterval(() => {
      const t = audio.currentTime;
      setAudioTime(t);

      const currentIdx = state.currentLyricIndex;

      if (currentIdx >= totalLyrics) return;

      const lyric = lyrics[currentIdx];
      if (lyric && t >= lyric.endTime) {
        if (!state.completedLyrics.has(currentIdx)) {
          dispatch({ type: 'BREAK_COMBO' });
        }
        const next = currentIdx + 1;
        if (next >= totalLyrics) {
          dispatch({ type: 'FINISH' });
        } else {
          dispatch({ type: 'ADVANCE_LYRIC' });
        }
      }

      const newPreActive = new Set<number>();
      for (let i = currentIdx + 1; i < totalLyrics; i++) {
        if (state.completedLyrics.has(i)) continue;
        const l = lyrics[i];
        if (l && t >= l.startTime - PRE_ACTIVE_SECONDS && t < l.startTime) {
          newPreActive.add(i);
        }
      }

      const old = preActiveIndicesRef.current;
      const changed =
        old.size !== newPreActive.size ||
        [...newPreActive].some((i) => !old.has(i));
      if (changed) {
        preActiveIndicesRef.current = newPreActive;
        setPreActiveVersion((v) => v + 1);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [state.phase, state.currentLyricIndex, state.completedLyrics, audioRef, dispatch]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      audioEndedRef.current = true;
      dispatch({ type: 'FINISH' });
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    if (audio.duration) {
      setAudioDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [audioRef, dispatch]);

  const startGame = useCallback(() => {
    typedCountsRef.current = new Map();
    preActiveIndicesRef.current = new Set();
    dispatch({ type: 'START_COUNTDOWN' });

    let count = 3;
    dispatch({ type: 'SET_COUNTDOWN', value: count });
    countdownRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        dispatch({ type: 'SET_COUNTDOWN', value: 0 });
        dispatch({ type: 'START_PLAYING' });
        audioRef.current?.play();
      } else {
        dispatch({ type: 'SET_COUNTDOWN', value: count });
      }
    }, 800);
  }, [dispatch, audioRef]);

  const togglePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state.phase === 'playing') {
      audio.pause();
      dispatch({ type: 'PAUSE' });
    } else if (state.phase === 'paused') {
      audio.play();
      dispatch({ type: 'RESUME' });
    }
  }, [state.phase, audioRef, dispatch]);

  const restartGame = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    typedCountsRef.current = new Map();
    preActiveIndicesRef.current = new Set();
    setAudioTime(0);
    dispatch({ type: 'RESTART', board: [], lyricPositions: [] });

    setTimeout(() => {
      let count = 3;
      dispatch({ type: 'SET_COUNTDOWN', value: count });
      countdownRef.current = setInterval(() => {
        count--;
        if (count <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          dispatch({ type: 'SET_COUNTDOWN', value: 0 });
          dispatch({ type: 'START_PLAYING' });
          audio?.play();
        } else {
          dispatch({ type: 'SET_COUNTDOWN', value: count });
        }
      }, 800);
    }, 100);
  }, [audioRef, dispatch]);

  const getCurrentLyricText = useCallback((): string => {
    if (state.currentLyricIndex >= totalLyrics) return '';
    return lyrics[state.currentLyricIndex]?.text ?? '';
  }, [state.currentLyricIndex]);

  const getNextLyricText = useCallback((): string => {
    const next = state.currentLyricIndex + 1;
    if (next >= totalLyrics) return '';
    return lyrics[next]?.text ?? '';
  }, [state.currentLyricIndex]);

  const getCurrentLineNumber = useCallback((): number | null => {
    const pos = state.lyricPositions[state.currentLyricIndex];
    return pos?.lineNumber ?? null;
  }, [state.currentLyricIndex, state.lyricPositions]);

  return {
    startGame,
    togglePause,
    restartGame,
    getCurrentLyricText,
    getNextLyricText,
    getCurrentLineNumber,
    audioTime,
    audioDuration,
  };
}
