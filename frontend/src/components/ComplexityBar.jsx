import React from 'react';

const ComplexityBar = ({ complexity, loading }) => {
  if (!complexity && !loading) return null;

  return (
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
      <div style={{ display: 'flex', gap: '20px' }}>
        {loading ? (
          <span className="animate-pulse">Analyzing complexity...</span>
        ) : (
          <>
            <div>
              <span style={{ color: '#67e8f9', fontWeight: 'bold' }}>Time: </span>
              <span>{complexity?.time || '?'}</span>
            </div>
            <div>
              <span style={{ color: '#c084fc', fontWeight: 'bold' }}>Space: </span>
              <span>{complexity?.space || '?'}</span>
            </div>
          </>
        )}
      </div>
      
      {!loading && complexity?.reason && (
        <div style={{ color: '#9ca3af', fontSize: '0.8em', maxWidth: '50%', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {complexity.reason}
        </div>
      )}
    </div>
  );
};

export default ComplexityBar;