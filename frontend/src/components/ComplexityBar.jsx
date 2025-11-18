import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown'; // Used to render the AI's derivation text

const ComplexityBar = ({ complexity, loading }) => {
  // State to toggle the detailed derivation panel
  const [showDerivation, setShowDerivation] = useState(false);
  
  // Reset derivation view when a new analysis starts
  useEffect(() => {
    // If the component is loading a new analysis, hide the old derivation panel
    if (loading) setShowDerivation(false);
  }, [loading]);

  // Hide the bar if no analysis has been run or is in progress
  if (!complexity && !loading) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      
      {/* --- Top Bar: Summary & Controls --- */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 15px',
        backgroundColor: '#1f2937',
        borderTop: '1px solid #374151',
        color: '#e5e7eb',
        fontSize: '0.9rem',
        fontFamily: 'monospace'
      }}>
        
        {/* TIME & SPACE STATS */}
        <div style={{ display: 'flex', gap: '20px' }}>
          {loading ? (
            <span className="animate-pulse" style={{ color: '#67e8f9' }}>Analyzing complexity...</span>
          ) : (
            <>
              <div>
                <span style={{ color: '#67e8f9', fontWeight: 'bold' }}>Time: </span>
                <span>{complexity?.time || 'O(?)'}</span>
              </div>
              <div>
                <span style={{ color: '#c084fc', fontWeight: 'bold' }}>Space: </span>
                <span>{complexity?.space || 'O(?)'}</span>
              </div>
            </>
          )}
        </div>
        
        {/* BUTTON to show derivation (only visible when analysis is complete) */}
        {!loading && complexity?.derivation && (
          <button 
            onClick={() => setShowDerivation(!showDerivation)} 
            style={{ 
              background: 'none', 
              border: '1px solid #4f46e5', 
              borderRadius: '4px', 
              color: '#a5b4fc', 
              padding: '4px 8px', 
              cursor: 'pointer' 
            }}
          >
            {showDerivation ? 'Hide Derivation ▲' : 'Show Derivation ▼'}
          </button>
        )}
      </div>

      {/* --- Bottom Panel: Detailed Derivation --- */}
      {showDerivation && complexity?.derivation && (
        <div style={{ 
          padding: '15px', 
          backgroundColor: '#151520', 
          color: '#d1d5db', 
          borderTop: '1px solid #444',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#67e8f9' }}>Complexity Derivation</h4>
          <ReactMarkdown>{complexity.derivation}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default ComplexityBar;