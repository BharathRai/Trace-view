import { useState } from 'react';

function AstDisplay({ code }) {
  const [astSvg, setAstSvg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null); // This will now be an object or null

  const fetchAst = async () => {
    setIsLoading(true);
    setError(null);
    setAstSvg(null);

    try {
      //const response = await fetch('http://127.0.0.1:8000/get-ast-visualization', {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/get-ast-visualization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code }),
      });
      const data = await response.json();

      if (data.error) {
        // 1. Set error as an object for consistency
        setError({ message: data.error });
      } else {
        setAstSvg(data.svg_data);
      }
    } catch (err) {
      // 2. The catch block also sets an error object
      setError({ message: "Failed to connect to the backend server." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="viz-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h2>Abstract Syntax Tree (AST)</h2>
        <button onClick={fetchAst} disabled={isLoading} className="step-button">
          {isLoading ? 'Generating...' : 'Generate AST Graph'}
        </button>
      </div>

      {/* 3. Display the .message property from the error object */}
      {error && (
        <div className="error-details" style={{color: '#fca5a5'}}>
            {error.message}
        </div>
      )}
      
      {astSvg && (
        <div 
          className="viz-box" 
          style={{ backgroundColor: '#f0f0f0', overflow: 'auto', padding: '1rem' }}
          dangerouslySetInnerHTML={{ __html: astSvg }} 
        />
      )}
    </div>
  );
}

export default AstDisplay;