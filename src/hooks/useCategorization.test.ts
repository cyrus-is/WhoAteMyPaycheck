/**
 * Offline-first classification tests for useCategorization.handleFiles
 * (docs/classification-improvement-fable.md §2.C, docs/product-review-fable.md §5 PR-2).
 */
import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { useCategorization } from './useCategorization'

function loadSampleFile(filename: string): File {
  const content = readFileSync(resolve(__dirname, '../../sample-data', filename), 'utf8')
  return new File([content], filename, { type: 'text/csv' })
}

describe('useCategorization — offline-first classification', () => {
  it('classifies known merchants via classifyByMerchant in handleFiles with no API key', async () => {
    const { result } = renderHook(() => useCategorization(''))

    await act(async () => {
      await result.current.handleFiles([loadSampleFile('bofa-credit-card.csv')])
    })

    expect(result.current.allTransactions.length).toBeGreaterThan(0)
    expect(result.current.hasCategorized).toBe(true)
    // bofa-credit-card.csv has a known offline miss (AMAZON MKTPLACE PMTS variant) — partial, not full, coverage
    expect(result.current.uncategorizedCount).toBeGreaterThan(0)
    expect(result.current.percentCategorized).toBeGreaterThanOrEqual(80)
    expect(result.current.percentCategorized).toBeLessThan(100)
    // No API key — the Claude button must stay hidden regardless of the remainder
    expect(result.current.showCategorizeBtn).toBe(false)
  })

  it('gates the Claude button on both a present API key and a nonzero remainder', async () => {
    const { result } = renderHook(() => useCategorization('sk-ant-test-key'))

    await act(async () => {
      await result.current.handleFiles([loadSampleFile('bofa-credit-card.csv')])
    })

    expect(result.current.uncategorizedCount).toBeGreaterThan(0)
    expect(result.current.showCategorizeBtn).toBe(true)
  })

  it('does not overwrite transactions already classified offline when more files are added', async () => {
    const { result } = renderHook(() => useCategorization(''))

    await act(async () => {
      await result.current.handleFiles([loadSampleFile('bofa-credit-card.csv')])
    })

    const classified = result.current.allTransactions.find((tx) => tx.subcategory !== '')
    expect(classified).toBeDefined()
    const before = { category: classified!.category, subcategory: classified!.subcategory }

    await act(async () => {
      await result.current.handleFiles([loadSampleFile('amex-gold.csv')])
    })

    expect(result.current.files.length).toBe(2)
    const after = result.current.allTransactions.find((tx) => tx.id === classified!.id)
    expect(after?.category).toBe(before.category)
    expect(after?.subcategory).toBe(before.subcategory)
  })

  it('harvests bank-provided categories for merchants unknown to the dictionary (§4 PR-5)', async () => {
    const { result } = renderHook(() => useCategorization(''))

    await act(async () => {
      await result.current.handleFiles([loadSampleFile('monzo-uk.csv')])
    })

    // Bare "Amazon" (no ".COM"/"MKTP" suffix) doesn't match any merchantLookup rule, but
    // monzo-uk.csv's own Category column says "Shopping" for it.
    const amazon = result.current.allTransactions.find((tx) => tx.description === 'Amazon')
    expect(amazon).toBeDefined()
    expect(amazon?.category).toBe('Shopping')
    expect(amazon?.subcategory).toBe('Shopping')
    expect(amazon?.source).toBe('bank')

    // Known merchants classified by the dictionary must NOT be tagged with a bank source.
    const tesco = result.current.allTransactions.find((tx) => tx.description.includes('Tesco Express'))
    expect(tesco?.category).toBe('Groceries')
    expect(tesco?.source).toBeUndefined()
  })

  it('never touches the network while classifying offline', async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('unexpected network request in test')))
    vi.stubGlobal('fetch', fetchSpy)
    try {
      const { result } = renderHook(() => useCategorization(''))
      await act(async () => {
        await result.current.handleFiles([loadSampleFile('bofa-credit-card.csv')])
      })
      expect(result.current.allTransactions.length).toBeGreaterThan(0)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('clears the bank source tag when a mode-change re-run overwrites it with a Claude result', async () => {
    vi.doMock('../lib/categorize', () => ({
      categorizeTransactions: vi.fn(async (transactions: { id: string }[]) =>
        transactions.map((tx) => ({ id: tx.id, category: 'Shopping', subcategory: 'Online shopping' })),
      ),
    }))
    try {
      const { result } = renderHook(() => useCategorization('sk-ant-test-key'))

      // monzo-uk.csv alone is fully covered by the offline layers (dictionary + bank
      // harvesting), so it never reaches Claude on its own. bofa-credit-card.csv has a
      // genuine offline miss (see the "gates the Claude button" test above), which forces
      // the first handleCategorize call to actually run and record lastCategorizedMode —
      // required for a later mode switch to be recognized as a mode-change re-run.
      await act(async () => {
        await result.current.handleFiles([loadSampleFile('monzo-uk.csv'), loadSampleFile('bofa-credit-card.csv')])
      })

      const amazon = result.current.allTransactions.find((tx) => tx.description === 'Amazon')
      expect(amazon?.source).toBe('bank')

      await act(async () => {
        await result.current.handleCategorize()
      })
      expect(result.current.lastCategorizedMode).toBe('simple')
      expect(result.current.allTransactions.find((tx) => tx.description === 'Amazon')?.source).toBe('bank')

      // Now switch modes and re-run — a mode-change run resends ALL non-Transfer
      // transactions to Claude, including the already bank-categorized Amazon row.
      act(() => {
        result.current.setCategorizationMode('detailed')
      })

      await act(async () => {
        await result.current.handleCategorize()
      })

      const reCategorized = result.current.allTransactions.find((tx) => tx.description === 'Amazon')
      expect(reCategorized?.category).toBe('Shopping')
      expect(reCategorized?.subcategory).toBe('Online shopping')
      expect(reCategorized?.source).toBeUndefined()
    } finally {
      vi.doUnmock('../lib/categorize')
    }
  })
})
