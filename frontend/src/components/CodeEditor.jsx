import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

function CodeEditor({ code, setCode, currentLine }) {
  const editorRef = useRef(null);
  // 1. Create a separate ref to hold the monaco instance
  const monacoRef = useRef(null); 
  const decorationsRef = useRef([]);

  // 2. The onMount handler now stores both the editor and monaco instances
  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
  }
  
  useEffect(() => {
    // Ensure both refs are ready before proceeding
    if (editorRef.current && monacoRef.current) {
      if (currentLine) {
        decorationsRef.current = editorRef.current.deltaDecorations(
          decorationsRef.current,
          [
            {
              // 3. Use the correct monacoRef to access .Range
              range: new monacoRef.current.Range(currentLine, 1, currentLine, 1),
              options: {
                isWholeLine: true,
                className: 'line-highlight',
              }
            }
          ]
        );
        // Reveal the line if it's not in view
        editorRef.current.revealLineInCenter(currentLine);
      } else {
        // If there's no currentLine, clear any existing highlights
        decorationsRef.current = editorRef.current.deltaDecorations(
          decorationsRef.current,
          []
        );
      }
    }
  }, [currentLine]);

  return (
    <Editor
      height="100%"
      language="python"
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