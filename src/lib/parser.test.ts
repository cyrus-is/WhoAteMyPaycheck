import { describe, it, expect } from 'vitest'
import { detectFormat, detectDateOrder, parseDate, parseTransactions } from './parser'

// ─── detectFormat ────────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('detects Chase-style headers', () => {
    const headers = ['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount', 'Memo']
    const mapping = detectFormat(headers, [])
    expect(mapping.date).toBe('Transaction Date')
    expect(mapping.description).toBe('Description')
    expect(mapping.amount).toBe('Amount')
  })

  it('detects BofA debit/credit columns', () => {
    const headers = ['Date', 'Description', 'Amount', 'Running Bal.']
    const mapping = detectFormat(headers, [])
    expect(mapping.date).toBe('Date')
    expect(mapping.description).toBe('Description')
    expect(mapping.amount).toBe('Amount')
  })

  it('detects separate Debit/Credit columns (credit union style)', () => {
    const headers = ['Date', 'Description', 'Debit', 'Credit', 'Balance']
    const mapping = detectFormat(headers, [])
    expect(mapping.date).toBe('Date')
    expect(mapping.description).toBe('Description')
    expect(mapping.debit).toBe('Debit')
    expect(mapping.credit).toBe('Credit')
  })

  it('detects Amex-style (Transaction Date, Description, Amount)', () => {
    const headers = ['Date', 'Reference', 'Amount', 'Extended Details', 'Appears On Your Statement As', 'Address', 'City/State', 'Zip Code', 'Country', 'Reference', 'Category']
    const mapping = detectFormat(headers, [])
    expect(mapping.date).toBe('Date')
    expect(mapping.amount).toBe('Amount')
  })

  it('throws when no date column found', () => {
    const headers = ['Foo', 'Bar', 'Amount']
    expect(() => detectFormat(headers, [])).toThrow('date column')
  })

  it('throws when no description column found', () => {
    const headers = ['Date', 'Amount']
    expect(() => detectFormat(headers, [])).toThrow('description column')
  })

  it('detects DMY order from sample rows with day > 12', () => {
    const rows = [{ Date: '15/01/2024', Description: 'Test', Amount: '10' }]
    const mapping = detectFormat(['Date', 'Description', 'Amount'], rows)
    expect(mapping.dateOrder).toBe('dmy')
  })

  it('defaults to MDY order when all values ≤ 12 (ambiguous)', () => {
    const rows = [{ Date: '01/02/2024', Description: 'Test', Amount: '10' }]
    const mapping = detectFormat(['Date', 'Description', 'Amount'], rows)
    expect(mapping.dateOrder).toBe('mdy')
  })
})

// ─── detectDateOrder ─────────────────────────────────────────────────────────

describe('detectDateOrder', () => {
  it('detects DMY when first token > 12', () => {
    expect(detectDateOrder(['15/01/2024', '20/02/2024'])).toBe('dmy')
  })

  it('detects MDY when second token > 12', () => {
    expect(detectDateOrder(['01/15/2024', '02/20/2024'])).toBe('mdy')
  })

  it('defaults to MDY for ambiguous dates (all ≤ 12)', () => {
    expect(detectDateOrder(['01/02/2024', '03/04/2024'])).toBe('mdy')
  })

  it('returns MDY for empty input', () => {
    expect(detectDateOrder([])).toBe('mdy')
  })

  it('ignores ISO dates and returns MDY by default', () => {
    expect(detectDateOrder(['2024-01-15', '2024-03-20'])).toBe('mdy')
  })

  it('detects DMY from a mixed set where one date has day > 12', () => {
    expect(detectDateOrder(['01/02/2024', '25/03/2024'])).toBe('dmy')
  })
})

// ─── parseDate ───────────────────────────────────────────────────────────────

