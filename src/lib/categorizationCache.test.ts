import { describe, it, expect, beforeEach } from 'vitest'
import { getCached, setCached, clearCache } from './categorizationCache'

// sessionStorage is available in jsdom (Vitest's default DOM environment)
describe('categorizationCache', () => {
  beforeEach(() => {
    clearCache()
  })

  it('returns null for a cache miss', () => {
    expect(getCached('STARBUCKS', 5.5, 'debit', 'simple')).toBeNull()
  })

  it('returns the entry after a setCached call', () => {
    setCached('STARBUCKS', 5.5, 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    const result = getCached('STARBUCKS', 5.5, 'debit', 'simple')
    expect(result).toEqual({ category: 'Dining', subcategory: 'Coffee Shop' })
  })

  it('returns null for the same description with a different mode', () => {
    setCached('STARBUCKS', 5.5, 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    expect(getCached('STARBUCKS', 5.5, 'debit', 'detailed')).toBeNull()
  })

  it('returns null for the same description with a different amount', () => {
    setCached('STARBUCKS', 5.5, 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    expect(getCached('STARBUCKS', 6.0, 'debit', 'simple')).toBeNull()
  })

  it('returns null for the same description with a different type', () => {
    setCached('STARBUCKS', 5.5, 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })
    expect(getCached('STARBUCKS', 5.5, 'credit', 'simple')).toBeNull()
  })

  it('clearCache removes all entries', () => {
    setCached('AMAZON', 99.99, 'debit', 'simple', { category: 'Shopping', subcategory: 'Online Retail' })
    clearCache()
    expect(getCached('AMAZON', 99.99, 'debit', 'simple')).toBeNull()
  })

  it('stores multiple entries independently', () => {
    setCached('AMAZON', 99.99, 'debit', 'simple', { category: 'Shopping', subcategory: 'Online Retail' })
    setCached('SHELL', 60.0, 'debit', 'simple', { category: 'Transport', subcategory: 'Gas Station' })
    expect(getCached('AMAZON', 99.99, 'debit', 'simple')).toEqual({ category: 'Shopping', subcategory: 'Online Retail' })
    expect(getCached('SHELL', 60.0, 'debit', 'simple')).toEqual({ category: 'Transport', subcategory: 'Gas Station' })
  })

  it('overwrites an existing entry', () => {
    setCached('UBER', 15.0, 'debit', 'simple', { category: 'Dining', subcategory: 'Food Delivery' })
    setCached('UBER', 15.0, 'debit', 'simple', { category: 'Transport', subcategory: 'Rideshare' })
    expect(getCached('UBER', 15.0, 'debit', 'simple')).toEqual({ category: 'Transport', subcategory: 'Rideshare' })
  })
})
