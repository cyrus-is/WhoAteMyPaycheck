import { describe, it, expect } from 'vitest'
import { classifyByBankCategory } from './bankCategory'

describe('classifyByBankCategory', () => {
  it('classifies a Monzo-style bank category', () => {
    expect(classifyByBankCategory('Groceries')).toEqual({
      category: 'Groceries',
      subcategory: 'Groceries',
      source: 'bank',
    })
  })

  it('classifies via the alias table (Monzo "Eating out", Chase "Food & Drink")', () => {
    expect(classifyByBankCategory('Eating out')).toEqual({
      category: 'Dining',
      subcategory: 'Eating out',
      source: 'bank',
    })
    expect(classifyByBankCategory('Food & Drink')).toEqual({
      category: 'Groceries',
      subcategory: 'Food & Drink',
      source: 'bank',
    })
  })

  it('trims whitespace before resolving and for the returned subcategory', () => {
    expect(classifyByBankCategory('  Shopping  ')).toEqual({
      category: 'Shopping',
      subcategory: 'Shopping',
      source: 'bank',
    })
  })

  it('returns null for undefined, empty, or whitespace-only input', () => {
    expect(classifyByBankCategory(undefined)).toBeNull()
    expect(classifyByBankCategory('')).toBeNull()
    expect(classifyByBankCategory('   ')).toBeNull()
  })

  it('returns null for bank vocabulary with no home in the taxonomy (e.g. Chase "Charity")', () => {
    expect(classifyByBankCategory('Charity')).toBeNull()
    expect(classifyByBankCategory('Tax')).toBeNull()
  })
})
