'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useGame } from './GameProvider';
import { lyrics, totalLyrics, LRC_OFFSET } from './songData';
import type { MonacoEditorHandle } from './MonacoEditor';
import type { editor } from 'monaco-editor';
import type { FeedbackEvent, FeedbackRating } from './types';

const PRE_ACTIVE_SECONDS = 3;

export function useGameEngine(
  editorRef: React.RefObject<MonacoEditorHandle | null>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  editorReady: boolean,
) {
  const { state, dispatch } = useGame();
  const decorationIdsRef = useRef<string[]>([]);
  const flashDecoRef = useRef<string[]>([]);
  const [flashActive, setFlashActive] = useState(false);
  const typedTextRef = useRef<Map<number, string>>(new Map());
  const preActiveIndicesRef = useRef<Set<number>>(new Set());
  const audioEndedRef = useRef(false);
  const finishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [preActiveVersion, setPreActiveVersion] = useState(0);
  const [feedbacks, setFeedbacks] = useState<FeedbackEvent[]>([]);
  const feedbackIdRef = useRef(0);

  const updateDecorations = useCallback(() => {
    const ed = editorRef.current?.getEditor();
    const mc = editorRef.current?.getMonaco();
    if (!ed || !mc) return;

    const model = ed.getModel();
    if (!model) return;

    const decorations: editor.IModelDeltaDecoration[] = [];
    const typedByIndex = typedTextRef.current;
    const preActive = preActiveIndicesRef.current;

    for (let i = 0; i < lyrics.length; i++) {
      const pos = state.lyricPositions[i];
      if (!pos) continue;

      const line = pos.lineNumber + 1;
      const completed = state.completedLyrics.has(i);
      const isActive = i === state.currentLyricIndex
        && state.phase !== 'idle'
        && state.phase !== 'countdown'
        && audioTime >= lyrics[i].startTime
        && audioTime < lyrics[i].endTime;
      const isWarning = preActive.has(i) && !isActive;
      const target = lyrics[i].text;
      const typed = (typedByIndex.get(i) || '').substring(0, target.length);

      let matchLen = 0;
      while (matchLen < typed.length && matchLen < target.length && typed[matchLen] === target[matchLen]) {
        matchLen++;
      }

      if (completed || matchLen >= target.length) {
        decorations.push({
          range: new mc.Range(line, pos.startColumn, line, pos.endColumn),
          options: { className: 'lyric-green' },
        });
        continue;
      }

      const hasStarted = typed.length > 0;

      let phClass: string;
      if (isActive) {
        phClass = 'lyric-placeholder-active';
      } else if (isWarning && !hasStarted) {
        phClass = 'lyric-placeholder-warning';
      } else {
        phClass = 'lyric-placeholder';
      }

      let slotClass: string;
      if (hasStarted) {
        slotClass = isActive ? 'lyric-slot-active' : 'lyric-typing';
      } else {
        slotClass = isActive ? 'lyric-slot-active' : 'lyric-slot';
      }

      const col = (c: number) => pos.startColumn + c;

      if (matchLen > 0) {
        decorations.push({
          range: new mc.Range(line, col(0), line, col(matchLen)),
          options: { className: 'lyric-green' },
        });
      }

      const wrongLen = typed.length - matchLen;
      if (wrongLen > 0) {
        decorations.push({
          range: new mc.Range(line, col(matchLen), line, col(typed.length)),
          options: { className: 'lyric-wrong' },
        });
      }

      const remaining = target.substring(typed.length);
      if (remaining) {
        decorations.push({
          range: new mc.Range(line, col(typed.length), line, col(typed.length)),
          options: {
            showIfCollapsed: true,
            before: {
              content: remaining,
              inlineClassName: phClass,
            },
            beforeContentClassName: phClass,
          },
        });
      }

      decorations.push({
        range: new mc.Range(line, col(typed.length), line, pos.endColumn),
        options: { className: slotClass },
      });
    }

    decorationIdsRef.current = ed.deltaDecorations(decorationIdsRef.current, decorations);
  }, [state.currentLyricIndex, state.completedLyrics, state.phase, state.lyricPositions, editorRef, audioTime]);

  useEffect(() => {
    updateDecorations();
  }, [updateDecorations, editorReady, preActiveVersion]);

  useEffect(() => {
    if (!editorReady || state.phase === 'idle' || state.lyricPositions.length === 0) return;
    if (flashActive) return;

    const pos = state.lyricPositions[0];
    if (!pos) return;

    const ed = editorRef.current?.getEditor();
    const mc = editorRef.current?.getMonaco();
    if (!ed || !mc) return;

    setFlashActive(true);

    const line = pos.lineNumber + 1;

    ed.revealLineInCenter(line);

    flashDecoRef.current = ed.deltaDecorations(flashDecoRef.current, [
      {
        range: new mc.Range(line, 1, line, pos.endColumn),
        options: { className: 'lyric-flash' },
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorReady, state.phase, state.lyricPositions, editorRef]);

  useEffect(() => {
    if (!flashActive) return;
    const ed = editorRef.current?.getEditor();
    if (!ed) return;

    const timer = setTimeout(() => {
      if (flashDecoRef.current.length > 0 && ed) {
        flashDecoRef.current = ed.deltaDecorations(flashDecoRef.current, []);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [flashActive, editorRef]);

  useEffect(() => {
    const ed = editorRef.current?.getEditor();
    if (!ed) return;

    const disposable = ed.onDidChangeModelContent((e) => {
      if (state.phase !== 'playing') return;

      const monacoEditor = editorRef.current?.getEditor();
      if (!monacoEditor) return;
      const model = monacoEditor.getModel();
      if (!model) return;

      const typedByIndex = typedTextRef.current;

      for (let i = 0; i < totalLyrics; i++) {
        if (state.completedLyrics.has(i)) continue;

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

        typedByIndex.set(i, typed);

        const target = lyrics[i].text;
        let matchLen = 0;
        while (matchLen < typed.length && matchLen < target.length && typed[matchLen] === target[matchLen]) {
          matchLen++;
        }

        updateDecorations();

        if (matchLen >= target.length) {
          const audio = audioRef.current;
          const timeRemaining = audio
            ? Math.max(0, lyrics[i].endTime - audio.currentTime)
            : 0;
          const isEarly = audio ? lyrics[i].startTime - audio.currentTime >= 3 : false;

          const windowDuration = lyrics[i].endTime - lyrics[i].startTime;
          const ratio = windowDuration > 0 ? timeRemaining / windowDuration : 0;
          let rating: FeedbackRating;
          if (isEarly) {
            rating = 'early';
          } else if (ratio >= 0.5) {
            rating = 'perfect';
          } else if (ratio >= 0.3) rating = 'good';
          else if (ratio >= 0.1) rating = 'okay';
          else if (matchLen >= target.length) rating = 'okay';
          else rating = 'bad';

          const fid = feedbackIdRef.current++;
          const pts = Math.round(100 + timeRemaining * 10);
          setFeedbacks(prev => [...prev, {
            id: fid, rating, points: isEarly ? Math.round(pts * 0.25) : pts,
            lineNumber: pos.lineNumber, endColumn: pos.endColumn, createdAt: Date.now(),
          }]);

          dispatch({
            type: 'COMPLETE_LYRIC',
            lyricIndex: i,
            timeRemaining,
            early: isEarly,
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
          const typedByIndex = typedTextRef.current;
          const typed = typedByIndex.get(currentIdx) || '';
          const target = lyric.text;

          let matchLen = 0;
          while (matchLen < typed.length && matchLen < target.length && typed[matchLen] === target[matchLen]) {
            matchLen++;
          }
          const percentage = target.length > 0 ? matchLen / target.length : 0;

          let rating: FeedbackRating;
          let points: number;
          if (matchLen >= target.length) {
            rating = 'perfect';
            points = Math.round(100);
            dispatch({ type: 'COMPLETE_LYRIC', lyricIndex: currentIdx, timeRemaining: 0 });
          } else if (percentage >= 0.9) {
            rating = 'perfect';
            points = Math.round(100 * percentage);
            dispatch({ type: 'COMPLETE_LYRIC', lyricIndex: currentIdx, timeRemaining: 0 });
          } else if (percentage >= 0.7) {
            rating = 'good';
            points = Math.round(100 * percentage);
            dispatch({ type: 'COMPLETE_LYRIC', lyricIndex: currentIdx, timeRemaining: 0 });
          } else if (percentage >= 0.55) {
            rating = 'okay';
            points = Math.round(75 * percentage);
            dispatch({ type: 'COMPLETE_LYRIC', lyricIndex: currentIdx, timeRemaining: 0 });
          } else if (percentage >= 0.4) {
            rating = 'bad';
            points = Math.round(50 * percentage);
            dispatch({ type: 'BREAK_COMBO' });
          } else if (percentage >= 0.2) {
            rating = 'terrible';
            points = Math.round(25 * percentage);
            dispatch({ type: 'BREAK_COMBO' });
          } else if (matchLen > 0) {
            rating = 'terrible';
            points = Math.round(25 * percentage);
            dispatch({ type: 'BREAK_COMBO' });
          } else {
            rating = 'miss';
            points = 0;
            dispatch({ type: 'BREAK_COMBO' });
          }

          const missPos = state.lyricPositions[currentIdx];
          if (missPos) {
            const fid = feedbackIdRef.current++;
            setFeedbacks(prev => [...prev, {
              id: fid, rating, points,
              lineNumber: missPos.lineNumber, endColumn: missPos.endColumn, createdAt: Date.now(),
            }]);
          }
        }
        const next = currentIdx + 1;
        if (next >= totalLyrics) {
          finishTimeoutRef.current = setTimeout(() => {
            dispatch({ type: 'FINISH' });
          }, LRC_OFFSET * 1000);
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
  }, [state.phase, state.currentLyricIndex, state.completedLyrics, state.lyricPositions, audioRef, dispatch]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      audioEndedRef.current = true;
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
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
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    typedTextRef.current = new Map();
    preActiveIndicesRef.current = new Set();
    dispatch({ type: 'START_COUNTDOWN' });

    editorRef.current?.getEditor()?.focus();

    let count = 3;
    dispatch({ type: 'SET_COUNTDOWN', value: count });
    countdownRef.current = setInterval(() => {
      count--;
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        dispatch({ type: 'SET_COUNTDOWN', value: 0 });
        dispatch({ type: 'START_PLAYING' });
        audioRef.current?.play();
        editorRef.current?.getEditor()?.focus();
      } else {
        dispatch({ type: 'SET_COUNTDOWN', value: count });
      }
    }, 800);
  }, [dispatch, audioRef, editorRef]);

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
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    typedTextRef.current = new Map();
    preActiveIndicesRef.current = new Set();
    setAudioTime(0);
    dispatch({ type: 'RESTART', board: [], lyricPositions: [] });

    setTimeout(() => {
      let count = 3;
      dispatch({ type: 'SET_COUNTDOWN', value: count });
      editorRef.current?.getEditor()?.focus();
      countdownRef.current = setInterval(() => {
        count--;
        if (count <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          dispatch({ type: 'SET_COUNTDOWN', value: 0 });
          dispatch({ type: 'START_PLAYING' });
          audio?.play();
          editorRef.current?.getEditor()?.focus();
        } else {
          dispatch({ type: 'SET_COUNTDOWN', value: count });
        }
      }, 800);
    }, 100);
  }, [audioRef, dispatch, editorRef]);

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

  const dismissFeedback = useCallback((id: number) => {
    setFeedbacks(prev => prev.filter(f => f.id !== id));
  }, []);

  return {
    startGame,
    togglePause,
    restartGame,
    getCurrentLyricText,
    getNextLyricText,
    getCurrentLineNumber,
    audioTime,
    audioDuration,
    feedbacks,
    dismissFeedback,
  };
}
