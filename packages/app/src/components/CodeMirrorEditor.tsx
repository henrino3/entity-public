import { useEffect, useRef, useCallback } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { autocompletion } from '@codemirror/autocomplete';
import { lintKeymap } from '@codemirror/lint';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

const agents = ['Ada', 'Spock', 'Scotty'];

function mentionCompleter(context: any) {
  const word = context.matchBefore(/\w*/);
  if (word?.from === word.to && !context.explicit) return null;
  return {
    from: word.from,
    options: agents.map(a => ({ label: `@${a}`, type: 'text' }))
  };
}

export default function CodeMirrorEditor({ content, onChange, onSave, readOnly = false }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();
  const editableCompartmentRef = useRef(new Compartment());
  const readOnlyCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        editableCompartmentRef.current.of(EditorView.editable.of(!readOnly)),
        readOnlyCompartmentRef.current.of(EditorState.readOnly.of(readOnly)),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...lintKeymap]),
        history(),
        autocompletion({ override: [mentionCompleter] }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px', backgroundColor: 'var(--bg-primary)' },
          '.cm-editor': { backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { padding: '16px', fontFamily: "'SF Mono', Menlo, Monaco, Consolas, monospace" },
          '.cm-gutters': { backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-primary)', color: 'var(--text-muted)' },
          '.cm-activeLine': { backgroundColor: 'rgb(26 26 26 / 0.7)' },
          '.cm-activeLineGutter': { backgroundColor: 'var(--bg-tertiary)' },
          '.cm-cursor': { borderLeftColor: 'var(--accent)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
            backgroundColor: 'rgb(0 170 255 / 0.2)',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: [
        editableCompartmentRef.current.reconfigure(EditorView.editable.of(!readOnly)),
        readOnlyCompartmentRef.current.reconfigure(EditorState.readOnly.of(readOnly)),
      ],
    });
  }, [readOnly]);

  // Update content when file changes
  useEffect(() => {
    if (viewRef.current && content !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: content }
      });
    }
  }, [content]);

  return <div ref={editorRef} className="h-full w-full" />;
}
