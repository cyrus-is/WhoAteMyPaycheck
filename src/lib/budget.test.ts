import { describe, it, expect } from 'vitest'
import { generateBudget, compareBudgetToActual, countMonths } from './budget'
import type { Transaction } from './types'

let idSeq = 0
function makeTx(overrides: Partial<Transaction> & { date: Date }): Transaction {
  return {
    id: `tx-${++idSeq}`,
    description: 'TEST MERCHANT',
    amount: 100,
    type: 'debit',
    category: 'Shopping',
    subcategory: '',
    sourceFile: 'test.csv',
    ...overrides,
  }
}

/** Create n transactions spaced intervalDays apart */
function series(
  overrides: Partial<Transaction> & { date: Date },
  count: number,
  intervalDays = 30,
): Transaction[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(overrides.date)
    date.setDate(date.getDate() + i * intervalDays)
    return makeTx({ ...overrides, date, id: `tx-${++idSeq}` })
  })
}

// ── countMonths ─────────────────────────────────────────────────────────────

describe('countMonths', () => {
  it('returns 1 for same month', () => {
    expect(countMonths('2024-01-01', '2024-01-31')).toBeCloseTo(1, 0)
  })

  it('returns ~3 for 3-month range', () => {
    expect(countMonths('2024-01-01', '2024-04-01')).toBeCloseTo(3, 0)
  })

  it('returns minimum of 1 for very short ranges', () => {
    expect(countMonths('2024-01-01', '2024-01-05')).toBe(1)
  })
})

// ── generateBudget ───────────────────────────────────────────────────────────

