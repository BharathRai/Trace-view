function Controls({ onRun, trace, currentStep, setCurrentStep }) {
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
  
    return (
      <div className="controls-container">
        <button onClick={onRun} className="run-button">
          ▶ Run
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={handlePrev} disabled={currentStep === 0} className="step-button">
            {'< Prev'}
          </button>
          <span className="step-info">
            Step: {currentStep + 1} / {totalSteps}
          </span>
          <button onClick={handleNext} disabled={currentStep >= totalSteps - 1} className="step-button">
            {'Next >'}
          </button>
        </div>
      </div>
    );
  }
  
  export default Controls;