import React, { useState, useEffect, useRef } from 'react';
import CodeEditor from './components/CodeEditor';
import Visualization from './components/Visualization';
import Controls from './components/Controls';
import AstDisplay from './components/AstDisplay';
import { runJsCode } from './utils/jsTracer'; 
import './styles/index.css';
import ComplexityBar from './components/ComplexityBar';

const initialPythonCode = `def merge_sort(arr):
    if len(arr) > 1:
        mid = len(arr) // 2
        left_half = arr[:mid]
        right_half = arr[mid:]

        merge_sort(left_half)
        merge_sort(right_half)

        i = j = k = 0
        while i < len(left_half) and j < len(right_half):
            if left_half[i] < right_half[j]:
                arr[k] = left_half[i]
                i += 1
            else:
                arr[k] = right_half[j]
                j += 1
            k += 1

        while i < len(left_half):
            arr[k] = left_half[i]
            i += 1
            k += 1

        while j < len(right_half):
            arr[k] = right_half[j]
            j += 1
            k += 1
    return arr

data = [38, 27, 43, 3, 9, 82, 10]
sorted_data = merge_sort(data)
print(f"Sorted array is: {sorted_data}")`;

const initialJsCode = `function bubbleSort(arr) {
  var len = arr.length;
  for (var i = 0; i < len; i++) {
    for (var j = 0; j < len - i - 1; j++) {
      if (arr[j] > arr[j + 1]) {
        var temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
  return arr;
}

var data = [64, 34, 25, 12, 22, 11, 90];
print("Sorted: " + bubbleSort(data));`;

// Helper component for the pop-up
function ContextualFrameNode({ frame, position }) {
  if (!frame) return null;

  const IGNORED_VARS = ['__builtins__', 'tracer', 'user_code', 'run_user_code', 'trace_json'];
  const variables = frame.locals ? Object.entries(frame.locals).filter(([key]) => !IGNORED_VARS.includes(key)) : [];

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
  const [language, setLanguage] = useState('python'); 
  const [code, setCode] = useState(initialPythonCode);
  const [pyodide, setPyodide] = useState(null);
  const [trace, setTrace] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // ADDED: State for complexity analysis
  const [complexity, setComplexity] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const editorRef = useRef(null);
  const [nodePosition, setNodePosition] = useState({ top: 0, left: 0, opacity: 0 });

  // Switch code when language changes
  useEffect(() => {
    if (language === 'python') {
      setCode(initialPythonCode);
    } else {
      setCode(initialJsCode);
    }
    setTrace([]);
    setCurrentStep(0);
    setError(null);
    setComplexity(null); // Reset complexity on language change
  }, [language]);

  useEffect(() => {
    async function loadPyodide() {
      try {
        console.log("Loading Pyodide...");
        if (!window.pyodide) { 
            const pyodideInstance = await window.loadPyodide({
            indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
            });
            console.log("Pyodide loaded successfully.");
            const tracerCode = await (await fetch('/tracer.py')).text();
            pyodideInstance.FS.writeFile("tracer.py", tracerCode, { encoding: "utf8" });
            setPyodide(pyodideInstance);
        }
      } catch (e) {
        console.error("Failed to load Pyodide:", e);
        setError({ details: "Could not load Python environment."});
      } finally {
        setIsLoading(false);
      }
    }
    loadPyodide();
  }, []);

// ADDED: Real-time Complexity Analysis Effect with Debounce
useEffect(() => {
    // Don't analyze empty code
    if (!code || code.trim() === '') return;
    
    // Clear old result and indicate loading
    setComplexity(null);
    setIsAnalyzing(true);

    // Debounce: Wait 1.5 seconds after the user STOPS typing
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/analyze-complexity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, language })
        });
        const data = await response.json();
        setComplexity(data);
      } catch (error) {
        console.error("Analysis failed", error);
        setComplexity({ time: '?', space: '?', derivation: `Analysis failed: ${error.message}` });
      } finally {
        setIsAnalyzing(false);
      }
    }, 1500); // 1.5s delay

    // Cleanup function: cancels the timer if the code changes again
    return () => clearTimeout(timeoutId);
}, [code, language]); 

  // Calculate pop-up position
  useEffect(() => {
    if (editorRef.current && trace[currentStep]) {
      const currentTrace = trace[currentStep];
      const currentFrame = currentTrace.stack?.slice(-1)[0];

      // Check specific frame names for Python vs JS to avoid showing popups for internal wrappers
      const isValidFrame = currentFrame && 
                           currentFrame.func_name !== '<module>' && 
                           currentFrame.func_name !== '<global>' &&
                           currentFrame.func_name !== 'anonymous'; // JS often uses anonymous for main

      if (isValidFrame) {
        const currentLine = currentTrace.line_number;
        const top = editorRef.current.getTopForLineNumber(currentLine) - editorRef.current.getScrollTop();
        const left = editorRef.current.getLayoutInfo().width * 0.7;
        setNodePosition({ top, left, opacity: 1 });
      } else {
        setNodePosition({ ...nodePosition, opacity: 0 });
      }
    } else {
      setNodePosition({ ...nodePosition, opacity: 0 });
    }
  }, [currentStep, trace]);

  const runCode = () => {
    setError(null);
    setTrace([]);
    setCurrentStep(0);

    // --- JAVASCRIPT LOGIC ---
    if (language === 'javascript') {
        try {
            const traceData = runJsCode(code);
            setTrace(traceData);
        } catch (e) {
            setError({ details: e.message, aiHint: "Check your JavaScript syntax." });
        }
        return;
    }

    // --- PYTHON LOGIC ---
    if (!pyodide) return;
    
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

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
  }

  return (
    <div className="app-container">
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Trace-View✨</h1>
        
        <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)} 
            className="lang-select"
            style={{ background: '#374151', color: 'white', padding: '0.5rem', borderRadius: '6px', border: '1px solid #555' }}
        >
            <option value="python">Python 🐍</option>
            <option value="javascript">JavaScript 🟨</option>
        </select>
      </header>

      {isLoading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading Python Environment... 🐹</div>}
      
      {(!isLoading || language === 'javascript') && (
        <main className="main-content" style={{ position: 'relative' }}>
          <div className="editor-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            
            <Controls onRun={runCode} trace={trace} currentStep={currentStep} setCurrentStep={setCurrentStep} />
            
            <div className="editor-wrapper" style={{ flexGrow: 1 }}>
                <CodeEditor
                  code={code}
                  setCode={setCode}
                  currentLine={trace[currentStep]?.line_number}
                  onMount={handleEditorMount}
                  language={language}
                />
            </div>
            
            {/* 4. Add the Complexity Bar here at the bottom of the editor */}
            <ComplexityBar complexity={complexity} loading={isAnalyzing} />

          </div>
          
          <div className="visualization-panel">
            <Visualization traceStep={trace[currentStep]} error={error} />
            <hr style={{ margin: '2rem 0', borderColor: '#374151' }} />
            {/* AST is only available for Python currently */}
            {language === 'python' && <AstDisplay code={code} />}
          </div>

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