describe('generateBudget', () => {
  it('generates income lines from credit transactions', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'ACME CORP PAYROLL', amount: 5000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
      makeTx({ description: 'ACME CORP PAYROLL', amount: 5000, type: 'credit', category: 'Income', date: new Date('2024-02-15') }),
      makeTx({ description: 'ACME CORP PAYROLL', amount: 5000, type: 'credit', category: 'Income', date: new Date('2024-03-15') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })
    const salaryLine = budget.income.find((l) => l.category === 'Salary')
    expect(salaryLine).toBeDefined()
    expect(salaryLine!.type).toBe('fixed')
    expect(salaryLine!.amount).toBeGreaterThan(0)
  })

  it('excludes Refunds and Peer Transfer credits from income', () => {
    const txns: Transaction[] = [
      // True income
      makeTx({ description: 'ACME PAYROLL', amount: 5000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
      // Refund — normalizeSource identifies as 'Refunds'
      makeTx({ description: 'AMAZON REFUND', amount: 25, type: 'credit', category: 'Income', date: new Date('2024-01-20') }),
      // Peer transfer — normalizeSource identifies as 'Peer Transfer'
      makeTx({ description: 'VENMO PAYMENT FROM FRIEND', amount: 50, type: 'credit', category: 'Income', date: new Date('2024-01-22') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })
    const incomeSources = budget.income.map((l) => l.category)
    expect(incomeSources).not.toContain('Refunds')
    expect(incomeSources).not.toContain('Peer Transfer')
    // True income still present
    expect(budget.income.length).toBeGreaterThan(0)
  })

  it('excludes known merchant credits from income (returns/refunds mislabeled as Income)', () => {
    const txns: Transaction[] = [
      // True income
      makeTx({ description: 'DIRECT DEPOSIT SALARY', amount: 4000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
      // Amazon credit — likely a return, should NOT appear as income
      makeTx({ description: 'AMAZON.COM', amount: 30, type: 'credit', category: 'Income', date: new Date('2024-01-18') }),
      // Tesco credit — supermarket return, should NOT appear as income
      makeTx({ description: 'TESCO STORES', amount: 12, type: 'credit', category: 'Income', date: new Date('2024-01-19') }),
      // Generic "Restaurant" description (UK bank clean names) — not income
      makeTx({ description: 'Restaurant', amount: 16, type: 'credit', category: 'Income', date: new Date('2024-01-20') }),
      // M&S alone (UK bank abbreviation) — not income
      makeTx({ description: 'M&S', amount: 10, type: 'credit', category: 'Income', date: new Date('2024-01-21') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })
    const incomeSources = budget.income.map((l) => l.category)
    expect(incomeSources).not.toContain('Amazon')
    expect(incomeSources).not.toContain('Tesco')
    expect(incomeSources).not.toContain('Restaurant')
    expect(incomeSources).not.toContain('M&S')
    expect(incomeSources).not.toContain('Marks & Spencer')
    // Salary still present
    expect(incomeSources).toContain('Salary')
  })

  it('excludes Transfer-category debits from recurring detection', () => {
    // Savings transfer happens monthly — should NOT appear as a fixed expense
    const txns: Transaction[] = [
      ...series({ description: 'TRANSFER TO SAVINGS', amount: 500, category: 'Transfer', date: new Date('2024-01-01') }, 3),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })
    const transferLine = budget.expenses.find((l) => l.category === 'Transfer')
    expect(transferLine).toBeUndefined()
    // Also check no recurring merchant for it
    const savingsLine = budget.expenses.find((l) => l.merchant?.toLowerCase().includes('savings'))
    expect(savingsLine).toBeUndefined()
  })

  it('generates fixed expense lines from recurring merchants', () => {
    const txns: Transaction[] = [
      ...series({ description: 'NETFLIX.COM', amount: 15.99, category: 'Subscriptions', date: new Date('2024-01-10') }, 3),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })
    const netflixLine = budget.expenses.find((l) => l.merchant === 'Netflix')
    expect(netflixLine).toBeDefined()
    expect(netflixLine!.type).toBe('fixed')
    expect(netflixLine!.amount).toBeCloseTo(15.99, 1)
  })

  it('generates variable-discretionary lines for non-recurring category spend', () => {
    // Irregular grocery shopping — different amounts each month, not recurring by merchant
    const txns: Transaction[] = [
      makeTx({ description: 'LOCAL GROCERY', amount: 200, category: 'Groceries', date: new Date('2024-01-05') }),
      makeTx({ description: 'LOCAL GROCERY', amount: 180, category: 'Groceries', date: new Date('2024-01-20') }),
      makeTx({ description: 'CORNER MARKET', amount: 150, category: 'Groceries', date: new Date('2024-02-10') }),
      makeTx({ description: 'LOCAL GROCERY', amount: 220, category: 'Groceries', date: new Date('2024-03-08') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })
    const groceryLine = budget.expenses.find((l) => l.category === 'Groceries' && l.type === 'variable-discretionary')
    expect(groceryLine).toBeDefined()
    expect(groceryLine!.amount).toBeGreaterThan(0)
  })

  it('excludes Transfer category from expenses', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'TRANSFER TO SAVINGS', amount: 1000, category: 'Transfer', date: new Date('2024-01-15') }),
      makeTx({ description: 'LOCAL STORE', amount: 50, category: 'Shopping', date: new Date('2024-01-20') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })
    const transferLine = budget.expenses.find((l) => l.category === 'Transfer')
    expect(transferLine).toBeUndefined()
  })

  it('excludes Transfer category from income', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'TRANSFER FROM CHECKING', amount: 500, type: 'credit', category: 'Transfer', date: new Date('2024-01-10') }),
      makeTx({ description: 'DIRECT DEPOSIT', amount: 3000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })
    const transferLine = budget.income.find((l) => l.category === 'Transfer')
    expect(transferLine).toBeUndefined()
  })

  it('marks one-time expenses with amount 0 and a note', () => {
    // Use different stores each month so they don't trigger recurring detection.
    // Irregular intervals: no merchant appears 3+ times → none are "recurring".
    // Monthly totals: Jan $180, Feb $210, Mar $190 → median ≈ $190.
    // One-time purchase: $900 > 2×190 in Feb → flagged as one-time.
    const txns: Transaction[] = [
      makeTx({ description: 'GROCERY A', amount: 180, category: 'Groceries', date: new Date('2024-01-08') }),
      makeTx({ description: 'GROCERY B', amount: 210, category: 'Groceries', date: new Date('2024-02-12') }),
      makeTx({ description: 'GROCERY C', amount: 190, category: 'Groceries', date: new Date('2024-03-07') }),
      // One-time big purchase in February
      makeTx({ description: 'FANCY CATERER', amount: 900, category: 'Groceries', date: new Date('2024-02-20') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })
    const oneTimeLine = budget.expenses.find((l) => l.type === 'one-time')
    expect(oneTimeLine).toBeDefined()
    expect(oneTimeLine!.amount).toBe(0)
    expect(oneTimeLine!.notes).toContain('excluded from monthly budget')
  })

  it('expense lines sorted: fixed → variable-predictable → variable-discretionary → one-time', () => {
    const txns: Transaction[] = [
      // Fixed (recurring Netflix)
      ...series({ description: 'NETFLIX.COM', amount: 15.99, category: 'Subscriptions', date: new Date('2024-01-10') }, 3),
      // Variable-discretionary (irregular grocery)
      makeTx({ description: 'STORE A', amount: 100, category: 'Groceries', date: new Date('2024-01-15') }),
      makeTx({ description: 'STORE B', amount: 120, category: 'Groceries', date: new Date('2024-02-15') }),
      makeTx({ description: 'STORE C', amount: 90, category: 'Groceries', date: new Date('2024-03-15') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })

    const typeOrder: Record<string, number> = {
      'fixed': 0, 'variable-predictable': 1, 'variable-discretionary': 2, 'one-time': 3,
    }
    for (let i = 1; i < budget.expenses.length; i++) {
      const prevOrder = typeOrder[budget.expenses[i - 1].type] ?? 4
      const currOrder = typeOrder[budget.expenses[i].type] ?? 4
      expect(prevOrder).toBeLessThanOrEqual(currOrder)
    }
  })

  it('totalIncome and totalExpenses are computed correctly', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'PAYROLL', amount: 3000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
      makeTx({ description: 'LOCAL STORE', amount: 200, category: 'Shopping', date: new Date('2024-01-20') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })
    expect(budget.totalIncome).toBeGreaterThan(0)
    expect(budget.totalExpenses).toBeGreaterThan(0)
    expect(budget.totalIncome).toBe(budget.income.reduce((s, l) => s + l.amount, 0))
    expect(budget.totalExpenses).toBe(
      budget.expenses.filter((l) => l.type !== 'one-time').reduce((s, l) => s + l.amount, 0),
    )
  })

  it('budget name reflects the source date range', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'PAYROLL', amount: 3000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-03-31' })
    expect(budget.name).toContain('Jan')
    expect(budget.name).toContain('Mar')
    expect(budget.name).toContain('2024')
  })

  it('returns empty income and expenses arrays for empty transactions', () => {
    const budget = generateBudget([], { start: '2024-01-01', end: '2024-01-31' })
    expect(budget.income).toEqual([])
    expect(budget.expenses).toEqual([])
    expect(budget.totalIncome).toBe(0)
    expect(budget.totalExpenses).toBe(0)
  })
})

// ── compareBudgetToActual ────────────────────────────────────────────────────

describe('compareBudgetToActual', () => {
  it('computes per-month actual amounts', () => {
    // 2 months of data, $400 total groceries → $200/month actual
    const txns: Transaction[] = [
      makeTx({ description: 'STORE', amount: 200, category: 'Groceries', date: new Date('2024-01-15') }),
      makeTx({ description: 'STORE', amount: 200, category: 'Groceries', date: new Date('2024-02-15') }),
    ]

    // Build a minimal budget with a Groceries expense line
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-02-28' })

    const result = compareBudgetToActual(budget, txns, {}, { start: '2024-01-01', end: '2024-02-28' })
    const groceryLine = result.lines.find((l) => l.category === 'Groceries' && l.section === 'expenses')
    expect(groceryLine).toBeDefined()
    // $400 / ~1.9 months ≈ 210; allow a wider window since countMonths uses days/30 proration
    expect(groceryLine!.actual).toBeGreaterThan(195)
    expect(groceryLine!.actual).toBeLessThan(225)
  })

  it('applies category overrides before computing actuals', () => {
    const tx = makeTx({ description: 'SOME STORE', amount: 100, category: 'Shopping', date: new Date('2024-01-10') })
    const budget = generateBudget([tx], { start: '2024-01-01', end: '2024-01-31' })

    // Override the transaction from Shopping → Dining
    const result = compareBudgetToActual(budget, [tx], { [tx.id]: 'Dining' }, { start: '2024-01-01', end: '2024-01-31' })

    const shoppingLine = result.lines.find((l) => l.category === 'Shopping' && l.section === 'expenses')
    const diningLine = result.lines.find((l) => l.category === 'Dining' && l.section === 'expenses')

    // Shopping should have 0 actual (overridden away)
    if (shoppingLine) {
      expect(shoppingLine.actual).toBe(0)
    }
    // Dining should have the $100
    expect(diningLine).toBeDefined()
    expect(diningLine!.actual).toBeCloseTo(100, 0)
  })

  it('difference is positive for income when actual > budgeted', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'ACME CORP PAYROLL', amount: 5000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })

    // Actual is higher than budget
    const moreTxns: Transaction[] = [
      makeTx({ description: 'ACME CORP PAYROLL', amount: 6000, type: 'credit', category: 'Income', date: new Date('2024-02-15') }),
    ]
    const result = compareBudgetToActual(budget, moreTxns, {}, { start: '2024-02-01', end: '2024-02-28' })
    const salaryLine = result.lines.find((l) => l.section === 'income')
    expect(salaryLine).toBeDefined()
    // difference = actual - budgeted; positive means earned more (good)
    expect(salaryLine!.difference).toBeGreaterThan(0)
  })

  it('difference is positive for expenses when under budget', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'STORE', amount: 300, category: 'Groceries', date: new Date('2024-01-15') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })

    // Spend less than budgeted
    const actualTxns: Transaction[] = [
      makeTx({ description: 'STORE', amount: 100, category: 'Groceries', date: new Date('2024-02-15') }),
    ]
    const result = compareBudgetToActual(budget, actualTxns, {}, { start: '2024-02-01', end: '2024-02-28' })
    const groceryLine = result.lines.find((l) => l.category === 'Groceries' && l.section === 'expenses')
    expect(groceryLine).toBeDefined()
    // difference = budgeted - actual; positive means under budget (good)
    expect(groceryLine!.difference).toBeGreaterThan(0)
  })

  it('includes summary totals', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'PAYROLL', amount: 4000, type: 'credit', category: 'Income', date: new Date('2024-01-15') }),
      makeTx({ description: 'STORE', amount: 200, category: 'Groceries', date: new Date('2024-01-20') }),
    ]
    const budget = generateBudget(txns, { start: '2024-01-01', end: '2024-01-31' })
    const result = compareBudgetToActual(budget, txns, {}, { start: '2024-01-01', end: '2024-01-31' })

    expect(result.totalBudgetedIncome).toBeGreaterThanOrEqual(0)
    expect(result.totalActualIncome).toBeGreaterThanOrEqual(0)
    expect(result.totalBudgetedExpenses).toBeGreaterThanOrEqual(0)
    expect(result.totalActualExpenses).toBeGreaterThanOrEqual(0)
    expect(typeof result.netBudgeted).toBe('number')
    expect(typeof result.netActual).toBe('number')
  })

  it('excludes Transfer transactions from actuals', () => {
    const txns: Transaction[] = [
      makeTx({ description: 'TRANSFER OUT', amount: 500, category: 'Transfer', date: new Date('2024-01-10') }),
    ]
    const budget = generateBudget([], { start: '2024-01-01', end: '2024-01-31' })
    const result = compareBudgetToActual(budget, txns, {}, { start: '2024-01-01', end: '2024-01-31' })
    const transferLine = result.lines.find((l) => l.category === 'Transfer')
    expect(transferLine).toBeUndefined()
  })
})
