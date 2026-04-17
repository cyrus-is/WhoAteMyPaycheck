import { useCallback, useEffect, useMemo, useState } from 'react'
import { DropZone } from './components/DropZone'
import { RawTable } from './components/RawTable'
import { ApiKeyEntry } from './components/ApiKeyEntry'
import { SankeyChart } from './components/SankeyChart'
import { TransactionTable } from './components/TransactionTable'
import { DateFilter } from './components/DateFilter'
import type { DateRange } from './components/DateFilter'
import { LensSwitcher } from './components/LensSwitcher'
import { CategorizationModeSelector } from './components/CategorizationModeSelector'
import { TaxFlagPanel } from './components/TaxFlagPanel'
import { BudgetPanel } from './components/BudgetPanel'
import type { LensId } from './lib/lenses/types'
import { ESSENTIALS_BUCKETS } from './lib/lenses/types'
import { mapToEssentialsBucket } from './lib/lenses/essentials'
import { exportTaxCSV } from './lib/lenses/export'
import { getStoredApiKey } from './lib/apiKey'
import { buildSankeyData } from './lib/sankey'
import { useCategorization } from './hooks/useCategorization'
import { useTaxLens } from './hooks/useTaxLens'
import { useBudget } from './hooks/useBudget'
import { HowItWorksModal } from './components/HowItWorksModal'
import { getHowItWorksSeen } from './lib/howItWorksSeen'
import { AnomalyInsights } from './components/AnomalyInsights'
import { detectAnomalies } from './lib/anomaly'
import { CategoryVisibilityToggle } from './components/CategoryVisibilityToggle'
import { ErrorBoundary } from './components/ErrorBoundary'
import { EXPENSE_CATEGORIES } from './lib/types'

