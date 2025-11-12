// frontend/src/components/Controls.jsx

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

  const handleSliderChange = (e) => {
    setCurrentStep(Number(e.target.value));
  };

  return (
    <div className="controls-container" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', width: '100%', gap: '10px' }}>
        <button onClick={onRun} className="run-button">
          ▶ Run
        </button>
        <button onClick={handlePrev} disabled={currentStep === 0} className="step-button">
          {'< Prev'}
        </button>
        <button onClick={handleNext} disabled={currentStep >= totalSteps - 1} className="step-button">
          {'Next >'}
        </button>
        <span className="step-info" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
          Step: {currentStep + 1} / {totalSteps}
        </span>
      </div>
      {totalSteps > 1 && (
        <input
          type="range"
          min="0"
          max={totalSteps - 1}
          value={currentStep}
          onChange={handleSliderChange}
          style={{ width: '100%', cursor: 'pointer' }}
        />
      )}
    </div>
  );
}

export default Controls;