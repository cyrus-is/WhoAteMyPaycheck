import type { Transaction } from './types'
import { EXPENSE_CATEGORIES } from './types'
import type {
  Budget,
  BudgetLine,
  BudgetComparison,
  BudgetComparisonResult,
} from './budget-types'
import { detectRecurring } from './recurring'
import { normalizeVendorName, normalizeSource, isMerchantCredit } from './normalize'

// ── Helpers ────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function stddev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** Parse an ISO date string as a local-time Date (avoids UTC-midnight offset issues) */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Return the number of calendar months (fractional) between two ISO date strings.
 * Minimum 1 month even for partial data.
 */
export function countMonths(start: string, end: string): number {
  const s = parseLocalDate(start)
  const e = parseLocalDate(end)
  const years = e.getFullYear() - s.getFullYear()
  const months = e.getMonth() - s.getMonth()
  const days = e.getDate() - s.getDate()
  const total = years * 12 + months + days / 30
  return Math.max(1, total)
}

/**
 * Group debit transactions by calendar month and return per-month totals.
 * Key format: "YYYY-MM".
 */
function monthlyTotals(transactions: Transaction[]): Map<string, number> {
  const byMonth = new Map<string, number>()
  for (const tx of transactions) {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, '0')}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + tx.amount)
  }
  return byMonth
}

// EXPENSE_CATEGORIES imported from types.ts

// ── Main: budget generation ────────────────────────────────────────────────

/**
 * Generate a monthly budget from a set of categorized transactions.
 *
 * @param transactions  All categorized transactions (should cover ≥1 month)
 * @param sourceRange   The date range represented by the transactions
 * @returns             A Budget document ready for display, editing, and export
 */
export function generateBudget(
  transactions: Transaction[],
  sourceRange: { start: string; end: string },
): Budget {
  const numMonths = countMonths(sourceRange.start, sourceRange.end)

  // ── Income lines ──────────────────────────────────────────────────────────
  // Credits that are NOT refunds (expense-category credits are refunds)
  const incomeTransactions = transactions.filter(
    (tx) => tx.type === 'credit' && !EXPENSE_CATEGORIES.has(tx.category) && tx.category !== 'Transfer',
  )

  // Sources that normalizeSource maps to these labels are not true income
  const NON_INCOME_SOURCES = new Set(['Refunds', 'Peer Transfer'])

  const incomeBySource = new Map<string, number[]>()
  for (const tx of incomeTransactions) {
    const source = normalizeSource(tx.description)
    // Skip refunds and peer transfers
    if (NON_INCOME_SOURCES.has(source)) continue
    // Skip credits from known retail merchants — these are returns/credits, not income
    if (isMerchantCredit(tx.description)) continue
    if (!incomeBySource.has(source)) incomeBySource.set(source, [])
    incomeBySource.get(source)!.push(tx.amount)
  }

  const incomeLines: BudgetLine[] = []
  for (const [source, amounts] of incomeBySource) {
    const avg = mean(amounts)
    const cv = avg > 0 ? stddev(amounts, avg) / avg : 0
    const monthlyAmount = avg * (amounts.length / numMonths)
    incomeLines.push({
      category: source,
      type: cv < 0.1 ? 'fixed' : 'variable-predictable',
      amount: Math.round(monthlyAmount * 100) / 100,
      notes: '',
    })
  }

  // Sort income: fixed first, then by amount desc
  incomeLines.sort((a, b) => {
    if (a.type === 'fixed' && b.type !== 'fixed') return -1
    if (a.type !== 'fixed' && b.type === 'fixed') return 1
    return b.amount - a.amount
  })

  // ── Detect recurring merchants ─────────────────────────────────────────────
  const recurringMerchants = detectRecurring(transactions)
  const recurringMerchantNames = new Set(recurringMerchants.map((r) => r.merchant))

  // ── Expense lines ─────────────────────────────────────────────────────────
  const expenseTransactions = transactions.filter(
    (tx) => tx.type === 'debit' && tx.category !== 'Transfer',
  )

  // Fixed and variable-predictable lines from recurring detection
  const expenseLines: BudgetLine[] = []

  for (const recurring of recurringMerchants) {
    const monthlyAmount =
      recurring.cadence === 'weekly'    ? recurring.averageAmount * 4.33 :
      recurring.cadence === 'quarterly' ? recurring.averageAmount / 3    :
      recurring.averageAmount  // monthly

    expenseLines.push({
      category: recurring.category,
      merchant: recurring.merchant,
      type: recurring.type,
      amount: Math.round(monthlyAmount * 100) / 100,
      notes: '',
    })
  }

  // Category-level variable-discretionary lines:
  // sum transactions NOT already covered by a recurring merchant, group by category
  const remainderByCategory = new Map<string, Transaction[]>()
  for (const tx of expenseTransactions) {
    const merchant = normalizeVendorName(tx.description)
    if (recurringMerchantNames.has(merchant)) continue  // already in recurring lines
    if (!EXPENSE_CATEGORIES.has(tx.category)) continue

    if (!remainderByCategory.has(tx.category)) remainderByCategory.set(tx.category, [])
    remainderByCategory.get(tx.category)!.push(tx)
  }

  // One-time detection: merchants with 1–2 occurrences AND amount > 2× category median
  // We compute the category median first, then flag outliers.
  for (const [category, categoryTxns] of remainderByCategory) {
    // Monthly totals for median calculation
    const monthMap = monthlyTotals(categoryTxns)
    const monthValues = [...monthMap.values()]
    const categoryMedian = median(monthValues)

    // Group remaining txns by merchant to find one-timers
    const byMerchant = new Map<string, Transaction[]>()
    for (const tx of categoryTxns) {
      const m = normalizeVendorName(tx.description)
      if (!byMerchant.has(m)) byMerchant.set(m, [])
      byMerchant.get(m)!.push(tx)
    }

    // Merchants with 1–2 occurrences AND total > 2× category median → one-time
    const oneTimeMerchants = new Set<string>()
    for (const [merchant, merchantTxns] of byMerchant) {
      const total = merchantTxns.reduce((s, tx) => s + tx.amount, 0)
      if (merchantTxns.length <= 2 && total > 2 * categoryMedian && categoryMedian > 0) {
        oneTimeMerchants.add(merchant)
        expenseLines.push({
          category,
          merchant,
          type: 'one-time',
          amount: 0,
          notes: `$${total.toFixed(0)} — excluded from monthly budget`,
        })
      }
    }

    // Budget amount = median of monthly totals of the non-one-time transactions
    const regularTxns = categoryTxns.filter(
      (tx) => !oneTimeMerchants.has(normalizeVendorName(tx.description)),
    )
    if (regularTxns.length === 0) continue

    const regularMonthMap = monthlyTotals(regularTxns)
    const regularMonthValues = [...regularMonthMap.values()]
    const budgetAmount = median(regularMonthValues)
    if (budgetAmount <= 0) continue

    expenseLines.push({
      category,
      type: 'variable-discretionary',
      amount: Math.round(budgetAmount * 100) / 100,
      notes: '',
    })
  }

  // Sort expense lines: fixed → variable-predictable → variable-discretionary → one-time, then by amount desc within type
  const typeOrder: Record<string, number> = {
    'fixed': 0, 'variable-predictable': 1, 'variable-discretionary': 2, 'one-time': 3,
  }
  expenseLines.sort((a, b) => {
    const typeSort = (typeOrder[a.type] ?? 4) - (typeOrder[b.type] ?? 4)
    if (typeSort !== 0) return typeSort
    return b.amount - a.amount
  })

  const totalIncome = incomeLines.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = expenseLines
    .filter((l) => l.type !== 'one-time')
    .reduce((s, l) => s + l.amount, 0)

  // Generate a name from the date range
  const startLabel = formatMonthLabel(sourceRange.start)
  const endLabel = formatMonthLabel(sourceRange.end)
  const name = startLabel === endLabel ? `${startLabel} Budget` : `${startLabel}–${endLabel} Budget`

  return {
    id: `budget-${Date.now()}`,
    name,
    generatedAt: new Date().toISOString().substring(0, 10),
    sourceRange,
    income: incomeLines,
    expenses: expenseLines,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
  }
}

