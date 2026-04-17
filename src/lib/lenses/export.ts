import type { Transaction } from '../types'
import type { TaxResult, TaxArea } from './types'
import { TAX_AREAS } from './types'

/** Prevent spreadsheet formula injection: prefix dangerous-start characters with a space. */
function sanitizeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? ` ${value}` : value
}

/** Pure: build a CSV string of tax-categorized transactions for a CPA. */
export function buildTaxCSV(
  transactions: Transaction[],
  taxResults: TaxResult[],
  taxOverrides: Record<string, TaxArea>,
): string {
  const resultMap = new Map(taxResults.map((r) => [r.id, r]))
  // CPA export uses IRS form references, not friendly UI labels
  const areaLabels = Object.fromEntries(TAX_AREAS.map((a) => [a.id, a.irsRef]))

  const rows: string[][] = []
  rows.push(['Tax Area', 'Date', 'Vendor', 'Description', 'Amount'])

  const byArea = new Map<TaxArea, Transaction[]>()
  for (const area of TAX_AREAS) byArea.set(area.id, [])

  for (const tx of transactions) {
    const area: TaxArea = taxOverrides[tx.id] ?? resultMap.get(tx.id)?.taxArea ?? 'non-deductible'
    byArea.get(area)!.push(tx)
  }

  for (const areaId of TAX_AREAS.map((a) => a.id)) {
    const txns = (byArea.get(areaId) ?? []).slice().sort((a, b) => a.date.getTime() - b.date.getTime())
    for (const tx of txns) {
      rows.push([
        areaLabels[areaId] ?? areaId,
        tx.date.toISOString().substring(0, 10),
        tx.description.substring(0, 50),
        tx.description,
        tx.amount.toFixed(2),
      ])
    }
  }

  return rows
    .map((row) => row.map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

/** Trigger a browser CSV download of tax-categorized transactions for a CPA. */
export function exportTaxCSV(
  transactions: Transaction[],
  taxResults: TaxResult[],
  taxOverrides: Record<string, TaxArea>,
): void {
  const csv = buildTaxCSV(transactions, taxResults, taxOverrides)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'tax-export.csv'
  a.click()
  URL.revokeObjectURL(url)
}
