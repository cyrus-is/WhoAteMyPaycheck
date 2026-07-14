import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LoadedFile } from '../lib/types'
import type { CategorizationMode } from '../components/CategorizationModeSelector'
import { readCsvFile } from '../lib/readCsv'
import { detectFormat, parseTransactions } from '../lib/parser'
import { detectTransfers } from '../lib/transfers'
import { classifyByMerchant } from '../lib/merchantLookup'
import { classifyByBankCategory } from '../lib/bankCategory'
import { classifyByDictionary, loadMerchantDict } from '../lib/merchantDict'

let fileCounter = 0

type AppState = 'idle' | 'loading' | 'categorizing' | 'done'

export interface CategorizationState {
  files: LoadedFile[]
  allTransactions: LoadedFile['transactions']
  hasCategorized: boolean
  parseFailedFiles: LoadedFile[]
  error: string | null
  setError: (e: string | null) => void
  appState: AppState
  progress: { done: number; total: number } | null
  overrides: Record<string, string>
  categorizationMode: CategorizationMode
  setCategorizationMode: (m: CategorizationMode) => void
  lastCategorizedMode: CategorizationMode | null
  modeChanged: boolean
  uncategorizedCount: number
  percentCategorized: number
  showCategorizeBtn: boolean
  setAppState: (s: AppState) => void
  abortRef: React.MutableRefObject<AbortController | null>
  handleFiles: (newFiles: File[]) => Promise<void>
  handleRemove: (id: string) => void
  handleOverride: (id: string, category: string) => void
  handleCategorize: () => Promise<void>
  handleCancel: () => void
}

