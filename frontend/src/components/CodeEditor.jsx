import Editor from '@monaco-editor/react';
import { useEffect, useRef } from 'react';

// Added 'language' prop with a default value, and 'onMount' prop from parent
function CodeEditor({ code, setCode, currentLine, onMount, language = 'python' }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null); 
  const decorationsRef = useRef([]);

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    
    // Call the parent's onMount handler if it exists
    // This allows App.jsx to get a reference to the editor for positioning the pop-up
    if (onMount) {
        onMount(editor, monaco);
    }
  }
  
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      if (currentLine) {
        decorationsRef.current = editorRef.current.deltaDecorations(
          decorationsRef.current,
          [{
            range: new monacoRef.current.Range(currentLine, 1, currentLine, 1),
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
  }, [currentLine]);

  return (
    <Editor
      height="100%"
      language={language} // Use the prop here to switch syntax highlighting
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