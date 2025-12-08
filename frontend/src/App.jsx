import React, { useState, useEffect, useRef } from 'react';
import CodeEditor from './components/CodeEditor';
import Visualization from './components/Visualization';
import Controls from './components/Controls';
import AstDisplay from './components/AstDisplay';
import { runJsCode } from './utils/jsTracer';
import ComplexityBar from './components/ComplexityBar';
import './styles/index.css';

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

const initialCppCode = `#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;

// Bubble sort in C++
void bubbleSort(vector<int>& arr) {
    int n = arr.size();
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                swap(arr[j], arr[j + 1]);
            }
        }
    }
}

int main() {
    vector<int> data = {64, 34, 25, 12, 22, 11, 90};
    
    // Bubble Sort
    bubbleSort(data);

    cout << "Sorted array: ";
    for (int val : data) {
        cout << val << " ";
    }
    cout << endl;

    return 0;
}
`;

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
  const [isEnvLoading, setIsEnvLoading] = useState(true); // Initial Pyodide load
  const [isExecuting, setIsExecuting] = useState(false); // Code execution state
  const [error, setError] = useState(null);

  // Complexity State
  const [complexity, setComplexity] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const editorRef = useRef(null);
  const [nodePosition, setNodePosition] = useState({ top: 0, left: 0, opacity: 0 });

  // Switch code when language changes
  useEffect(() => {
    if (language === 'python') {
      setCode(initialPythonCode);
    } else if (language === 'javascript') {
      setCode(initialJsCode);
    } else {
      setCode(initialCppCode);
    }
    setTrace([]);
    setCurrentStep(0);
    setError(null);
    setComplexity(null);
  }, [language]);

  // Load Pyodide on startup
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
        setError({ details: "Could not load Python environment." });
      } finally {
        setIsEnvLoading(false);
      }
    }
    loadPyodide();
  }, []);

  // Calculate pop-up position
  useEffect(() => {
    if (editorRef.current && trace[currentStep]) {
      const currentTrace = trace[currentStep];
      const currentFrame = currentTrace.stack?.slice(-1)[0];

      const isValidFrame = currentFrame &&
        currentFrame.func_name !== '<module>' &&
        currentFrame.func_name !== '<global>' &&
        currentFrame.func_name !== 'anonymous';

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

  // Manual Complexity Trigger
  const triggerComplexityAnalysis = async () => {
    if (!code || code.trim() === '') {
      console.warn("Complexity Analysis skipped: Code is empty.");
      return;
    }

    setIsAnalyzing(true);
    setComplexity(null); // Clear old results

    const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    console.log(`Starting complexity analysis...API URL: ${apiUrl} `);

    try {
      const response = await fetch(`${apiUrl}/analyze-complexity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language })
      });

      console.log(`Analysis response status: ${response.status}`);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Analysis data received:", data);

      if (data.error) {
        throw new Error(data.error);
      }
      setComplexity(data);
    } catch (error) {
      console.error("Complexity Analysis failed:", error);
      setComplexity({ time: '?', space: '?', derivation: `Analysis failed: ${error.message}. Please ensure the backend is running at ${apiUrl}.` });
    } finally {
      setIsAnalyzing(false);
    }
  };

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

    // --- C++ LOGIC ---
    if (language === 'cpp') {
      const runCpp = async () => {
        try {
          setIsExecuting(true);
          const apiUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:10000'; // Default to Render port
          const response = await fetch(`${apiUrl}/trace-c`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });

          if (!response.ok) throw new Error("Backend Error");

          const data = await response.json();

          // Check for error in trace
          if (data.length > 0 && data[0].event === 'error') {
            setError({ details: data[0].error_message, aiHint: "Compilation or Runtime Error" });
            setTrace([]);
          } else {
            setTrace(data);
          }
        } catch (e) {
          setError({ details: e.message, aiHint: "Failed to connect to backend for C++ tracing." });
        } finally {
          setIsExecuting(false);
        }
      };
      runCpp();
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
      setError({ details: `Execution failed: ${e.message}`, aiHint: "A critical error prevented the code from running." });
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
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          Trace-View✨
          {isExecuting && <span style={{ fontSize: '0.8rem', color: '#67e8f9' }}>Running... ⏳</span>}
        </h1>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="lang-select"
          style={{ background: '#374151', color: 'white', padding: '0.5rem', borderRadius: '6px', border: '1px solid #555' }}
        >
          <option value="python">Python 🐍</option>
          <option value="javascript">JavaScript 🟨</option>
          <option value="cpp">C++ 🔵 (Beta)</option>
        </select>
      </header>

      {isEnvLoading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading Python Environment... 🐹</div>}

      {!isEnvLoading && (
        <main className="main-content" style={{ position: 'relative' }}>
          <div className="editor-panel" style={{ display: 'flex', flexDirection: 'column' }}>

            {/* Pass both functions to Controls */}
            <Controls
              onRunAndTrace={runCode}
              onAnalyzeComplexity={triggerComplexityAnalysis}
              trace={trace}
              currentStep={currentStep}
              setCurrentStep={setCurrentStep}
              disabled={isExecuting}
            />

            <div className="editor-wrapper" style={{ flexGrow: 1 }}>
              <CodeEditor
                code={code}
                setCode={setCode}
                currentLine={trace[currentStep]?.line_number}
                onMount={handleEditorMount}
                language={language}
              />
            </div>

            {/* Pass Complexity State and Loading Status */}
            <ComplexityBar complexity={complexity} loading={isAnalyzing} />

          </div>

          <div className="visualization-panel">
            <Visualization traceStep={trace[currentStep]} error={error} />
            <div style={{ borderTop: '1px solid #374151', margin: '0.5rem 0' }}></div>
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