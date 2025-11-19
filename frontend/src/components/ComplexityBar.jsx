// frontend/src/components/ComplexityBar.jsx

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Component receives the final complexity object directly
const ComplexityBar = ({ complexity }) => {
  const [showDerivation, setShowDerivation] = useState(false);
  
  if (!complexity) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      
      {/* --- Top Bar: Summary & Controls --- */}
      <div style={{
        // ... (Styles) ...
      }}>
        
        {/* TIME & SPACE STATS */}
        <div style={{ display: 'flex', gap: '20px' }}>
            <div>
              <span style={{ color: '#67e8f9', fontWeight: 'bold' }}>Time: </span>
              <span>{complexity.time || 'O(?)'}</span>
            </div>
            <div>
              <span style={{ color: '#c084fc', fontWeight: 'bold' }}>Space: </span>
              <span>{complexity.space || 'O(?)'}</span>
            </div>
        </div>
        
        {/* BUTTON to show derivation */}
        {complexity.derivation && (
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
      {showDerivation && complexity.derivation && (
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