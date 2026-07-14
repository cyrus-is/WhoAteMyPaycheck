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
})