describe('parseDate', () => {
  it('parses ISO format', () => {
    const d = parseDate('2024-03-15')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2) // March = 2
    expect(d.getDate()).toBe(15)
  })

  it('parses MM/DD/YYYY (mdy default)', () => {
    const d = parseDate('03/15/2024')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(15)
  })

  it('parses MM/DD/YY', () => {
    const d = parseDate('03/15/24')
    expect(d.getFullYear()).toBe(2024)
  })

  it('parses DD/MM/YYYY when dateOrder is dmy', () => {
    const d = parseDate('15/03/2024', 'dmy')
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2) // March
    expect(d.getDate()).toBe(15)
  })

  it('parses natural date string', () => {
    const d = parseDate('Mar 15, 2024')
    expect(d.getFullYear()).toBe(2024)
  })

  it('throws on unparseable date', () => {
    expect(() => parseDate('not-a-date')).toThrow()
  })
})

// ─── parseTransactions ───────────────────────────────────────────────────────

describe('parseTransactions', () => {
  it('parses Chase-style transactions', () => {
    const rows = [
      { 'Transaction Date': '01/15/2024', Description: 'AMAZON.COM*2K7', Amount: '42.99', Type: 'Sale' },
      { 'Transaction Date': '01/14/2024', Description: 'DIRECT DEPOSIT EMPLOYER', Amount: '-3500.00', Type: 'Payment' },
    ]
    const mapping = detectFormat(
      ['Transaction Date', 'Description', 'Amount', 'Type'],
      rows,
    )
    const { transactions: txns } = parseTransactions('chase.csv', rows, mapping)
    expect(txns).toHaveLength(2)
    expect(txns[0].description).toBe('AMAZON.COM*2K7')
    expect(txns[0].amount).toBe(42.99)
    expect(txns[0].type).toBe('debit')
    expect(txns[1].type).toBe('credit')
    expect(txns[1].amount).toBe(3500)
  })

  it('parses separate debit/credit columns', () => {
    const rows = [
      { Date: '2024-01-15', Description: 'Grocery Store', Debit: '87.54', Credit: '' },
      { Date: '2024-01-10', Description: 'Payroll', Debit: '', Credit: '2500.00' },
    ]
    const mapping = detectFormat(
      ['Date', 'Description', 'Debit', 'Credit'],
      rows,
    )
    const { transactions: txns } = parseTransactions('credit-union.csv', rows, mapping)
    expect(txns).toHaveLength(2)
    expect(txns[0].type).toBe('debit')
    expect(txns[0].amount).toBe(87.54)
    expect(txns[1].type).toBe('credit')
    expect(txns[1].amount).toBe(2500)
  })

  it('auto-detects DD/MM/YYYY and parses dates correctly', () => {
    const rows = [
      { Date: '15/01/2024', Description: 'Supermarket', Amount: '54.20' },
      { Date: '20/01/2024', Description: 'Petrol', Amount: '30.00' },
    ]
    const mapping = detectFormat(['Date', 'Description', 'Amount'], rows)
    expect(mapping.dateOrder).toBe('dmy')
    const { transactions: txns } = parseTransactions('uk-bank.csv', rows, mapping)
    expect(txns[0].date.getMonth()).toBe(0)  // January
    expect(txns[0].date.getDate()).toBe(15)
  })

  it('skips rows with missing date or description', () => {
    const rows = [
      { Date: '', Description: 'Valid', Amount: '10.00' },
      { Date: '2024-01-01', Description: '', Amount: '10.00' },
      { Date: '2024-01-01', Description: 'Valid', Amount: '10.00' },
    ]
    const mapping = detectFormat(['Date', 'Description', 'Amount'], rows)
    const { transactions: txns } = parseTransactions('test.csv', rows, mapping)
    expect(txns).toHaveLength(1)
  })

  it('handles amount with currency symbols and commas', () => {
    const rows = [
      { Date: '2024-01-01', Description: 'Rent', Amount: '$1,500.00' },
    ]
    const mapping = detectFormat(['Date', 'Description', 'Amount'], rows)
    const { transactions: txns } = parseTransactions('test.csv', rows, mapping)
    expect(txns[0].amount).toBe(1500)
  })

  it('handles parenthetical negative amounts', () => {
    const rows = [
      { Date: '2024-01-01', Description: 'Refund', Amount: '(25.00)' },
    ]
    const mapping = detectFormat(['Date', 'Description', 'Amount'], rows)
    const { transactions: txns } = parseTransactions('test.csv', rows, mapping)
    expect(txns[0].amount).toBe(25)
    expect(txns[0].type).toBe('credit')
  })
})