function formatMonthLabel(iso: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [year, month] = iso.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}

// ── Budget vs. Actual comparison ──────────────────────────────────────────

/** Returns YYYY-MM string for a Date */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Compute mean monthly spend per category across all provided transactions. */
function historicalMonthlyAvgByCategory(
  transactions: Transaction[],
  overrides: Record<string, string>,
): Map<string, number> {
  const byMonth = new Map<string, Map<string, number>>()
  for (const tx of transactions) {
    const cat = overrides[tx.id] ?? tx.category
    if (cat === 'Transfer') continue
    const mk = monthKey(tx.date)
    if (!byMonth.has(mk)) byMonth.set(mk, new Map())
    byMonth.get(mk)!.set(cat, (byMonth.get(mk)!.get(cat) ?? 0) + tx.amount)
  }
  const numMonths = byMonth.size
  if (numMonths < 2) return new Map()

  const totals = new Map<string, number>()
  for (const monthly of byMonth.values()) {
    for (const [cat, amt] of monthly) {
      totals.set(cat, (totals.get(cat) ?? 0) + amt)
    }
  }
  const avg = new Map<string, number>()
  for (const [cat, total] of totals) {
    avg.set(cat, total / numMonths)
  }
  return avg
}

/**
 * Compare a budget against actual transactions for a given date range.
 * Actuals are normalized to a per-month rate.
 *
 * @param allTransactions  Full history used to compute historical monthly averages (optional).
 *                         Pass undefined to omit the avgPerMonth column.
 */
export function compareBudgetToActual(
  budget: Budget,
  transactions: Transaction[],
  overrides: Record<string, string>,
  dateRange: { start: string; end: string },
  allTransactions?: Transaction[],
): BudgetComparisonResult {
  const numMonths = countMonths(dateRange.start, dateRange.end)

  // Historical averages from full transaction history (if provided)
  const historicalAvg = allTransactions
    ? historicalMonthlyAvgByCategory(allTransactions, overrides)
    : new Map<string, number>()

  // Apply overrides and filter
  const txns = transactions.map((tx) => ({ ...tx, category: overrides[tx.id] ?? tx.category }))

  // Actual income: credits that aren't refunds or transfers — same filters as generateBudget
  const NON_INCOME_SOURCES = new Set(['Refunds', 'Peer Transfer'])
  const actualIncomeBySource = new Map<string, number>()
  for (const tx of txns) {
    if (tx.type !== 'credit') continue
    if (EXPENSE_CATEGORIES.has(tx.category) || tx.category === 'Transfer') continue
    const source = normalizeSource(tx.description)
    if (NON_INCOME_SOURCES.has(source)) continue
    if (isMerchantCredit(tx.description)) continue
    actualIncomeBySource.set(source, (actualIncomeBySource.get(source) ?? 0) + tx.amount)
  }

  // Actual expenses by category
  const actualExpenseByCategory = new Map<string, number>()
  for (const tx of txns) {
    if (tx.type !== 'debit' || tx.category === 'Transfer') continue
    actualExpenseByCategory.set(tx.category, (actualExpenseByCategory.get(tx.category) ?? 0) + tx.amount)
  }

  const lines: BudgetComparison[] = []

  // Income comparisons
  for (const line of budget.income) {
    const actualTotal = actualIncomeBySource.get(line.category) ?? 0
    const actual = actualTotal / numMonths
    const difference = actual - line.amount  // positive = earned more than budgeted (good)
    const avg = historicalAvg.get(line.category)
    lines.push({
      category: line.category,
      type: line.type,
      budgeted: line.amount,
      actual: Math.round(actual * 100) / 100,
      difference: Math.round(difference * 100) / 100,
      percentUsed: line.amount > 0 ? Math.round((actual / line.amount) * 100) : Infinity,
      section: 'income',
      ...(avg !== undefined ? { avgPerMonth: Math.round(avg * 100) / 100 } : {}),
    })
  }

  // Expense comparisons — aggregate by category for variable-discretionary,
  // use category for fixed/variable-predictable merchant lines too
  const expenseLinesByCategory = new Map<string, BudgetLine[]>()
  for (const line of budget.expenses) {
    if (line.type === 'one-time') continue
    const key = line.category
    if (!expenseLinesByCategory.has(key)) expenseLinesByCategory.set(key, [])
    expenseLinesByCategory.get(key)!.push(line)
  }

  // Collect all unique categories from both budget and actuals
  const allExpenseCategories = new Set([
    ...expenseLinesByCategory.keys(),
    ...actualExpenseByCategory.keys(),
  ])

  for (const category of allExpenseCategories) {
    if (category === 'Transfer') continue
    const budgetedLines = expenseLinesByCategory.get(category) ?? []
    const budgeted = budgetedLines.reduce((s, l) => s + l.amount, 0)
    const actualTotal = actualExpenseByCategory.get(category) ?? 0
    const actual = actualTotal / numMonths
    const difference = budgeted - actual  // positive = under budget (good for expenses)

    // Use the most specific type for display
    const type = budgetedLines[0]?.type ?? 'variable-discretionary'
    const avg = historicalAvg.get(category)

    lines.push({
      category,
      type,
      budgeted: Math.round(budgeted * 100) / 100,
      actual: Math.round(actual * 100) / 100,
      difference: Math.round(difference * 100) / 100,
      percentUsed: budgeted > 0 ? Math.round((actual / budgeted) * 100) : Infinity,
      section: 'expenses',
      ...(avg !== undefined ? { avgPerMonth: Math.round(avg * 100) / 100 } : {}),
    })
  }

  const incomeLines = lines.filter((l) => l.section === 'income')
  const expenseLines = lines.filter((l) => l.section === 'expenses')

  const totalBudgetedIncome = incomeLines.reduce((s, l) => s + l.budgeted, 0)
  const totalActualIncome = incomeLines.reduce((s, l) => s + l.actual, 0)
  const totalBudgetedExpenses = expenseLines.reduce((s, l) => s + l.budgeted, 0)
  const totalActualExpenses = expenseLines.reduce((s, l) => s + l.actual, 0)

  return {
    lines,
    totalBudgetedIncome: Math.round(totalBudgetedIncome * 100) / 100,
    totalActualIncome: Math.round(totalActualIncome * 100) / 100,
    totalBudgetedExpenses: Math.round(totalBudgetedExpenses * 100) / 100,
    totalActualExpenses: Math.round(totalActualExpenses * 100) / 100,
    netBudgeted: Math.round((totalBudgetedIncome - totalBudgetedExpenses) * 100) / 100,
    netActual: Math.round((totalActualIncome - totalActualExpenses) * 100) / 100,
  }
}
