import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

const ComplexityBar = ({ complexity, loading }) => {
  const [showDerivation, setShowDerivation] = useState(false);

  useEffect(() => {
    if (loading) setShowDerivation(false);
  }, [loading]);

  if (!complexity && !loading) return null;

  return (
    <div className="complexity-container">

      <div className="complexity-header">
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="animate-spin" style={{ width: '16px', height: '16px', border: '2px solid var(--accent-color)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
              <span style={{ color: 'var(--accent-color)' }}>Analyzing complexity...</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="complexity-label">Time</span>
                <span className="complexity-value" style={{ color: 'var(--accent-color)' }}>{complexity?.time || 'O(?)'}</span>
              </div>
              <div className="complexity-separator"></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="complexity-label">Space</span>
                <span className="complexity-value" style={{ color: '#c084fc' }}>{complexity?.space || 'O(?)'}</span>
              </div>
            </>
          )}
        </div>

        {!loading && complexity?.derivation && (
          <button
            onClick={() => setShowDerivation(!showDerivation)}
            className="complexity-toggle"
          >
            {showDerivation ? 'Hide Details' : 'Show Details'}
          </button>
        )}
      </div>

      {showDerivation && complexity?.derivation && (
        <div className="complexity-details">
          <h4>Complexity Derivation</h4>
          <div className="markdown-content">
            <ReactMarkdown>{complexity.derivation}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplexityBar;