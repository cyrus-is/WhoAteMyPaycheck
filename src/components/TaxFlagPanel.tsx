import { useState } from 'react'
import type { Transaction } from '../lib/types'
import type { TaxResult, TaxArea } from '../lib/lenses/types'
import { TAX_AREAS } from '../lib/lenses/types'

interface TaxFlagPanelProps {
  transactions: Transaction[]
  taxResults: TaxResult[]
  taxOverrides: Record<string, TaxArea>
  onOverride: (id: string, taxArea: TaxArea) => void
}

export function TaxFlagPanel({ transactions, taxResults, taxOverrides, onOverride }: TaxFlagPanelProps) {
  const [legendOpen, setLegendOpen] = useState(false)
  const resultMap = new Map(taxResults.map((r) => [r.id, r]))

  const flagged = transactions.filter((tx) => {
    if (taxOverrides[tx.id]) return false
    return resultMap.get(tx.id)?.ambiguous === true
  })

  if (flagged.length === 0) return null

  return (
    <div className="tax-flag-panel">
      <div className="tax-flag-panel__header">
        <span className="tax-flag-panel__title">Flagged transactions</span>
        <span className="tax-flag-panel__count">{flagged.length} need review</span>
        <button
          className={`tax-flag-panel__legend-btn${legendOpen ? ' tax-flag-panel__legend-btn--open' : ''}`}
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          title="What do these categories mean?"
        >
          ? What's each category?
        </button>
      </div>

      {legendOpen && (
        <div className="tax-legend">
          {TAX_AREAS.map((area) => (
            <div key={area.id} className="tax-legend__item">
              <div className="tax-legend__dot" style={{ background: area.color }} />
              <div className="tax-legend__text">
                <span className="tax-legend__label">{area.label}</span>
                <span className="tax-legend__ref">{area.irsRef}</span>
                <span className="tax-legend__desc">{area.description}</span>
                <span className="tax-legend__examples">e.g. {area.examples}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="tax-flag-panel__hint">
        These transactions could fit multiple categories. Pick the right one for your situation.
      </p>
      <ul className="tax-flag-panel__list">
        {flagged.map((tx) => {
          const suggestion = resultMap.get(tx.id)?.taxArea ?? 'non-deductible'
          return (
            <li key={tx.id} className="tax-flag-item">
              <div className="tax-flag-item__info">
                <span className="tax-flag-item__desc">{tx.description}</span>
                <span className="tax-flag-item__amount">
                  ${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="tax-flag-item__select-wrap">
                <select
                  className="tax-flag-item__select"
                  defaultValue={suggestion}
                  onChange={(e) => onOverride(tx.id, e.target.value as TaxArea)}
                  aria-label={`Tax category for ${tx.description}`}
                >
                  {TAX_AREAS.map((area) => (
                    <option key={area.id} value={area.id}>{area.label}</option>
                  ))}
                </select>
                <button
                  className="tax-flag-item__resolve"
                  onClick={() => onOverride(tx.id, suggestion)}
                  title="Accept suggestion"
                >
                  ✓
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
