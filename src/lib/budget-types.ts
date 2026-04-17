/**
 * Core data model for the budget feature.
 * All types are flat and serializable — no Date objects, no Transaction references.
 * This allows clean round-tripping through CSV export/import and localStorage.
 */

/** How predictable and controllable an expense line is */
export type BudgetLineType =
  | 'fixed'                 // subscription or rent — same amount every period
  | 'variable-predictable'  // recurring bill with moderate variance (electric, gas)
  | 'variable-discretionary'// spending category without a fixed pattern (groceries, dining)
  | 'one-time'              // detected outlier — noted but not included in monthly total

/** A single income or expense line in the budget */
export interface BudgetLine {
  /** Spending category name (e.g., "Dining") or specific merchant for fixed items (e.g., "Netflix") */
  category: string
  /** Normalized merchant name — set for fixed/variable-predictable recurring items */
  merchant?: string
  type: BudgetLineType
  /** Monthly budgeted amount in dollars (positive). Zero for one-time lines. */
  amount: number
  /** User-editable notes — preserved through CSV export/import and localStorage */
  notes: string
}

/** A complete budget document */
export interface Budget {
  /** Stable identifier, timestamp-based (e.g., "budget-1713100800000") */
  id: string
  /** Human-readable name (e.g., "Jan–Mar 2026 Budget") */
  name: string
  /** ISO date string of when this budget was generated or last saved */
  generatedAt: string
  /** Date range of source transactions used to generate this budget */
  sourceRange: { start: string; end: string }
  /** Income line items */
  income: BudgetLine[]
  /** Expense line items */
  expenses: BudgetLine[]
  /** Sum of income line amounts */
  totalIncome: number
  /** Sum of expense line amounts */
  totalExpenses: number
}

/** Output of recurring detection for a single merchant */
export interface RecurringMerchant {
  /** Normalized merchant name */
  merchant: string
  /** Most common category among this merchant's transactions */
  category: string
  cadence: 'weekly' | 'monthly' | 'quarterly'
  type: 'fixed' | 'variable-predictable'
  /** Mean transaction amount across all occurrences */
  averageAmount: number
  /** Amount of the most recent transaction */
  lastAmount: number
  /** Number of transactions detected */
  transactionCount: number
}

/** A single row in the budget vs. actual comparison */
export interface BudgetComparison {
  category: string
  type: BudgetLineType
  budgeted: number
  /** Monthly-normalized actual (total ÷ number of months in the viewed date range) */
  actual: number
  /** budgeted - actual (positive = under budget / good for expenses) */
  difference: number
  /** actual / budgeted × 100; Infinity when budgeted is 0 */
  percentUsed: number
  section: 'income' | 'expenses'
  /** Mean monthly spend/income across all loaded history (undefined if <2 months of data) */
  avgPerMonth?: number
}

/** Aggregated result from compareBudgetToActual */
export interface BudgetComparisonResult {
  lines: BudgetComparison[]
  totalBudgetedIncome: number
  totalActualIncome: number
  totalBudgetedExpenses: number
  totalActualExpenses: number
  /** totalBudgetedIncome - totalBudgetedExpenses */
  netBudgeted: number
  /** totalActualIncome - totalActualExpenses */
  netActual: number
}
