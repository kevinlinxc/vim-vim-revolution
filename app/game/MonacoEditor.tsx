'use client';

import { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type * as Monaco from 'monaco-editor';

export interface MonacoEditorHandle {
  getEditor: () => editor.IStandaloneCodeEditor | null;
  getMonaco: () => typeof Monaco | null;
}

interface MonacoEditorProps {
  value: string;
  onEditorChange?: (value: string | undefined) => void;
  onReady?: () => void;
}

const MonacoEditor = forwardRef<MonacoEditorHandle, MonacoEditorProps>(
  function MonacoEditor({ value, onEditorChange, onReady }, ref) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<typeof Monaco | null>(null);

    useImperativeHandle(ref, () => ({
      getEditor: () => editorRef.current,
      getMonaco: () => monacoRef.current,
    }));

    const handleMount = useCallback(
      (ed: editor.IStandaloneCodeEditor, mc: typeof Monaco) => {
        editorRef.current = ed;
        monacoRef.current = mc;

        ed.updateOptions({
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          renderLineHighlight: 'none',
        });

        ed.focus();

        onReady?.();

        import('monaco-vim').then(({ initVimMode }) => {
          const statusBar = document.getElementById('vim-status-bar');
          if (statusBar) {
            initVimMode(ed, statusBar);
          }
        });
      },
      [onReady],
    );

    return (
      <div className="flex flex-col h-full">
        <Editor
          height="100%"
          defaultLanguage="plaintext"
          theme="vs-dark"
          value={value}
          onChange={onEditorChange}
          onMount={handleMount}
          options={{
            fontSize: 14,
            fontFamily: 'var(--font-geist-mono), monospace',
            lineNumbers: 'relative',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            renderWhitespace: 'none',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            padding: { top: 8, bottom: 8 },
            occurrencesHighlight: 'off',
            selectionHighlight: false,
            renderLineHighlight: 'none',
          }}
        />
        <div
          id="vim-status-bar"
          className="h-6 bg-zinc-800 text-zinc-300 font-mono text-xs flex items-center px-3 border-t border-zinc-700"
        />
      </div>
    );
  },
);

export default MonacoEditor;
