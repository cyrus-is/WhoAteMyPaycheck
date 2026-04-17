import { useCallback, useMemo, useState } from 'react'
import type { Transaction } from '../lib/types'
import type { Budget } from '../lib/budget-types'
import type { DateRange } from '../components/DateFilter'
import { generateBudget, compareBudgetToActual, countMonths } from '../lib/budget'
import type { BudgetComparisonResult } from '../lib/budget-types'
import { saveBudget, loadBudget, clearBudget } from '../lib/budgetStorage'

function toDateStr(d: Date): string {
  return d.toISOString().substring(0, 10)
}

export interface BudgetState {
  budget: Budget | null
  showBudgetOverlay: boolean
  setShowBudgetOverlay: (v: boolean) => void
  budgetComparison: BudgetComparisonResult | null
  hasEnoughHistory: boolean
  budgetOverlayMap: Record<string, number> | undefined
  handleGenerateBudget: () => void
  handleUpdateBudget: (updated: Budget) => void
  handleImportBudget: (imported: Budget) => void
  handleClearBudget: () => void
}

export function useBudget(
  allTransactions: Transaction[],
  filteredTransactions: Transaction[],
  hasCategorized: boolean,
  overrides: Record<string, string>,
  minDate: string,
  maxDate: string,
  dateRange: DateRange,
  activeLens: string,
): BudgetState {
  const [budget, setBudget] = useState<Budget | null>(() => loadBudget())
  const [showBudgetOverlay, setShowBudgetOverlay] = useState(false)

  const budgetComparison = useMemo(() => {
    if (!budget || !hasCategorized || filteredTransactions.length === 0) return null
    if (!dateRange.start || !dateRange.end) return null
    return compareBudgetToActual(budget, filteredTransactions, overrides, dateRange, allTransactions)
  }, [budget, hasCategorized, filteredTransactions, overrides, dateRange, allTransactions])

  const hasEnoughHistory = useMemo(() => {
    if (!minDate || !maxDate) return false
    return countMonths(minDate, maxDate) >= 3
  }, [minDate, maxDate])

  const budgetOverlayMap = useMemo(() => {
    if (!budget || !showBudgetOverlay || activeLens !== 'spending') return undefined
    const map: Record<string, number> = {}
    for (const line of budget.expenses) {
      if (line.type === 'one-time') continue
      map[line.category] = (map[line.category] ?? 0) + line.amount
    }
    return map
  }, [budget, showBudgetOverlay, activeLens])

  const handleGenerateBudget = useCallback(() => {
    if (!hasCategorized || allTransactions.length === 0) return
    const sourceRange = minDate && maxDate
      ? { start: minDate, end: maxDate }
      : { start: toDateStr(new Date()), end: toDateStr(new Date()) }
    const generated = generateBudget(allTransactions, sourceRange)
    setBudget(generated)
    saveBudget(generated)
  }, [hasCategorized, allTransactions, minDate, maxDate])

  const handleUpdateBudget = useCallback((updated: Budget) => {
    setBudget(updated)
    saveBudget(updated)
  }, [])

  const handleImportBudget = useCallback((imported: Budget) => {
    setBudget(imported)
    saveBudget(imported)
  }, [])

  const handleClearBudget = useCallback(() => {
    setBudget(null)
    clearBudget()
  }, [])

  return {
    budget,
    showBudgetOverlay,
    setShowBudgetOverlay,
    budgetComparison,
    hasEnoughHistory,
    budgetOverlayMap,
    handleGenerateBudget,
    handleUpdateBudget,
    handleImportBudget,
    handleClearBudget,
  }
}
