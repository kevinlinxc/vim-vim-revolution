'use client';

import { useEffect, useRef, useState } from 'react';
import type { FeedbackEvent } from './types';
import type { MonacoEditorHandle } from './MonacoEditor';

interface FeedbackOverlayProps {
  feedbacks: FeedbackEvent[];
  editorRef: React.RefObject<MonacoEditorHandle | null>;
  onDismiss: (id: number) => void;
}

const RATING_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  perfect: { label: 'perfect!', color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  good: { label: 'good!', color: 'text-green-400', bg: 'bg-green-500/15' },
  okay: { label: 'okay', color: 'text-blue-400', bg: 'bg-blue-500/15' },
  bad: { label: 'bad', color: 'text-orange-400', bg: 'bg-orange-500/15' },
  terrible: { label: 'terrible', color: 'text-red-300', bg: 'bg-red-500/10' },
  miss: { label: 'miss!', color: 'text-red-400', bg: 'bg-red-500/15' },
};

const BADGE_DURATION = 2500;

function FeedbackBadge({
  event,
  top,
  left,
  onDone,
}: {
  event: FeedbackEvent;
  top: number;
  left: number;
  onDone: () => void;
}) {
  const r = RATING_STYLE[event.rating];
  const [visible, setVisible] = useState(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => onDoneRef.current(), BADGE_DURATION);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className={`absolute z-10 px-4 py-2.5 rounded-xl font-mono text-lg font-bold
        transition-all duration-300 pointer-events-none whitespace-nowrap ${r.bg}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <span className={r.color}>{r.label}</span>
      {event.points > 0 && (
        <span className="text-white ml-2 text-base">+{event.points}</span>
      )}
    </div>
  );
}

export default function FeedbackOverlay({ feedbacks, editorRef, onDismiss }: FeedbackOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<number, { top: number; left: number }>>({});
  const prevIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const ed = editorRef.current?.getEditor();
    if (!ed) return;

    const currentIds = new Set(feedbacks.map(f => f.id));
    const newFBs = feedbacks.filter(f => !prevIdsRef.current.has(f.id));
    prevIdsRef.current = currentIds;

    if (newFBs.length === 0) return;

    const updates: Record<number, { top: number; left: number }> = {};
    for (const fb of newFBs) {
      if (fb.lineNumber < 0 || fb.endColumn < 1) continue;
      const model = ed.getModel();
      const maxCol = model ? model.getLineMaxColumn(fb.lineNumber + 1) : fb.endColumn;
      const safeCol = Math.min(fb.endColumn, maxCol);
      const visible = ed.getScrolledVisiblePosition({ lineNumber: fb.lineNumber + 1, column: safeCol });
      if (visible) {
        updates[fb.id] = { top: visible.top - 2, left: visible.left + 16 };
      }
    }
    setPositions(prev => ({ ...prev, ...updates }));
  }, [feedbacks, editorRef]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {feedbacks.map(fb => {
        const pos = positions[fb.id];
        if (!pos) return null;
        return (
          <FeedbackBadge
            key={fb.id}
            event={fb}
            top={pos.top}
            left={pos.left}
            onDone={() => onDismiss(fb.id)}
          />
        );
      })}
    </div>
  );
}
