import type { LensId } from '../lib/lenses/types'

interface LensSwitcherProps {
  active: LensId
  onChange: (lens: LensId) => void
  taxReady: boolean
  /** Tooltip shown on the disabled Tax lens button — explains what's missing (API key vs. no categorized data yet) */
  taxDisabledReason?: string
}

const LENSES: { id: LensId; label: string }[] = [
  { id: 'spending',   label: 'Spending' },
  { id: 'tax-us',     label: 'Tax (US)' },
  { id: 'essentials', label: 'Essentials' },
]

export function LensSwitcher({ active, onChange, taxReady, taxDisabledReason }: LensSwitcherProps) {
  return (
    <div className="lens-switcher" role="group" aria-label="View lens">
      {LENSES.map(({ id, label }) => {
        const isTax = id === 'tax-us'
        const disabled = isTax && !taxReady
        return (
          <button
            key={id}
            className={`lens-switcher__btn${active === id ? ' lens-switcher__btn--active' : ''}${disabled ? ' lens-switcher__btn--disabled' : ''}`}
            onClick={() => !disabled && onChange(id)}
            aria-pressed={active === id}
            disabled={disabled}
            title={disabled ? (taxDisabledReason ?? 'Run "Categorize with Claude" first to unlock the Tax lens') : undefined}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
