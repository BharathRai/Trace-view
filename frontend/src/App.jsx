// NEW: Import React and useRef
import React, { useState, useEffect, useRef } from 'react';
import CodeEditor from './components/CodeEditor';
import Visualization from './components/Visualization';
import Controls from './components/Controls';
import AstDisplay from './components/AstDisplay';
import './styles/index.css';

const initialCode = `def factorial(n):
    if n == 0:
        return 1
    else:
        return n * factorial(n - 1)

result = factorial(5)
print(f"Result is {result}")`;

// NEW: Define the helper component for the pop-up
function ContextualFrameNode({ frame, position }) {
  if (!frame) return null;

  // Filter variables
  const IGNORED_VARS = ['__builtins__', 'tracer', 'user_code', 'run_user_code', 'trace_json'];
  const variables = frame.locals ? Object.entries(frame.locals).filter(([key]) => !IGNORED_VARS.includes(key)) : [];

  // Hide the node if there are no variables to show
  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="inline-frame-node" style={{ top: position.top, left: position.left, opacity: position.opacity }}>
      <div className="inline-frame-title">{frame.func_name}</div>
      <div className="inline-var-grid">
        {variables.map(([key, data]) => (
          <React.Fragment key={key}>
            <div className="inline-var-box inline-var-name">{key}</div>
            <div className="inline-var-box inline-var-value">{data.value ?? '→'}</div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}


function App() {
  const [code, setCode] = useState(initialCode);
  const [pyodide, setPyodide] = useState(null);
  const [trace, setTrace] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // NEW: State for the editor and the pop-up's position
  const editorRef = useRef(null);
  const [nodePosition, setNodePosition] = useState({ top: 0, left: 0, opacity: 0 });

  // loadPyodide effect (no changes)
  useEffect(() => {
    async function loadPyodide() {
      try {
        console.log("Loading Pyodide...");
        const pyodideInstance = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
        });
        console.log("Pyodide loaded successfully.");
        const tracerCode = await (await fetch('/tracer.py')).text();
        pyodideInstance.FS.writeFile("tracer.py", tracerCode, { encoding: "utf8" });
        setPyodide(pyodideInstance);
      } catch (e) {
        console.error("Failed to load Pyodide:", e);
        setError({ details: "Could not load Python environment."});
      } finally {
        setIsLoading(false);
      }
    }
    loadPyodide();
  }, []);

  // NEW: Effect to calculate the pop-up's position when the step changes
  useEffect(() => {
    if (editorRef.current && trace[currentStep]) {
      const currentTrace = trace[currentStep];
      // Get the top-most (current) frame from the stack
      const currentFrame = currentTrace.stack?.slice(-1)[0];

      // Only show the pop-up if we are in a function call (not in <module>)
      if (currentFrame && currentFrame.func_name !== '<module>') {
        const currentLine = currentTrace.line_number;
        
        // Get Y coordinate (top) from Monaco
        const top = editorRef.current.getTopForLineNumber(currentLine) - editorRef.current.getScrollTop();
        
        // Get X coordinate (left) - place it at 70% of the editor width
        const left = editorRef.current.getLayoutInfo().width * 0.7;

        setNodePosition({ top, left, opacity: 1 });
      } else {
        // Hide the pop-up if we are in the global scope or if there's no frame
        setNodePosition({ ...nodePosition, opacity: 0 });
      }
    } else {
      // Hide the pop-up if tracing hasn't started
      setNodePosition({ ...nodePosition, opacity: 0 });
    }
  }, [currentStep, trace]); // Re-run this effect when the step changes

  // runCode function (no changes)
  const runCode = () => {
    if (!pyodide) return;
    setError(null);
    setTrace([]);
    setCurrentStep(0);
    const pythonScript = `
import tracer
user_code = """${code.replace(/"/g, '\\"')}"""
trace_json = tracer.run_user_code(user_code)
`;
    try {
      pyodide.runPython(pythonScript);
      const traceJson = pyodide.globals.get('trace_json');
      const parsedTrace = JSON.parse(traceJson);
      if (Array.isArray(parsedTrace)) {
        setTrace(parsedTrace);
        const errorStep = parsedTrace.find(step => step.event === 'error');
        if (errorStep) {
            handleError(errorStep);
        }
      } else {
        console.error("Parsing failed: The result is not an array.");
        setError({ details: "Failed to parse the execution trace from Python.", aiHint: "The tracer script might have produced an invalid output." });
      }
    } catch (e) {
      console.error("An error occurred during Python execution:", e);
      setError({ details: `Execution failed: ${e.message}`, aiHint: "A critical error prevented the code from running."});
    }
  };
  
  // handleError function (no changes)
  const handleError = async (errorStep) => {
    console.log("Error detected, getting AI explanation...", errorStep);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/get-error-explanation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code,
          error_details: errorStep,
        })
      });
      const data = await response.json();
      setError({
        details: `${errorStep.error_type}: ${errorStep.error_message}`,
        aiHint: data.explanation,
      });
    } catch (apiError) {
      console.error("API call failed:", apiError);
      setError({
        details: `${errorStep.error_type}: ${errorStep.error_message}`,
        aiHint: "Could not connect to the AI assistant.",
      });
    }
  };

  // NEW: Function to get the editor instance from the component
  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Trace-View✨</h1>
      </header>

      {isLoading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading Python Environment... 🐹</div>}
      
      {!isLoading && pyodide && (
        // NEW: Added position: 'relative' to the main content area
        <main className="main-content" style={{ position: 'relative' }}>
          <div className="editor-panel">
            <Controls onRun={runCode} trace={trace} currentStep={currentStep} setCurrentStep={setCurrentStep} />
            <div className="editor-wrapper">
                <CodeEditor
                  code={code}
                  setCode={setCode}
                  currentLine={trace[currentStep]?.line_number}
                  // NEW: Pass the mount function to get the editor instance
                  onMount={handleEditorMount}
                />
            </div>
          </div>
          <div className="visualization-panel">
            <Visualization traceStep={trace[currentStep]} error={error} />
            <hr style={{ margin: '2rem 0', borderColor: '#374151' }} />
            <AstDisplay code={code} />
          </div>

          {/* NEW: Render the pop-up node */}
          <ContextualFrameNode
            frame={trace[currentStep]?.stack?.slice(-1)[0]}
            position={nodePosition}
          />
        </main>
      )}
    </div>
  );
}

export default App;