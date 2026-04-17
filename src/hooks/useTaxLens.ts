import { useCallback, useMemo, useState } from 'react'
import type { Transaction } from '../lib/types'
import type { TaxResult, TaxArea } from '../lib/lenses/types'
import { TAX_AREAS } from '../lib/lenses/types'
import { taxCategorize } from '../lib/lenses/tax-us'

export interface TaxLensState {
  taxResults: TaxResult[] | null
  taxOverrides: Record<string, TaxArea>
  taxProgress: { done: number; total: number } | null
  taxColors: Record<string, string>
  taxCategoryMap: Record<string, string>
  handleTaxOverride: (id: string, taxArea: TaxArea) => void
  /** Call when switching to tax-us lens to trigger fetch if needed. Returns true if fetch succeeded. */
  fetchTaxResults: (
    allTransactions: Transaction[],
    apiKey: string,
    abortRef: React.MutableRefObject<AbortController | null>,
    setError: (e: string | null) => void,
    setAppState: (s: 'idle' | 'loading' | 'categorizing' | 'done') => void,
  ) => Promise<boolean>
  filteredTaxCategoryMap: (
    filteredTransactions: Transaction[],
    overrides: Record<string, string>,
    activeLens: string,
  ) => Record<string, string>
}

export function useTaxLens(): TaxLensState {
  const [taxResults, setTaxResults] = useState<TaxResult[] | null>(null)
  const [taxOverrides, setTaxOverrides] = useState<Record<string, TaxArea>>({})
  const [taxProgress, setTaxProgress] = useState<{ done: number; total: number } | null>(null)

  const taxColors = useMemo(
    () => Object.fromEntries(TAX_AREAS.map((a) => [a.id, a.color])),
    [],
  )

  // Stable reference for building the tax category map from filtered transactions
  const filteredTaxCategoryMap = useCallback(
    (
      filteredTransactions: Transaction[],
      overrides: Record<string, string>,
      activeLens: string,
    ): Record<string, string> => {
      if (activeLens !== 'tax-us' || !taxResults) return {}
      const resultMap = new Map(taxResults.map((r) => [r.id, r]))
      const result: Record<string, string> = {}
      for (const tx of filteredTransactions) {
        const spendingCategory = overrides[tx.id] ?? tx.category
        if (spendingCategory === 'Transfer') continue
        if (taxOverrides[tx.id]) {
          result[tx.id] = taxOverrides[tx.id]
        } else {
          const taxResult = resultMap.get(tx.id)
          if (taxResult) result[tx.id] = taxResult.taxArea
        }
      }
      return result
    },
    [taxResults, taxOverrides],
  )

  // Memoized empty map — not actually used directly (App computes via filteredTaxCategoryMap)
  const taxCategoryMap: Record<string, string> = {}

  const handleTaxOverride = useCallback((id: string, taxArea: TaxArea) => {
    setTaxOverrides((prev) => ({ ...prev, [id]: taxArea }))
  }, [])

  const fetchTaxResults = useCallback(async (
    allTransactions: Transaction[],
    apiKey: string,
    abortRef: React.MutableRefObject<AbortController | null>,
    setError: (e: string | null) => void,
    setAppState: (s: 'idle' | 'loading' | 'categorizing' | 'done') => void,
  ): Promise<boolean> => {
    if (taxResults || !apiKey || allTransactions.length === 0) return true
    setError(null)
    setAppState('categorizing')
    setTaxProgress({ done: 0, total: allTransactions.length })
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const results = await taxCategorize(
        allTransactions,
        apiKey,
        (done, total) => setTaxProgress({ done, total }),
        controller.signal,
      )
      setTaxResults(results)
      return true
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Tax categorization failed')
      }
      return false
    } finally {
      setTaxProgress(null)
      setAppState('done')
      abortRef.current = null
    }
  }, [taxResults])

  return {
    taxResults,
    taxOverrides,
    taxProgress,
    taxColors,
    taxCategoryMap,
    handleTaxOverride,
    fetchTaxResults,
    filteredTaxCategoryMap,
  }
}
