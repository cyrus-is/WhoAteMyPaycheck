import { describe, it, expect, beforeEach } from 'vitest'
import { getCached, setCached, clearCache } from './categorizationCache'

// sessionStorage is available in jsdom (Vitest's default DOM environment)
describe('categorizationCache', () => {
  beforeEach(() => {
    clearCache()
  })

  it('returns null for a cache miss', () => {
    expect(getCached('STARBUCKS', 'debit', 'simple')).toBeNull()
  })

  it('returns the entry after a setCached call', () => {
    setCached('STARBUCKS', 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    const result = getCached('STARBUCKS', 'debit', 'simple')
    expect(result).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
  })

  it('returns null for the same description with a different mode', () => {
    setCached('STARBUCKS', 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    expect(getCached('STARBUCKS', 'debit', 'detailed')).toBeNull()
  })

  it('returns null for the same description with a different type', () => {
    setCached('STARBUCKS', 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    expect(getCached('STARBUCKS', 'credit', 'simple')).toBeNull()
  })

  it('treats different transactions of the same merchant as a single cache entry (amount is not part of the key)', () => {
    // "STARBUCKS #1024" at $5.50 and "STARBUCKS #9999" at $12.00 are different transactions
    // but the same merchant — they should share one entry (docs/classification-improvement-fable.md §2.A/§3).
    setCached('STARBUCKS #1024', 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    expect(getCached('STARBUCKS #9999', 'debit', 'simple')).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
  })

  it('clearCache removes all entries', () => {
    setCached('AMAZON', 'debit', 'simple', { category: 'Shopping', subcategory: 'Online Retail' })
    clearCache()
    expect(getCached('AMAZON', 'debit', 'simple')).toBeNull()
  })

  it('stores multiple entries independently', () => {
    setCached('AMAZON', 'debit', 'simple', { category: 'Shopping', subcategory: 'Online Retail' })
    setCached('SOME OTHER MERCHANT', 'debit', 'simple', { category: 'Transport', subcategory: 'Gas Station' })
    expect(getCached('AMAZON', 'debit', 'simple')).toEqual({ category: 'Shopping', subcategory: 'Online Retail' })
    expect(getCached('SOME OTHER MERCHANT', 'debit', 'simple')).toEqual({ category: 'Transport', subcategory: 'Gas Station' })
  })

  it('overwrites an existing entry', () => {
    setCached('UBER', 'debit', 'simple', { category: 'Dining', subcategory: 'Food Delivery' })
    setCached('UBER', 'debit', 'simple', { category: 'Transport', subcategory: 'Rideshare' })
    expect(getCached('UBER', 'debit', 'simple')).toEqual({ category: 'Transport', subcategory: 'Rideshare' })
  })
})
