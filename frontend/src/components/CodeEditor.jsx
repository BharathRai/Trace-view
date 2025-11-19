import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

function CodeEditor({ code, setCode, currentLine, onMount, language = 'python' }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null); 
  const decorationsRef = useRef([]);

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    if (onMount) {
        onMount(editor, monaco);
    }
  }
  
  useEffect(() => {
    // --- FIX: Check if monacoRef.current exists before using it ---
    if (editorRef.current && monacoRef.current) {
      
      const monaco = monacoRef.current; // Access monaco instance safely

      if (currentLine) {
        decorationsRef.current = editorRef.current.deltaDecorations(
          decorationsRef.current,
          [{
            // Use the safe variable 'monaco' instead of monacoRef.current directly if you want
            range: new monaco.Range(currentLine, 1, currentLine, 1),
            options: {
              isWholeLine: true,
              className: 'line-highlight',
            }
          }]
        );
        editorRef.current.revealLineInCenter(currentLine);
      } else {
        decorationsRef.current = editorRef.current.deltaDecorations(
          decorationsRef.current,
          []
        );
      }
    }
  }, [currentLine]); // This effect runs whenever currentLine changes

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={code}
      onChange={(value) => setCode(value)}
      onMount={handleEditorDidMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
      }}
    />
  );
}

export default CodeEditor;