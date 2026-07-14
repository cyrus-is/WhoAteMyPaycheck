import { describe, it, expect } from 'vitest'
import { classifyByBankCategory } from './bankCategory'

describe('classifyByBankCategory', () => {
  it('classifies a Monzo-style bank category', () => {
    expect(classifyByBankCategory('Groceries', 'debit')).toEqual({
      category: 'Groceries',
      subcategory: 'Groceries',
      source: 'bank',
    })
  })

  it('classifies via the alias table (Monzo "Eating out", Chase "Food & Drink")', () => {
    expect(classifyByBankCategory('Eating out', 'debit')).toEqual({
      category: 'Dining',
      subcategory: 'Eating out',
      source: 'bank',
    })
    expect(classifyByBankCategory('Food & Drink', 'debit')).toEqual({
      category: 'Groceries',
      subcategory: 'Food & Drink',
      source: 'bank',
    })
  })

  it('trims whitespace before resolving and for the returned subcategory', () => {
    expect(classifyByBankCategory('  Shopping  ', 'debit')).toEqual({
      category: 'Shopping',
      subcategory: 'Shopping',
      source: 'bank',
    })
  })

  it('returns null for undefined, empty, or whitespace-only input', () => {
    expect(classifyByBankCategory(undefined, 'debit')).toBeNull()
    expect(classifyByBankCategory('', 'debit')).toBeNull()
    expect(classifyByBankCategory('   ', 'debit')).toBeNull()
  })

  it('returns null for bank vocabulary with no home in the taxonomy (e.g. Chase "Charity")', () => {
    expect(classifyByBankCategory('Charity', 'debit')).toBeNull()
    expect(classifyByBankCategory('Tax', 'debit')).toBeNull()
  })

  it('classifies an Income-mapped bank category on a credit', () => {
    expect(classifyByBankCategory('Interest', 'credit')).toEqual({
      category: 'Income',
      subcategory: 'Interest',
      source: 'bank',
    })
  })

  it('returns null for an Income-mapped bank category on a debit (e.g. interest charged, not earned)', () => {
    expect(classifyByBankCategory('Interest', 'debit')).toBeNull()
    expect(classifyByBankCategory('Deposit', 'debit')).toBeNull()
  })
})
