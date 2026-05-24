import type { LyricLine, LyricPosition } from './types';

const FILLER_WORDS = [
  'Lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua', 'enim', 'ad', 'minim', 'veniam',
  'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi',
  'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute',
  'irure', 'reprehenderit', 'voluptate', 'velit', 'esse', 'cillum',
  'fugiat', 'nulla', 'pariatur', 'excepteur', 'sint', 'occaecat',
  'cupidatat', 'non', 'proident', 'sunt', 'culpa', 'qui', 'officia',
  'deserunt', 'mollit', 'anim', 'id', 'est', 'laborum',
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateFillerLine(): string {
  const wordCount = randomInt(2, 6);
  const words: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    words.push(FILLER_WORDS[randomInt(0, FILLER_WORDS.length - 1)]);
  }
  return words.join(' ');
}

function generateLineWithLyric(lyricText: string): { line: string; startColumn: number; endColumn: number } {
  const leftWordCount = randomInt(1, 3);
  const rightWordCount = randomInt(1, 3);

  const leftWords: string[] = [];
  for (let i = 0; i < leftWordCount; i++) {
    leftWords.push(FILLER_WORDS[randomInt(0, FILLER_WORDS.length - 1)]);
  }

  const rightWords: string[] = [];
  for (let i = 0; i < rightWordCount; i++) {
    rightWords.push(FILLER_WORDS[randomInt(0, FILLER_WORDS.length - 1)]);
  }

  const leftPart = leftWords.join(' ') + ' ';
  const rightPart = ' ' + rightWords.join(' ');

  const slot = '\u200B'.repeat(lyricText.length);
  const line = leftPart + slot + rightPart;
  const startColumn = leftPart.length + 1;
  const endColumn = startColumn + lyricText.length;

  return { line, startColumn, endColumn };
}

export function generateBoard(
  lyrics: LyricLine[],
  totalLines: number = 120,
  minGap: number = 1,
): { board: string[]; lyricPositions: LyricPosition[] } {
  const board: string[] = [];
  const lyricPositions: LyricPosition[] = [];
  const lyricCount = lyrics.length;

  const lineNumbers: number[] = [];
  let usedIndices = 0;

  for (let i = 0; i < lyricCount; i++) {
    const minPos = usedIndices + minGap;
    const maxPos = Math.min(
      totalLines - (lyricCount - i) * (minGap + 1) + minGap,
      totalLines - 1,
    );

    const range = maxPos - minPos;
    const pos = range > 0 ? randomInt(minPos, maxPos) : minPos;

    lineNumbers.push(pos);
    usedIndices = pos + 1;
  }

  let lyricIdx = 0;
  for (let line = 0; line < totalLines; line++) {
    if (lyricIdx < lyricCount && lineNumbers[lyricIdx] === line) {
      const lyricText = lyrics[lyricIdx].text;
      const { line: lineText, startColumn, endColumn } = generateLineWithLyric(lyricText);
      board.push(lineText);
      lyricPositions.push({
        lineNumber: line,
        startColumn,
        endColumn,
      });
      lyricIdx++;
    } else {
      board.push(generateFillerLine());
    }
  }

  return { board, lyricPositions };
}
