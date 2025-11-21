function Controls({ onRunAndTrace, onAnalyzeComplexity, trace, currentStep, setCurrentStep }) {
  const totalSteps = trace.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
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
    <div className="controls-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>

      {/* BUTTON 1: Run & Trace (Main Execution) */}
      <button onClick={onRunAndTrace} className="run-button">
        ▶ Run
      </button>

      {/* BUTTON 2: Analyze Complexity (Manual AI Call) */}
      <button
        onClick={onAnalyzeComplexity}
        className="step-button"
        style={{ backgroundColor: '#0056b3' }}
      >
        📈 Analyze
      </button>

      {/* Playback Controls and Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, minWidth: '250px' }}>
        <button onClick={handlePrev} disabled={currentStep === 0} className="step-button" title="Previous Step">
          {'<'}
        </button>

        <span className="step-info" style={{ minWidth: 'fit-content' }}>
          {currentStep + 1} / {totalSteps}
        </span>

        <button onClick={handleNext} disabled={currentStep >= totalSteps - 1} className="step-button" title="Next Step">
          {'>'}
        </button>

        {totalSteps > 1 && (
          <input
            type="range"
            min="0"
            max={totalSteps - 1}
            value={currentStep}
            onChange={handleSliderChange}
            style={{ flexGrow: 1, cursor: 'pointer' }}
          />
        )}
      </div>
    </div>
  );
}

export default Controls;