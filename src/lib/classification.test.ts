import { describe, it, expect } from 'vitest'
import { isUnclassifiedDefault, displayCategory } from './classification'
import type { Transaction } from './types'

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2024-01-15'),
    description: 'TEST MERCHANT',
    amount: 100,
    type: 'debit',
    category: 'Other',
    subcategory: '',
    sourceFile: 'test.csv',
    ...overrides,
  }
}

describe('isUnclassifiedDefault', () => {
  it('is true for a debit transaction still at the Other/blank default', () => {
    expect(isUnclassifiedDefault(makeTx({ type: 'debit', category: 'Other', subcategory: '' }))).toBe(true)
  })

  it('is true for a credit transaction still at the Income/blank default', () => {
    expect(isUnclassifiedDefault(makeTx({ type: 'credit', category: 'Income', subcategory: '' }))).toBe(true)
  })

  it('is true for a credit transaction left at Other/blank by the Claude-failure fallback', () => {
    expect(isUnclassifiedDefault(makeTx({ type: 'credit', category: 'Other', subcategory: '' }))).toBe(true)
  })

  it('is false once a subcategory has been assigned', () => {
    expect(isUnclassifiedDefault(makeTx({ type: 'debit', category: 'Other', subcategory: 'Other' }))).toBe(false)
  })

  it('is false for a genuinely classified category', () => {
    expect(isUnclassifiedDefault(makeTx({ type: 'debit', category: 'Dining', subcategory: '' }))).toBe(false)
  })
})

describe('displayCategory', () => {
  it('returns the override when one exists, even for an unclassified-default transaction', () => {
    const tx = makeTx({ id: 'tx-1', type: 'debit', category: 'Other', subcategory: '' })
    expect(displayCategory(tx, { 'tx-1': 'Shopping' })).toBe('Shopping')
  })

  it('returns "Uncategorized" for an unclassified-default transaction with no override', () => {
    const tx = makeTx({ id: 'tx-1', type: 'debit', category: 'Other', subcategory: '' })
    expect(displayCategory(tx, {})).toBe('Uncategorized')
  })

  it('returns the raw category for a classified transaction with no override', () => {
    const tx = makeTx({ id: 'tx-1', type: 'debit', category: 'Dining', subcategory: 'Restaurant' })
    expect(displayCategory(tx, {})).toBe('Dining')
  })
})
