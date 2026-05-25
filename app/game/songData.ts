import type { LyricLine } from './types';

function stripPunctuation(s: string): string {
  return s.replace(/[(),.!?;:"\-—…\[\]{}]/g, '').trim().replace(/\s+/g, ' ');
}

function parseLrc(raw: string): { text: string; startTime: number }[] {
  const lines = raw.split('\n');
  const entries: { text: string; startTime: number }[] = [];

  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.+)/);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const centis = parseInt(match[3], 10);
    const divisor = match[3].length === 2 ? 100 : 1000;
    const startTime = minutes * 60 + seconds + centis / divisor;
    const text = stripPunctuation(match[4].trim());

    if (!text) continue;

    entries.push({ text, startTime });
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

  _promise = fetch('/dont-stop-me-now.txt')
    .then(r => r.text())
    .then(raw => {
      const parsed = parseLrc(raw);
      _lyrics = parsed.map((entry, i) => ({
        text: entry.text,
        startTime: Math.round(entry.startTime * 100) / 100,
        endTime: parsed[i + 1]
          ? Math.round(parsed[i + 1].startTime * 100) / 100
          : Math.round((entry.startTime + 3) * 100) / 100,
      }));
      _totalLyrics = _lyrics.length;

      lyrics = _lyrics;
      totalLyrics = _totalLyrics;
    });

  return _promise;
}
