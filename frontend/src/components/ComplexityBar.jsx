import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

const ComplexityBar = ({ complexity, loading }) => {
  const [showDerivation, setShowDerivation] = useState(false);

  useEffect(() => {
    if (loading) setShowDerivation(false);
  }, [loading]);

  if (!complexity && !loading) return null;

  return (
    <div className="complexity-container" style={{
      width: '100%',
      marginTop: '1rem',
      background: '#1f2937',
      borderRadius: '8px',
      border: '1px solid #374151',
      overflow: 'hidden'
    }}>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        color: '#e5e7eb',
        fontSize: '0.9rem',
        fontFamily: 'JetBrains Mono, monospace'
      }}>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="animate-spin" style={{ width: '16px', height: '16px', border: '2px solid #67e8f9', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
              <span style={{ color: '#67e8f9' }}>Analyzing complexity...</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time</span>
                <span style={{ color: '#67e8f9', fontWeight: 'bold', fontSize: '1.1rem' }}>{complexity?.time || 'O(?)'}</span>
              </div>
              <div style={{ width: '1px', height: '20px', background: '#374151' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#9ca3af', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Space</span>
                <span style={{ color: '#c084fc', fontWeight: 'bold', fontSize: '1.1rem' }}>{complexity?.space || 'O(?)'}</span>
              </div>
            </>
          )}
        </div>

        {!loading && complexity?.derivation && (
          <button
            onClick={() => setShowDerivation(!showDerivation)}
            style={{
              background: showDerivation ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
              border: '1px solid #4f46e5',
              borderRadius: '6px',
              color: '#818cf8',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
          >
            {showDerivation ? 'Hide Details' : 'Show Details'}
          </button>
        )}
      </div>

      {showDerivation && complexity?.derivation && (
        <div style={{
          padding: '16px',
          backgroundColor: '#111827',
          borderTop: '1px solid #374151',
          maxHeight: '300px',
          overflowY: 'auto',
          fontSize: '0.9rem',
          lineHeight: '1.6',
          color: '#d1d5db'
        }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#e5e7eb', fontSize: '1rem' }}>Complexity Derivation</h4>
          <div className="markdown-content">
            <ReactMarkdown>{complexity.derivation}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplexityBar;