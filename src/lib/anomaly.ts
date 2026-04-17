import type { Transaction } from './types'
import { EXPENSE_CATEGORIES } from './types'
import type { DateRange } from '../components/DateFilter'

export interface AnomalyResult {
  category: string
  direction: 'above' | 'below'
  /** Absolute percent change vs historical average, rounded to nearest integer */
  percentChange: number
  currentPerMonth: number
  historicalAvg: number
}

/** Returns YYYY-MM string for a given Date */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Number of calendar months (fractional) spanned by a date range.
 * Used to normalize a period total to a per-month rate.
 */
function monthsInRange(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T23:59:59')
  const days = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24) + 1
  return Math.max(days / 30.44, 1 / 30.44)
}

/**
 * Detect spending anomalies by comparing the current filtered period
 * (per-month normalized) against the historical monthly average across all
 * loaded transactions.
 *
 * Requirements before a category is flagged:
 * - At least MIN_HISTORY_MONTHS distinct months of historical data
 * - Change of at least THRESHOLD_PCT vs average
 * - Expense category only (no income, transfers)
 */
export function detectAnomalies(
  allTransactions: Transaction[],
  filteredTransactions: Transaction[],
  dateRange: DateRange,
  overrides: Record<string, string>,
  threshold = 0.15,
  minHistoryMonths = 2,
): AnomalyResult[] {
  if (!dateRange.start || !dateRange.end) return []

  const resolveCategory = (tx: Transaction) => overrides[tx.id] ?? tx.category

  // --- Historical averages from ALL transactions ---
  // monthlyTotals[category][YYYY-MM] = sum of expenses in that month
  const monthlyTotals: Record<string, Record<string, number>> = {}

  for (const tx of allTransactions) {
    const cat = resolveCategory(tx)
    if (!EXPENSE_CATEGORIES.has(cat)) continue
    if (tx.amount <= 0) continue
    const mk = monthKey(tx.date)
    if (!monthlyTotals[cat]) monthlyTotals[cat] = {}
    monthlyTotals[cat][mk] = (monthlyTotals[cat][mk] ?? 0) + tx.amount
  }

  // Compute mean monthly spend per category across all months that had any data
  const historicalAvg: Record<string, number> = {}
  const historicalMonthCount: Record<string, number> = {}
  for (const [cat, byMonth] of Object.entries(monthlyTotals)) {
    const months = Object.values(byMonth)
    historicalMonthCount[cat] = months.length
    historicalAvg[cat] = months.reduce((a, b) => a + b, 0) / months.length
  }

  // --- Current period totals from FILTERED transactions ---
  const currentTotal: Record<string, number> = {}
  for (const tx of filteredTransactions) {
    const cat = resolveCategory(tx)
    if (!EXPENSE_CATEGORIES.has(cat)) continue
    if (tx.amount <= 0) continue
    currentTotal[cat] = (currentTotal[cat] ?? 0) + tx.amount
  }

  const months = monthsInRange(dateRange.start, dateRange.end)

  // --- Compare and flag anomalies ---
  const results: AnomalyResult[] = []
  const categories = new Set([...Object.keys(historicalAvg), ...Object.keys(currentTotal)])

  for (const cat of categories) {
    const avg = historicalAvg[cat] ?? 0
    const histMonths = historicalMonthCount[cat] ?? 0
    if (histMonths < minHistoryMonths) continue
    if (avg === 0) continue

    const current = (currentTotal[cat] ?? 0) / months
    const ratio = (current - avg) / avg

    if (Math.abs(ratio) < threshold) continue

    results.push({
      category: cat,
      direction: ratio > 0 ? 'above' : 'below',
      percentChange: Math.round(Math.abs(ratio) * 100),
      currentPerMonth: current,
      historicalAvg: avg,
    })
  }

  // Sort by magnitude descending
  return results.sort((a, b) => b.percentChange - a.percentChange)
}
