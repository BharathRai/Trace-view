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
    <div className="viz-section" style={{ padding: '0.5rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Abstract Syntax Tree (AST)</h2>
        <button onClick={fetchAst} disabled={isLoading} className="step-button" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
          {isLoading ? 'Generating...' : 'Generate AST Graph'}
        </button>
      </div>

      {/* 3. Display the .message property from the error object */}
      {error && (
        <div className="error-details" style={{ color: '#fca5a5', padding: '0.5rem' }}>
          {error.message}
        </div>
      )}

      {astSvg && (
        <div
          className="viz-box"
          style={{
            backgroundColor: 'var(--ast-bg)',
            overflow: 'auto',
            padding: '0.5rem',
            maxHeight: '250px',
            border: '1px solid var(--border-color-strong)'
          }}
          dangerouslySetInnerHTML={{ __html: astSvg }}
        />
      )}
    </div>
  );
}

export default AstDisplay;