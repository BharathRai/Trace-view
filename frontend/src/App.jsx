import { useState, useEffect } from 'react';
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

function App() {
  const [code, setCode] = useState(initialCode);
  const [pyodide, setPyodide] = useState(null);
  const [trace, setTrace] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

// frontend/src/App.jsx

  useEffect(() => {
    async function loadPyodide() {
      try {
        console.log("Loading Pyodide...");
        const pyodideInstance = await window.loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
        });
        console.log("Pyodide loaded successfully.");
        
        // Use the new, simpler path to the tracer file
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
  
  const handleError = async (errorStep) => {
    console.log("Error detected, getting AI explanation...", errorStep);
    try {
      //const response = await fetch('http://127.0.0.1:8000/get-error-explanation', {
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

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Trace-View✨</h1>
      </header>

      {isLoading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>Loading Python Environment... 🐹</div>}
      
      {!isLoading && pyodide && (
        <main className="main-content">
          <div className="editor-panel">
            <Controls onRun={runCode} trace={trace} currentStep={currentStep} setCurrentStep={setCurrentStep} />
            <div className="editor-wrapper">
                <CodeEditor code={code} setCode={setCode} currentLine={trace[currentStep]?.line_number} />
            </div>
          </div>
          <div className="visualization-panel">
            <Visualization traceStep={trace[currentStep]} error={error} />
            <hr style={{ margin: '2rem 0', borderColor: '#374151' }} />
            <AstDisplay code={code} />
          </div>
        </main>
      )}
    </div>
  );
}

export default App;