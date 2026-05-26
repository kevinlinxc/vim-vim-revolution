import type { LyricLine } from './types';

export const LRC_OFFSET = 0;

function stripPunctuation(s: string): string {
  return s.replace(/[(),.!?;:"\-—…\[\]{}]/g, '').trim().replace(/\s+/g, ' ');
}

interface ParsedEntry {
  text: string;
  startTime: number;
  endTime: number;
}

function parseLrc(raw: string): ParsedEntry[] {
  const lines = raw.split('\n');
  const entries: ParsedEntry[] = [];

  for (const line of lines) {
    const match = line.match(
      /^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*-\s*\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.+)/,
    );
    if (!match) continue;

    const startTime =
      parseInt(match[1], 10) * 60 +
      parseInt(match[2], 10) +
      parseInt(match[3], 10) / (match[3].length === 2 ? 100 : 1000);

    const endTime =
      parseInt(match[4], 10) * 60 +
      parseInt(match[5], 10) +
      parseInt(match[6], 10) / (match[6].length === 2 ? 100 : 1000);

    const text = stripPunctuation(match[7].trim());

    if (!text) continue;

    entries.push({ text, startTime, endTime });
  }

  entries.sort((a, b) => a.startTime - b.startTime);

  for (let i = 1; i < entries.length; i++) {
    if (entries[i].startTime < entries[i - 1].endTime) {
      entries[i].startTime = entries[i - 1].endTime;
      if (entries[i].endTime < entries[i].startTime) {
        entries[i].endTime = entries[i].startTime + 0.01;
      }
    }
  }

  return entries;
}

let _lyrics: LyricLine[] = [];
let _totalLyrics = 0;
let _promise: Promise<void> | null = null;

export let lyrics: LyricLine[] = _lyrics;
export let totalLyrics = _totalLyrics;

export function loadSongData(): Promise<void> {
  if (_promise) return _promise;

  _promise = fetch('/dont-stop-me-now.lrc')
    .then(r => r.text())
    .then(raw => {
      const parsed = parseLrc(raw);
      _lyrics = parsed.map((entry) => ({
        text: entry.text,
        startTime: Math.max(0, Math.round((entry.startTime - LRC_OFFSET) * 100) / 100),
        endTime: Math.max(0.01, Math.round((entry.endTime - LRC_OFFSET) * 100) / 100),
      }));
      _totalLyrics = _lyrics.length;

      lyrics = _lyrics;
      totalLyrics = _totalLyrics;
    });

  return _promise;
}
