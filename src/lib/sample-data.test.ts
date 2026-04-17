/**
 * Integration tests that run the full parser against every CSV in sample-data/.
 * These catch format-detection regressions before they reach users.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { detectFormat, parseTransactions } from './parser'

function loadSample(filename: string) {
  const csv = readFileSync(resolve(__dirname, '../../sample-data', filename), 'utf8')
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  return { headers: result.meta.fields ?? [], rows: result.data }
}

describe('sample-data parsing', () => {
  it('chase-checking.csv — MDY dates, single signed Amount, negative = credit', () => {
    const { headers, rows } = loadSample('chase-checking.csv')
    const mapping = detectFormat(headers, rows)

    expect(mapping.date).toBe('Transaction Date')
    expect(mapping.description).toBe('Description')
    expect(mapping.amount).toBe('Amount')
    expect(mapping.dateOrder).toBe('mdy')

    const { transactions: txns } = parseTransactions('chase-checking.csv', rows, mapping)
    expect(txns.length).toBeGreaterThan(30)

    const payroll = txns.find((t) => t.description.includes('DIRECT DEPOSIT'))
    expect(payroll).toBeDefined()
    expect(payroll?.type).toBe('credit')
    expect(payroll?.amount).toBe(3500)

    const grocery = txns.find((t) => t.description.includes('WHOLEFDS'))
    expect(grocery?.type).toBe('debit')
    expect(grocery?.amount).toBeGreaterThan(0)
  })

  it('bofa-credit-card.csv — Posted Date header, Payee column, positive = charge', () => {
    const { headers, rows } = loadSample('bofa-credit-card.csv')
    const mapping = detectFormat(headers, rows)

    expect(mapping.date).toBe('Posted Date')
    expect(mapping.description).toBe('Payee')
    expect(mapping.amount).toBe('Amount')

    const { transactions: txns } = parseTransactions('bofa-credit-card.csv', rows, mapping)
    expect(txns.length).toBeGreaterThan(30)

    // Payments (negative amounts) should be credits
    const payment = txns.find((t) => t.description.includes('PAYMENT THANK YOU'))
    expect(payment?.type).toBe('credit')

    // Charges should be debits
    const netflix = txns.find((t) => t.description.includes('NETFLIX'))
    expect(netflix?.type).toBe('debit')
    expect(netflix?.amount).toBe(15.49)
  })

  it('credit-union-checking.csv — ISO dates, separate Debit/Credit columns', () => {
    const { headers, rows } = loadSample('credit-union-checking.csv')
    const mapping = detectFormat(headers, rows)

    expect(mapping.date).toBe('Date')
    expect(mapping.description).toBe('Description')
    expect(mapping.debit).toBe('Debit')
    expect(mapping.credit).toBe('Credit')
    expect(mapping.amount).toBeUndefined()
    expect(mapping.dateOrder).toBe('mdy') // ISO dates, not slash

    const { transactions: txns } = parseTransactions('credit-union-checking.csv', rows, mapping)
    expect(txns.length).toBeGreaterThan(35)

    const payroll = txns.find((t) => t.description.includes('PAYROLL'))
    expect(payroll?.type).toBe('credit')
    expect(payroll?.amount).toBe(3500)

    const interest = txns.find((t) => t.description.includes('INTEREST EARNED'))
    expect(interest?.type).toBe('credit')

    const grocery = txns.find((t) => t.description.includes('WHOLEFDS'))
    expect(grocery?.type).toBe('debit')
  })

  it('amex-gold.csv — parenthetical amounts (NNN.NN) = charge, positive = payment', () => {
    const { headers, rows } = loadSample('amex-gold.csv')
    const mapping = detectFormat(headers, rows)

    expect(mapping.date).toBe('Date')
    expect(mapping.description).toBe('Description')
    expect(mapping.amount).toBe('Amount')

    const { transactions: txns } = parseTransactions('amex-gold.csv', rows, mapping)
    expect(txns.length).toBeGreaterThan(30)

    // Parenthetical amounts are expenses
    const grubhub = txns.find((t) => t.description.includes('GRUBHUB'))
    expect(grubhub?.type).toBe('debit')
    expect(grubhub?.amount).toBe(34.2)

    // Positive amounts (payments, refunds) are credits
    const payment = txns.find((t) => t.description.includes('AUTOPAY PAYMENT'))
    expect(payment?.type).toBe('credit')

    // All refunds (positive amounts on Amex) should be credits
    const deltaRefund = txns.find((t) => t.description === 'DELTA AIR LINES REFUND')
    expect(deltaRefund?.type).toBe('credit')
    expect(deltaRefund?.amount).toBe(100)

    const amazonRefund = txns.find((t) => t.description === 'AMAZON.COM REFUND')
    expect(amazonRefund?.type).toBe('credit')
    expect(amazonRefund?.amount).toBe(45)
  })

  it('monzo-uk.csv — DD/MM/YYYY dates, Paid out/Paid in columns, skips Amount', () => {
    const { headers, rows } = loadSample('monzo-uk.csv')
    const mapping = detectFormat(headers, rows)

    expect(mapping.date).toBe('Date')
    expect(mapping.description).toBe('Name')
    // Should prefer Paid out/in over the signed Amount column
    expect(mapping.amount).toBeUndefined()
    expect(mapping.debit).toMatch(/Paid out/i)
    expect(mapping.credit).toMatch(/Paid in/i)
    expect(mapping.dateOrder).toBe('dmy')

    const { transactions: txns } = parseTransactions('monzo-uk.csv', rows, mapping)
    expect(txns.length).toBeGreaterThan(20)

    // Salary is a credit
    const salary = txns.find((t) => t.description.includes('EMPLOYER SALARY'))
    expect(salary?.type).toBe('credit')
    expect(salary?.amount).toBe(2800)

    // Grocery is a debit
    const tesco = txns.find((t) => t.description.includes('Tesco'))
    expect(tesco?.type).toBe('debit')
    expect(tesco?.amount).toBeGreaterThan(0)

    // Dates are DD/MM — 15/01/2024 should parse as January 15
    const firstTx = txns.find((t) => t.description.includes('Tesco Express'))
    expect(firstTx?.date.getMonth()).toBe(0) // January
    expect(firstTx?.date.getDate()).toBe(15)
  })
})