export function App() {
  const [apiKey, setApiKey] = useState<string>(() => getStoredApiKey())
  const [dateRange, setDateRange] = useState<DateRange>({ start: '', end: '' })
  const [mergeThreshold, setMergeThreshold] = useState(0.02)
  const [activeLens, setActiveLens] = useState<LensId>('spending')
  const [showHowItWorks, setShowHowItWorks] = useState<boolean>(() => !getHowItWorksSeen())
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('whoatemypaycheck:hidden-categories')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch { return new Set() }
  })

  const handleHiddenCategoriesChange = useCallback((next: Set<string>) => {
    setHiddenCategories(next)
    try {
      localStorage.setItem('whoatemypaycheck:hidden-categories', JSON.stringify([...next]))
    } catch { /* ignore */ }
  }, [])

  const cat = useCategorization(apiKey)
  const tax = useTaxLens()

  // Date bounds across all transactions
  const { minDate, maxDate } = useMemo(() => {
    if (cat.allTransactions.length === 0) return { minDate: '', maxDate: '' }
    const dates = cat.allTransactions.map((tx) => tx.date.getTime())
    return {
      minDate: new Date(Math.min(...dates)).toISOString().substring(0, 10),
      maxDate: new Date(Math.max(...dates)).toISOString().substring(0, 10),
    }
  }, [cat.allTransactions])

  // Initialize date range to full data span on first load
  useEffect(() => {
    if (minDate && maxDate && !dateRange.start) {
      setDateRange({ start: minDate, end: maxDate })
    }
  }, [minDate, maxDate, dateRange.start])

  const filteredTransactions = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return cat.allTransactions
    const start = new Date(dateRange.start).getTime()
    const end = new Date(dateRange.end + 'T23:59:59').getTime()
    return cat.allTransactions.filter(
      (tx) => tx.date.getTime() >= start && tx.date.getTime() <= end,
    )
  }, [cat.allTransactions, dateRange])

  // Categories present in the current filtered view (for the visibility toggle)
  const spendingCategories = useMemo(() => {
    if (!cat.hasCategorized || activeLens !== 'spending') return []
    const totals = new Map<string, number>()
    for (const tx of filteredTransactions) {
      const c = cat.overrides[tx.id] ?? tx.category
      if (!EXPENSE_CATEGORIES.has(c)) continue
      if (tx.type !== 'debit') continue
      totals.set(c, (totals.get(c) ?? 0) + tx.amount)
    }
    return [...totals.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
  }, [cat.hasCategorized, activeLens, filteredTransactions, cat.overrides])

  // Transactions passed to Sankey — excludes hidden categories (spending lens only)
  const sankeyTransactions = useMemo(() => {
    if (hiddenCategories.size === 0 || activeLens !== 'spending') return filteredTransactions
    return filteredTransactions.filter((tx) => {
      const c = cat.overrides[tx.id] ?? tx.category
      return !hiddenCategories.has(c)
    })
  }, [filteredTransactions, hiddenCategories, activeLens, cat.overrides])

  const budget = useBudget(
    cat.allTransactions,
    filteredTransactions,
    cat.hasCategorized,
    cat.overrides,
    minDate,
    maxDate,
    dateRange,
    activeLens,
  )

  const handleApiKey = useCallback((key: string) => {
    setApiKey(key)
  }, [])

  const handleCloseHowItWorks = useCallback(() => {
    setShowHowItWorks(false)
  }, [])

  const handleLensChange = useCallback(async (lens: LensId) => {
    setActiveLens(lens)
    if (lens === 'tax-us') {
      const ok = await tax.fetchTaxResults(
        cat.allTransactions,
        apiKey,
        cat.abortRef,
        cat.setError,
        cat.setAppState,
      )
      if (!ok) setActiveLens('spending')
    }
  }, [tax, cat.allTransactions, apiKey, cat.abortRef, cat.setError, cat.setAppState])

  // Essentials lens: remap each tx to its bucket
  const essentialsColors = useMemo(
    () => Object.fromEntries(ESSENTIALS_BUCKETS.map((b) => [b.id, b.color])),
    [],
  )

  const essentialsOverrides = useMemo(() => {
    if (activeLens !== 'essentials') return {}
    const result: Record<string, string> = {}
    for (const tx of filteredTransactions) {
      const spendingCategory = cat.overrides[tx.id] ?? tx.category
      if (spendingCategory === 'Transfer') continue
      result[tx.id] = mapToEssentialsBucket(spendingCategory)
    }
    return result
  }, [activeLens, filteredTransactions, cat.overrides])

  const taxCategoryMap = useMemo(
    () => tax.filteredTaxCategoryMap(filteredTransactions, cat.overrides, activeLens),
    [tax, filteredTransactions, cat.overrides, activeLens],
  )

  const sankeyData = useMemo(() => {
    if (!cat.hasCategorized) return null
    if (activeLens === 'essentials') {
      return buildSankeyData(sankeyTransactions, essentialsOverrides, mergeThreshold, essentialsColors)
    }
    if (activeLens === 'tax-us' && tax.taxResults) {
      const data = buildSankeyData(sankeyTransactions, taxCategoryMap, mergeThreshold, tax.taxColors)
      const deductibleIds = new Set(['schedule-a', 'schedule-c', 'form-2441', 'hsa-medical'])
      let totalDeductible = 0
      let totalNonDeductible = 0
      for (const node of data.nodes) {
        if (node.id.startsWith('cat:')) {
          const area = node.id.slice(4)
          if (deductibleIds.has(area)) totalDeductible += node.value
          else if (area === 'non-deductible') totalNonDeductible += node.value
        }
      }
      return { ...data, totalDeductible, totalNonDeductible }
    }
    return buildSankeyData(
      sankeyTransactions,
      cat.overrides,
      mergeThreshold,
      {},
      cat.categorizationMode,
    )
  }, [
    cat.hasCategorized, activeLens, sankeyTransactions, cat.overrides,
    essentialsOverrides, essentialsColors, tax.taxResults, taxCategoryMap,
    tax.taxColors, mergeThreshold, cat.categorizationMode,
  ])

  const sankeyIsEmpty = sankeyData !== null && sankeyData.nodes.length <= 1

  const anomalies = useMemo(
    () => cat.hasCategorized && activeLens === 'spending'
      ? detectAnomalies(cat.allTransactions, filteredTransactions, dateRange, cat.overrides)
      : [],
    [cat.hasCategorized, cat.allTransactions, filteredTransactions, dateRange, cat.overrides, activeLens],
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__text">
          <h1>WhoAteMyPaycheck</h1>
          <p className="tagline">Drag-drop your bank CSVs, see where your money goes.</p>
        </div>
        <button
          className="app-header__hiw-btn"
          onClick={() => setShowHowItWorks(true)}
          title="How WhoAteMyPaycheck works"
        >
          How it works
        </button>
      </header>

      <main className="app-main">
        <ApiKeyEntry onKey={handleApiKey} hasKey={!!apiKey} />

        <DropZone
          onFiles={cat.handleFiles}
          disabled={cat.appState === 'categorizing' || cat.appState === 'loading'}
        />

        {cat.appState === 'loading' && (
          <div className="loading-state">
            <span className="loading-spinner" />
            Reading files…
          </div>
        )}

        {cat.error && (
          <div className="error-banner">
            <span>{cat.error}</span>
            <button className="error-banner__dismiss" onClick={() => cat.setError(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {cat.parseFailedFiles.length > 0 && (
          <div className="warn-banner">
            <strong>Format detection failed</strong> for: {cat.parseFailedFiles.map((f) => f.name).join(', ')}.
            {apiKey
              ? ' Categorize with Claude above to parse these files.'
              : ' Add a Claude API key above to auto-detect the format.'}
          </div>
        )}

        {(() => {
          const totalSkipped = cat.files.reduce((sum, f) => sum + (f.skippedRows ?? 0), 0)
          return totalSkipped > 0 ? (
            <div className="warn-banner">
              <strong>{totalSkipped} row{totalSkipped !== 1 ? 's' : ''} skipped</strong> due to unrecognized date format.
              {' '}These transactions were excluded from the analysis.
            </div>
          ) : null
        })()}

        {cat.allTransactions.length > 0 && (
          <div className="file-summary">
            <span>{cat.files.length} file{cat.files.length !== 1 ? 's' : ''} loaded</span>
            <span className="file-summary__sep">·</span>
            <span>{cat.allTransactions.length} transactions</span>
            {cat.hasCategorized && filteredTransactions.length !== cat.allTransactions.length && (
              <>
                <span className="file-summary__sep">·</span>
                <span>{filteredTransactions.length} in range</span>
              </>
            )}
          </div>
        )}

        {cat.allTransactions.length > 0 && apiKey && cat.appState !== 'categorizing' && (
          <CategorizationModeSelector
            mode={cat.categorizationMode}
            onChange={cat.setCategorizationMode}
          />
        )}

        {cat.showCategorizeBtn && (
          <div className="categorize-wrap">
            <button className="categorize-btn" onClick={cat.handleCategorize}>
              {cat.hasCategorized ? 'Re-categorize with Claude' : 'Categorize with Claude'}
            </button>
            <p className="categorize-hint">
              Sends merchant names and amounts to Claude API to classify{' '}
              {cat.uncategorizedCount} transaction{cat.uncategorizedCount !== 1 ? 's' : ''} into
              spending categories. Your browser calls Claude directly — no data passes through our
              servers.
            </p>
          </div>
        )}

        {cat.modeChanged && cat.appState !== 'categorizing' && (
          <div className="warn-banner">
            Mode changed to <strong>{cat.categorizationMode}</strong>. Hit{' '}
            <em>Re-categorize with Claude</em> to apply the new breakdown.
          </div>
        )}

        {!apiKey && cat.uncategorizedCount > 0 && (
          <div className="warn-banner">
            No API key set. Add your Claude API key above to categorize transactions and see the
            Sankey diagram.
          </div>
        )}

        {cat.appState === 'categorizing' && cat.progress && (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar"
              style={{ width: `${Math.round((cat.progress.done / cat.progress.total) * 100)}%` }}
            />
            <span className="progress-label">
              Categorizing… {cat.progress.done}/{cat.progress.total}
            </span>
            <button className="progress-cancel" onClick={cat.handleCancel} aria-label="Cancel categorization">
              Cancel
            </button>
          </div>
        )}

        {cat.appState === 'categorizing' && tax.taxProgress && (
          <div className="progress-bar-wrap">
            <div
              className="progress-bar progress-bar--tax"
              style={{ width: `${Math.round((tax.taxProgress.done / tax.taxProgress.total) * 100)}%` }}
            />
            <span className="progress-label">
              Tax analysis… {tax.taxProgress.done}/{tax.taxProgress.total}
            </span>
            <button className="progress-cancel" onClick={cat.handleCancel} aria-label="Cancel tax categorization">
              Cancel
            </button>
          </div>
        )}

        {cat.hasCategorized && (
          <LensSwitcher
            active={activeLens}
            onChange={handleLensChange}
            taxReady={cat.hasCategorized}
          />
        )}

        {cat.hasCategorized && minDate && (
          <DateFilter
            range={dateRange}
            minDate={minDate}
            maxDate={maxDate}
            onChange={setDateRange}
          />
        )}

        {activeLens === 'tax-us' && cat.appState === 'categorizing' && tax.taxProgress && (
          <div className="lens-loading-state">
            <span className="loading-spinner" />
            Analyzing {tax.taxProgress.total} transactions for tax areas…
          </div>
        )}

        {activeLens === 'tax-us' && !tax.taxResults && cat.appState !== 'categorizing' && cat.hasCategorized && (
          <div className="empty-state">
            <p>Tax analysis failed. Check your API key and try again.</p>
          </div>
        )}

        {budget.budget && activeLens === 'spending' && cat.hasCategorized && (
          <div className="budget-overlay-toggle">
            <label className="budget-overlay-label">
              <input
                type="checkbox"
                checked={budget.showBudgetOverlay}
                onChange={(e) => budget.setShowBudgetOverlay(e.target.checked)}
              />
              Show budget limits on chart
            </label>
          </div>
        )}

        {spendingCategories.length > 0 && (
          <CategoryVisibilityToggle
            categories={spendingCategories}
            hidden={hiddenCategories}
            onChange={handleHiddenCategoriesChange}
          />
        )}

        {sankeyIsEmpty ? (
          <div className="empty-state">
            <p>
              No {activeLens === 'tax-us' ? 'deductible expenses' : 'income or expenses'} to
              display for this date range.
            </p>
            <p className="empty-state__hint">
              {activeLens === 'tax-us'
                ? 'Everything in this period was classified as Non-Deductible, or try expanding the date range.'
                : "Try expanding the date range, or check that transfers aren't masking income/expenses."}
            </p>
          </div>
        ) : (
          sankeyData && (
            <ErrorBoundary>
              <SankeyChart
                data={sankeyData}
                mergeThreshold={mergeThreshold}
                onMergeThresholdChange={setMergeThreshold}
                width={cat.categorizationMode === 'detailed' && activeLens === 'spending' ? 1200 : undefined}
                height={cat.categorizationMode === 'detailed' && activeLens === 'spending' ? 560 : undefined}
                budgetOverlay={budget.budgetOverlayMap}
              />
            </ErrorBoundary>
          )
        )}

        {activeLens === 'tax-us' && tax.taxResults && (
          <>
            <div className="tax-export-wrap">
              <button
                className="tax-export-btn"
                onClick={() => exportTaxCSV(filteredTransactions, tax.taxResults!, tax.taxOverrides)}
              >
                Export for CPA
              </button>
              <span className="tax-export-hint">
                CSV sorted by tax area — share with your accountant
              </span>
            </div>
            <TaxFlagPanel
              transactions={filteredTransactions}
              taxResults={tax.taxResults}
              taxOverrides={tax.taxOverrides}
              onOverride={tax.handleTaxOverride}
            />
          </>
        )}

        <AnomalyInsights anomalies={anomalies} />

        <ErrorBoundary>
          <BudgetPanel
            budget={budget.budget}
            comparison={budget.budgetComparison}
            canGenerate={cat.hasCategorized}
            hasEnoughHistory={budget.hasEnoughHistory}
            onGenerate={budget.handleGenerateBudget}
            onUpdate={budget.handleUpdateBudget}
            onImport={budget.handleImportBudget}
            onClear={budget.handleClearBudget}
          />
        </ErrorBoundary>

        {cat.hasCategorized ? (
          <TransactionTable
            transactions={filteredTransactions}
            overrides={cat.overrides}
            onOverride={cat.handleOverride}
          />
        ) : (
          <RawTable files={cat.files} onRemove={cat.handleRemove} />
        )}
      </main>

      <HowItWorksModal open={showHowItWorks} onClose={handleCloseHowItWorks} />
    </div>
  )
}
