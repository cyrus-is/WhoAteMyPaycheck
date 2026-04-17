import { describe, it, expect } from 'vitest'
import { detectRecurring } from './recurring'
import type { Transaction } from './types'

let idSeq = 0
function makeTx(overrides: Partial<Transaction> & { date: Date }): Transaction {
  return {
    id: `tx-${++idSeq}`,
    description: 'TEST MERCHANT',
    amount: 15.99,
    type: 'debit',
    category: 'Subscriptions',
    subcategory: 'Streaming',
    sourceFile: 'test.csv',
    ...overrides,
  }
}

/** Generate n transactions spaced ~intervalDays apart starting from startDate */
function monthlyTxns(
  description: string,
  category: string,
  amount: number | ((i: number) => number),
  count: number,
  startDate = new Date('2024-01-15'),
  intervalDays = 30,
): Transaction[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i * intervalDays)
    return makeTx({
      description,
      category,
      amount: typeof amount === 'function' ? amount(i) : amount,
      date,
    })
  })
}

describe('detectRecurring', () => {
  it('detects a monthly fixed subscription (Netflix)', () => {
    const txns = monthlyTxns('NETFLIX.COM', 'Subscriptions', 15.99, 4)
    const results = detectRecurring(txns)
    expect(results).toHaveLength(1)
    expect(results[0].merchant).toBe('Netflix')
    expect(results[0].type).toBe('fixed')
    expect(results[0].cadence).toBe('monthly')
    expect(results[0].lastAmount).toBe(15.99)
  })

  it('detects a monthly variable-predictable expense (electric bill)', () => {
    // Electric bill varies 10–20% — moderate variance
    const amounts = [120, 95, 140, 110]
    const txns = monthlyTxns('PG&E ELECTRIC', 'Housing', 0, 4)
      .map((tx, i) => ({ ...tx, amount: amounts[i] }))
    const results = detectRecurring(txns)
    expect(results).toHaveLength(1)
    expect(results[0].merchant).toBe('PG&E')
    expect(results[0].type).toBe('variable-predictable')
    expect(results[0].cadence).toBe('monthly')
    expect(results[0].averageAmount).toBeCloseTo((120 + 95 + 140 + 110) / 4, 1)
  })

  it('does not flag merchants with <3 occurrences', () => {
    const txns = monthlyTxns('NETFLIX.COM', 'Subscriptions', 15.99, 2)
    const results = detectRecurring(txns)
    expect(results).toHaveLength(0)
  })

  it('does not flag irregular merchants (no consistent cadence)', () => {
    // Random intervals — not monthly, weekly, or quarterly
    const txns = [
      makeTx({ description: 'RANDOM STORE', amount: 50, date: new Date('2024-01-01') }),
      makeTx({ description: 'RANDOM STORE', amount: 50, date: new Date('2024-01-15') }),
      makeTx({ description: 'RANDOM STORE', amount: 50, date: new Date('2024-03-20') }),
      makeTx({ description: 'RANDOM STORE', amount: 50, date: new Date('2024-06-05') }),
    ]
    const results = detectRecurring(txns)
    expect(results.find((r) => r.merchant === 'RANDOM STORE')).toBeUndefined()
  })

  it('does not flag merchants with high amount variance (CV ≥ 0.30)', () => {
    // Amounts vary wildly: 50, 200, 15, 300 — CV >> 30%
    const amounts = [50, 200, 15, 300]
    const txns = monthlyTxns('VARIABLE STORE', 'Shopping', 0, 4)
      .map((tx, i) => ({ ...tx, amount: amounts[i] }))
    const results = detectRecurring(txns)
    expect(results.find((r) => r.merchant.includes('VARIABLE'))).toBeUndefined()
  })

  it('detects weekly recurring transactions', () => {
    // Coffee shop every 7 days — same price
    const txns = monthlyTxns('STARBUCKS', 'Dining', 5.50, 5, new Date('2024-01-01'), 7)
    const results = detectRecurring(txns)
    const r = results.find((r) => r.merchant === 'Starbucks')
    expect(r).toBeDefined()
    expect(r?.cadence).toBe('weekly')
    expect(r?.type).toBe('fixed')
  })

  it('detects quarterly recurring transactions', () => {
    // Quarterly software subscription: 90-day intervals
    const txns = monthlyTxns('ADOBE INC', 'Subscriptions', 54.99, 4, new Date('2024-01-01'), 91)
    const results = detectRecurring(txns)
    // Adobe is not in the merchant map, so it's normalized by truncation
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].cadence).toBe('quarterly')
    expect(results[0].type).toBe('fixed')
  })

  it('ignores credit (income) transactions', () => {
    const txns = monthlyTxns('PAYROLL DIRECT DEPOSIT', 'Income', 5000, 4)
      .map((tx) => ({ ...tx, type: 'credit' as const }))
    const results = detectRecurring(txns)
    expect(results).toHaveLength(0)
  })

  it('sets category to the most common category among the merchants transactions', () => {
    const txns = [
      ...monthlyTxns('COSTCO WHSE', 'Groceries', 150, 3),
      makeTx({ description: 'COSTCO WHSE', category: 'Shopping', amount: 150, date: new Date('2024-04-15') }),
    ]
    const results = detectRecurring(txns)
    const r = results.find((r) => r.merchant === 'Costco')
    expect(r?.category).toBe('Groceries')
  })

  it('returns empty array for no transactions', () => {
    expect(detectRecurring([])).toEqual([])
  })

  it('handles multiple merchants independently', () => {
    const netflix = monthlyTxns('NETFLIX.COM', 'Subscriptions', 15.99, 4)
    const spotify = monthlyTxns('SPOTIFY USA', 'Subscriptions', 9.99, 4)
    const results = detectRecurring([...netflix, ...spotify])
    expect(results).toHaveLength(2)
    const merchants = results.map((r) => r.merchant)
    expect(merchants).toContain('Netflix')
    expect(merchants).toContain('Spotify')
  })

  it('lastAmount reflects the most recent transaction', () => {
    // Price increased on last payment
    const txns = [
      ...monthlyTxns('NETFLIX.COM', 'Subscriptions', 15.99, 3),
      makeTx({ description: 'NETFLIX.COM', category: 'Subscriptions', amount: 17.99, date: new Date('2024-04-15') }),
    ]
    const results = detectRecurring(txns)
    expect(results[0].lastAmount).toBe(17.99)
    // A 12.5% price increase bumps CV above the fixed threshold → variable-predictable
    expect(results[0].type).toBe('variable-predictable')
  })
})
