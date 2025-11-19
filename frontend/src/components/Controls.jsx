function Controls({ onRunAndTrace, onAnalyzeComplexity, trace, currentStep, setCurrentStep }) {
  const totalSteps = trace.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1); // Correct increment
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSliderChange = (e) => {
    setCurrentStep(Number(e.target.value));
  };

  return (
    <div className="controls-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
        
        {/* Button 1: Execution */}
        <button onClick={onRunAndTrace} className="run-button" style={{ flexGrow: 1 }}>
            ▶ Run & Trace
        </button>
        
        {/* Button 2: Complexity */}
        <button 
            onClick={onAnalyzeComplexity} 
            className="step-button" 
            style={{ flexGrow: 1, backgroundColor: '#0056b3' }}
        >
            📈 Analyze Complexity
        </button>
        
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
          <button onClick={handlePrev} disabled={currentStep === 0} className="step-button">
            {'< Prev'}
          </button>
          <span className="step-info">
            Step: {currentStep + 1} / {totalSteps}
          </span>
          <button onClick={handleNext} disabled={currentStep >= totalSteps - 1} className="step-button">
            {'Next >'}
          </button>

          {totalSteps > 1 && (
            <input
              type="range"
              min="0"
              max={totalSteps - 1}
              value={currentStep}
              onChange={handleSliderChange}
              style={{ width: '100%', cursor: 'pointer', marginLeft: '10px' }}
            />
          )}
      </div>
    </div>
  );
}

export default Controls;