export function useCategorization(apiKey: string): CategorizationState {
  const [files, setFiles] = useState<LoadedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [appState, setAppState] = useState<AppState>('idle')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [categorizationMode, setCategorizationMode] = useState<CategorizationMode>('simple')
  const [lastCategorizedMode, setLastCategorizedMode] = useState<CategorizationMode | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const allTransactions = useMemo(
    () => files.flatMap((f) => f.transactions),
    [files],
  )

  const hasCategorized = allTransactions.some((tx) => tx.subcategory !== '')

  const parseFailedFiles = files.filter(
    (f) => (f.rawRows?.length ?? 0) > 0 && f.transactions.length === 0,
  )

  const modeChanged =
    hasCategorized && lastCategorizedMode !== null && lastCategorizedMode !== categorizationMode

  const nonTransferCount = allTransactions.filter((tx) => tx.category !== 'Transfer').length

  const actualUncategorizedCount =
    allTransactions.filter((tx) => tx.subcategory === '' && tx.category !== 'Transfer').length

  const uncategorizedCount = modeChanged ? nonTransferCount : actualUncategorizedCount

  // Based on actualUncategorizedCount (not the modeChanged-inflated uncategorizedCount) and
  // capped below 100 while any transaction remains uncategorized, so the banner never claims
  // full coverage for a mode switch or a rounding-up remainder.
  const percentCategorized = nonTransferCount === 0
    ? 0
    : actualUncategorizedCount === 0
      ? 100
      : Math.min(99, Math.round(((nonTransferCount - actualUncategorizedCount) / nonTransferCount) * 100))

  const showCategorizeBtn =
    (uncategorizedCount > 0 || modeChanged) && !!apiKey && appState !== 'categorizing'

  // Reset to idle when files change
  useEffect(() => {
    if (appState === 'done') setAppState('idle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length])

  const handleFiles = useCallback(async (newFiles: File[]) => {
    setError(null)
    setAppState('loading')
    try {
      const loaded = await Promise.all(
        newFiles.map(async (f): Promise<LoadedFile> => {
          const { headers, rows } = await readCsvFile(f)
          try {
            const mapping = detectFormat(headers, rows)
            const { transactions, skippedRows } = parseTransactions(f.name, rows, mapping)
            return {
              id: `file-${++fileCounter}`,
              name: f.name,
              rawHeaders: headers,
              transactions,
              ...(skippedRows > 0 ? { skippedRows } : {}),
            }
          } catch {
            return {
              id: `file-${++fileCounter}`,
              name: f.name,
              rawHeaders: headers,
              rawRows: rows,
              transactions: [],
            }
          }
        }),
      )
      // Loads the shipped merchant dictionary's lazy chunk (docs/classification-improvement-
      // fable.md §4 PR-7) once before classifying — a no-op after the first file drop.
      await loadMerchantDict()

      setFiles((prev) => {
        const existingNames = new Set(prev.map((f) => f.name))
        const fresh = loaded.filter((f) => !existingNames.has(f.name))
        const next = [...prev, ...fresh]

        const allTx = next.flatMap((f) => f.transactions)
        const transferIds = detectTransfers(allTx)

        // Free, key-free offline layers — transfer detection, the shipped merchant
        // dictionary, the merchant regex table, and bank-provided category harvesting
        // (docs/classification-improvement-fable.md §2.C/§2.D/§2.F, §4 PR-3/PR-5/PR-7) —
        // run unconditionally so a Sankey can render before any API key exists. The
        // dictionary runs first (§3's layer ranking: shipped dictionary before the regex
        // table's generic keyword rules); bank category only applies when neither
        // classifies the merchant — it's a mid-confidence hint, not truth.
        return next.map((file) => ({
          ...file,
          transactions: file.transactions.map((tx) => {
            if (transferIds.has(tx.id)) return { ...tx, category: 'Transfer' }
            if (tx.category === 'Transfer' || tx.subcategory !== '') return tx
            const dictMatch = classifyByDictionary(tx.description)
            if (dictMatch) return { ...tx, category: dictMatch.category, subcategory: dictMatch.subcategory }
            const match = classifyByMerchant(tx.description, tx.type)
            if (match) return { ...tx, category: match.category, subcategory: match.subcategory }
            const bankMatch = classifyByBankCategory(tx.bankCategory, tx.type)
            if (bankMatch) {
              return { ...tx, category: bankMatch.category, subcategory: bankMatch.subcategory, source: bankMatch.source }
            }
            return tx
          }),
        }))
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file')
    } finally {
      setAppState('idle')
    }
  }, [])

  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }, [])

  const handleOverride = useCallback((id: string, category: string) => {
    setOverrides((prev) => ({ ...prev, [id]: category }))
  }, [])

  const handleCategorize = useCallback(async () => {
    if (!apiKey || allTransactions.length === 0) return
    setError(null)

    const modeChangedRun =
      hasCategorized && lastCategorizedMode !== null && lastCategorizedMode !== categorizationMode
    const uncategorized = allTransactions.filter(
      (tx) => tx.category !== 'Transfer' && (modeChangedRun || tx.subcategory === ''),
    )
    if (uncategorized.length === 0) return

    setAppState('categorizing')
    setProgress({ done: 0, total: uncategorized.length })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const { categorizeTransactions } = await import('../lib/categorize')
      const results = await categorizeTransactions(
        uncategorized,
        apiKey,
        (done, total) => setProgress({ done, total }),
        controller.signal,
        categorizationMode,
      )

      const resultMap = new Map(results.map((r) => [r.id, r]))
      setFiles((prev) =>
        prev.map((file) => ({
          ...file,
          transactions: file.transactions.map((tx) => {
            if (tx.category === 'Transfer') return tx
            const result = resultMap.get(tx.id)
            if (!result) return tx
            return { ...tx, category: result.category, subcategory: result.subcategory, source: undefined }
          }),
        })),
      )
      setLastCategorizedMode(categorizationMode)
      setAppState('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Categorization failed'
      if (!controller.signal.aborted) setError(msg)
      setAppState('idle')
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }, [apiKey, allTransactions, categorizationMode, hasCategorized, lastCategorizedMode])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    files,
    allTransactions,
    hasCategorized,
    parseFailedFiles,
    error,
    setError,
    appState,
    progress,
    overrides,
    categorizationMode,
    setCategorizationMode,
    lastCategorizedMode,
    modeChanged,
    uncategorizedCount,
    percentCategorized,
    showCategorizeBtn,
    setAppState,
    abortRef,
    handleFiles,
    handleRemove,
    handleOverride,
    handleCategorize,
    handleCancel,
  }
}
