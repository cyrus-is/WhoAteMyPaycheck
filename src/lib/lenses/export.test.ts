import { describe, it, expect } from 'vitest'
import { buildTaxCSV } from './export'
import type { Transaction } from '../types'
import type { TaxResult } from './types'

function makeTx(id: string, description: string, amount = 50): Transaction {
  return {
    id,
    date: new Date('2024-03-15'),
    description,
    amount,
    type: 'debit',
    category: 'Shopping',
    subcategory: '',
    sourceFile: 'test.csv',
  }
}

describe('buildTaxCSV', () => {
  it('includes header row', () => {
    const csv = buildTaxCSV([], [], {})
    expect(csv).toContain('"Tax Area"')
    expect(csv).toContain('"Date"')
    expect(csv).toContain('"Vendor"')
    expect(csv).toContain('"Amount"')
  })

  it('places transaction in correct tax area', () => {
    const txns = [makeTx('tx-1', 'RED CROSS DONATION', 100)]
    const results: TaxResult[] = [{ id: 'tx-1', taxArea: 'schedule-a', ambiguous: false }]
    const csv = buildTaxCSV(txns, results, {})
    expect(csv).toContain('"Schedule A"')
    expect(csv).toContain('"100.00"')
  })

  it('uses override over API result', () => {
    const txns = [makeTx('tx-1', 'AMAZON PURCHASE')]
    const results: TaxResult[] = [{ id: 'tx-1', taxArea: 'non-deductible', ambiguous: true }]
    const csv = buildTaxCSV(txns, results, { 'tx-1': 'schedule-c' })
    expect(csv).toContain('"Schedule C"')
    expect(csv).not.toContain('"Non-Deductible"')
  })

  it('falls back to non-deductible for transactions not in results', () => {
    const txns = [makeTx('tx-1', 'UNKNOWN')]
    const csv = buildTaxCSV(txns, [], {})
    expect(csv).toContain('"Non-Deductible"')
  })

  it('handles empty transaction list', () => {
    const csv = buildTaxCSV([], [], {})
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1) // only header
  })

  it('escapes double quotes in cell values', () => {
    const txns = [makeTx('tx-1', 'VENDOR "QUOTED"')]
    const results: TaxResult[] = [{ id: 'tx-1', taxArea: 'non-deductible', ambiguous: false }]
    const csv = buildTaxCSV(txns, results, {})
    expect(csv).toContain('""QUOTED""')
  })

  it('sanitizes formula injection prefixes in cell values', () => {
    const txns = [
      makeTx('tx-1', '=HYPERLINK("evil.com","click")'),
      makeTx('tx-2', '+cmd|calc'),
      makeTx('tx-3', '-2+3'),
      makeTx('tx-4', '@SUM(A1:A10)'),
    ]
    const results: TaxResult[] = txns.map((t) => ({ id: t.id, taxArea: 'non-deductible' as const, ambiguous: false }))
    const csv = buildTaxCSV(txns, results, {})
    expect(csv).not.toContain('"=HYPERLINK')
    expect(csv).not.toContain('"+cmd')
    expect(csv).not.toContain('"-2+3')
    expect(csv).not.toContain('"@SUM')
    expect(csv).toContain('" =HYPERLINK')
    expect(csv).toContain('" +cmd')
  })

  it('sorts transactions within each tax area by date', () => {
    const txns = [
      { ...makeTx('tx-1', 'MARCH TX'), date: new Date('2024-03-15') },
      { ...makeTx('tx-2', 'JAN TX'), date: new Date('2024-01-05') },
    ]
    const results: TaxResult[] = [
      { id: 'tx-1', taxArea: 'schedule-a', ambiguous: false },
      { id: 'tx-2', taxArea: 'schedule-a', ambiguous: false },
    ]
    const csv = buildTaxCSV(txns, results, {})
    const janIdx = csv.indexOf('JAN TX')
    const marIdx = csv.indexOf('MARCH TX')
    expect(janIdx).toBeLessThan(marIdx)
  })

  it('includes both Schedule A and Schedule C sections', () => {
    const txns = [
      makeTx('tx-1', 'RED CROSS'),
      makeTx('tx-2', 'OFFICE SUPPLIES'),
    ]
    const results: TaxResult[] = [
      { id: 'tx-1', taxArea: 'schedule-a', ambiguous: false },
      { id: 'tx-2', taxArea: 'schedule-c', ambiguous: false },
    ]
    const csv = buildTaxCSV(txns, results, {})
    expect(csv).toContain('"Schedule A"')
    expect(csv).toContain('"Schedule C"')
  })
})
