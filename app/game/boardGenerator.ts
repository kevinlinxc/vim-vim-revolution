import type { LyricLine, LyricPosition } from './types';
import { CODE_LINES } from './codeLines';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCodeLine(): string {
  return CODE_LINES[randomInt(0, CODE_LINES.length - 1)];
}

function insertLyricIntoCode(codeLine: string, lyricText: string): { line: string; startColumn: number; endColumn: number } {
  const minCol = Math.max(2, Math.floor(codeLine.length * 0.15));
  const maxCol = Math.max(minCol + 1, Math.floor(codeLine.length * 0.85));
  const insertPos = randomInt(minCol, maxCol);

  const leftPart = codeLine.substring(0, insertPos);
  const rightPart = codeLine.substring(insertPos);
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
      const codeLine = generateCodeLine();
      const { line: lineText, startColumn, endColumn } = insertLyricIntoCode(codeLine, lyricText);
      board.push(lineText);
      lyricPositions.push({
        lineNumber: line,
        startColumn,
        endColumn,
      });
      lyricIdx++;
    } else {
      board.push(generateCodeLine());
    }
  }

  return { board, lyricPositions };
}
