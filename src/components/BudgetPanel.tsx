import { useRef, useState } from 'react'
import type { Budget } from '../lib/budget-types'
import type { BudgetComparisonResult } from '../lib/budget-types'
import { BudgetTable } from './BudgetTable'
import { BudgetComparisonTable } from './BudgetComparisonTable'
import { exportBudgetCSV, parseBudgetCSV, BudgetCSVParseError } from '../lib/budget-csv'

interface BudgetPanelProps {
  budget: Budget | null
  comparison: BudgetComparisonResult | null
  /** Whether there's enough data to generate a budget */
  canGenerate: boolean
  /** Whether there's at least 3 months of data (for accuracy warning) */
  hasEnoughHistory: boolean
  onGenerate: () => void
  onUpdate: (updated: Budget) => void
  onImport: (budget: Budget) => void
  onClear: () => void
}

export function BudgetPanel({
  budget,
  comparison,
  canGenerate,
  hasEnoughHistory,
  onGenerate,
  onUpdate,
  onImport,
  onClear,
}: BudgetPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [view, setView] = useState<'budget' | 'comparison'>('budget')

  function handleImportClick() {
    setImportError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so selecting the same file again works
    e.target.value = ''

    try {
      const text = await file.text()
      const parsed = parseBudgetCSV(text)
      setImportError(null)
      onImport(parsed)
    } catch (err) {
      if (err instanceof BudgetCSVParseError) {
        setImportError(err.message)
      } else {
        setImportError('Failed to read budget file')
      }
    }
  }

  return (
    <section className="budget-panel">
      <div className="budget-panel__header">
        <h2 className="budget-panel__title">
          {budget ? budget.name : 'Budget'}
        </h2>

        <div className="budget-panel__actions">
          {canGenerate && (
            <button className="budget-action-btn budget-action-btn--primary" onClick={onGenerate}>
              {budget ? 'Regenerate Budget' : 'Generate Budget'}
            </button>
          )}

          {budget && (
            <button className="budget-action-btn" onClick={() => exportBudgetCSV(budget)}>
              Export CSV
            </button>
          )}

          <button className="budget-action-btn" onClick={handleImportClick}>
            Load Budget
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {budget && (
            <button className="budget-action-btn budget-action-btn--danger" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      {!hasEnoughHistory && canGenerate && (
        <div className="budget-accuracy-warn">
          Budget accuracy improves with 3+ months of history. You have less than that — the budget will still generate but may not reflect typical spending.
        </div>
      )}

      {importError && (
        <div className="budget-import-error">
          <strong>Import failed:</strong> {importError}
        </div>
      )}

      {budget && (
        <>
          {comparison && (
            <div className="budget-view-tabs">
              <button
                className={`budget-view-tab ${view === 'budget' ? 'budget-view-tab--active' : ''}`}
                onClick={() => setView('budget')}
              >
                Budget
              </button>
              <button
                className={`budget-view-tab ${view === 'comparison' ? 'budget-view-tab--active' : ''}`}
                onClick={() => setView('comparison')}
              >
                vs Actual
              </button>
            </div>
          )}

          {view === 'budget' || !comparison
            ? <BudgetTable budget={budget} onUpdate={onUpdate} />
            : <BudgetComparisonTable result={comparison} />
          }
        </>
      )}

      {!budget && !canGenerate && (
        <p className="budget-empty-hint">
          Load and categorize transactions to generate a budget, or import a previously exported budget CSV.
        </p>
      )}
    </section>
  )
}
