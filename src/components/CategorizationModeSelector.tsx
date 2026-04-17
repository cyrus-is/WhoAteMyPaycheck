export type CategorizationMode = 'simple' | 'detailed'

interface CategorizationModeSelectorProps {
  mode: CategorizationMode
  onChange: (mode: CategorizationMode) => void
}

const OPTIONS: { id: CategorizationMode; label: string; description: string }[] = [
  {
    id: 'simple',
    label: 'Simple',
    description: '12 spending categories, fast',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'subcategory breakdown, same price',
  },
]

export function CategorizationModeSelector({ mode, onChange }: CategorizationModeSelectorProps) {
  return (
    <div className="cat-mode-selector" role="radiogroup" aria-label="Categorization mode">
      {OPTIONS.map(({ id, label, description }) => (
        <label key={id} className={`cat-mode-option${mode === id ? ' cat-mode-option--active' : ''}`}>
          <input
            type="radio"
            name="categorizationMode"
            value={id}
            checked={mode === id}
            onChange={() => onChange(id)}
            className="cat-mode-radio"
          />
          <span className="cat-mode-label">{label}</span>
          <span className="cat-mode-desc">— {description}</span>
        </label>
      ))}
    </div>
  )
}
