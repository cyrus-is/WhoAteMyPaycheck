import type { Transaction } from './types'
import type { RecurringMerchant } from './budget-types'
import { normalizeVendorName } from './normalize'

/** Minimum occurrences for a merchant to be considered recurring */
const MIN_OCCURRENCES = 3

/**
 * Cadence windows (in days): [low, high] for mean interval, max stddev.
 *
 * Windows are intentionally non-overlapping with gaps (8→25, 35→85) so any
 * given mean interval matches at most one cadence. Widening a window into
 * a gap creates ambiguous classifications — e.g. a 20-day mean would match
 * both weekly and monthly. Narrow within a window if needed; do not bridge.
 */
const CADENCE_WINDOWS = [
  { cadence: 'weekly',    min: 6,   max: 8,  maxStddev: 2  },
  { cadence: 'monthly',   min: 25,  max: 35, maxStddev: 5  },
  { cadence: 'quarterly', min: 85,  max: 95, maxStddev: 10 },
] as const

/** CV thresholds for fixed vs variable-predictable classification */
const CV_FIXED = 0.05       // < 5%: amount barely changes — treat as fixed
const CV_VARIABLE = 0.30    // < 30%: recurring with moderate variance

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Days between two Date objects */
function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Detect recurring expense merchants from a list of categorized transactions.
 *
 * Only debit transactions are considered (credits are income or refunds).
 * A merchant must have ≥3 occurrences with a detectable weekly, monthly, or
 * quarterly cadence to appear in the output.
 */
export function detectRecurring(transactions: Transaction[]): RecurringMerchant[] {
  // Group debit transactions by normalized merchant name
  const byMerchant = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.type !== 'debit') continue
    if (tx.category === 'Transfer') continue   // internal transfers aren't expenses
    const merchant = normalizeVendorName(tx.description)
    if (!byMerchant.has(merchant)) byMerchant.set(merchant, [])
    byMerchant.get(merchant)!.push(tx)
  }

  const results: RecurringMerchant[] = []

  for (const [merchant, txns] of byMerchant) {
    if (txns.length < MIN_OCCURRENCES) continue

    // Sort by date ascending
    const sorted = [...txns].sort((a, b) => a.date.getTime() - b.date.getTime())

    // Compute day intervals between consecutive transactions
    const intervals: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1].date, sorted[i].date))
    }

    const meanInterval = mean(intervals)
    const stddevInterval = stddev(intervals, meanInterval)

    // Find matching cadence window
    const window = CADENCE_WINDOWS.find(
      (w) => meanInterval >= w.min && meanInterval <= w.max && stddevInterval <= w.maxStddev,
    )
    if (!window) continue

    // Compute amount statistics
    const amounts = sorted.map((tx) => tx.amount)
    const avgAmount = mean(amounts)
    const cv = avgAmount > 0 ? stddev(amounts, avgAmount) / avgAmount : 1

    if (cv >= CV_VARIABLE) continue  // too variable — not reliably predictable

    const type = cv < CV_FIXED ? 'fixed' : 'variable-predictable'

    // Most common category among this merchant's transactions
    const categoryCounts = new Map<string, number>()
    for (const tx of sorted) {
      categoryCounts.set(tx.category, (categoryCounts.get(tx.category) ?? 0) + 1)
    }
    const category = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]

    results.push({
      merchant,
      category,
      cadence: window.cadence,
      type,
      averageAmount: avgAmount,
      lastAmount: sorted[sorted.length - 1].amount,
      transactionCount: sorted.length,
    })
  }

  return results
}
