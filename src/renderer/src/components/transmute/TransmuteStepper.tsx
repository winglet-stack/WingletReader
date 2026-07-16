import React from 'react'
import { TRANSMUTE_WIZARD_STEPS, type TransmuteWizardStep } from '../../engine/transmuteWizard'

interface Props {
  activeStep: TransmuteWizardStep
  onSelectStep: (step: TransmuteWizardStep) => void
}

export default function TransmuteStepper({ activeStep, onSelectStep }: Props) {
  return (
    <div className="transmute-stepper" aria-label="Transmute progress">
      {TRANSMUTE_WIZARD_STEPS.map((step, index) => (
        <button
          key={step.key}
          type="button"
          className={`transmute-stepper-item ${activeStep === step.key ? 'transmute-stepper-item--active' : ''}`}
          aria-current={activeStep === step.key ? 'step' : undefined}
          onClick={() => onSelectStep(step.key)}
        >
          <span className="transmute-stepper-index">{index + 1}</span>
          <span className="transmute-stepper-label">{step.label}</span>
        </button>
      ))}
    </div>
  )
}
