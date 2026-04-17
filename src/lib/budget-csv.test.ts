import { describe, it, expect } from 'vitest'
import { buildBudgetCSV, parseBudgetCSV, BudgetCSVParseError } from './budget-csv'
import type { Budget } from './budget-types'

function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: 'budget-test',
    name: 'Jan 2024–Mar 2024 Budget',
    generatedAt: '2024-04-01',
    sourceRange: { start: '2024-01-01', end: '2024-03-31' },
    income: [
      { category: 'Salary', type: 'fixed', amount: 5000, notes: '' },
      { category: 'Interest', type: 'variable-predictable', amount: 45, notes: '' },
    ],
    expenses: [
      { category: 'Subscriptions', merchant: 'Netflix', type: 'fixed', amount: 15.99, notes: 'Streaming' },
      { category: 'Housing', type: 'variable-predictable', amount: 125, notes: 'Electric bill' },
      { category: 'Groceries', type: 'variable-discretionary', amount: 400, notes: '' },
      { category: 'Travel', type: 'one-time', amount: 0, notes: '$1200 — excluded from monthly budget' },
    ],
    totalIncome: 5045,
    totalExpenses: 540.99,
    ...overrides,
  }
}

describe('buildBudgetCSV', () => {
  it('includes metadata comment lines', () => {
    const csv = buildBudgetCSV(makeBudget())
    expect(csv).toContain('# WhoAteMyPaycheck Budget Export')
    expect(csv).toContain('# Generated: 2024-04-01')
    expect(csv).toContain('# Source data: 2024-01-01 to 2024-03-31')
    expect(csv).toContain('# Version: 2')
  })

  it('includes a header row with correct columns', () => {
    const csv = buildBudgetCSV(makeBudget())
    expect(csv).toContain('Section,Category,Merchant,Type,Monthly Amount,Notes')
  })

  it('writes merchant in the Merchant column and category in the Category column', () => {
    const csv = buildBudgetCSV(makeBudget())
    const lines = csv.split('\n')
    const netflixLine = lines.find((l) => l.includes('"Netflix"'))
    expect(netflixLine).toBeDefined()
    // Category column should be the parent category, Merchant column should be "Netflix"
    expect(netflixLine).toContain('"Subscriptions"')
    expect(netflixLine).toContain('"Netflix"')
    expect(netflixLine).toContain('"fixed"')
    expect(netflixLine).toContain('"15.99"')
    expect(netflixLine).toContain('"Streaming"')
  })

  it('outputs income lines before expense lines', () => {
    const csv = buildBudgetCSV(makeBudget())
    const lines = csv.split('\n').filter((l) => !l.startsWith('#') && l.includes('"'))
    // Skip header row
    const dataLines = lines.slice(1)
    const firstExpenseIdx = dataLines.findIndex((l) => l.startsWith('"Expenses"'))
    const lastIncomeIdx = dataLines.map((l) => l.startsWith('"Income"')).lastIndexOf(true)
    expect(lastIncomeIdx).toBeLessThan(firstExpenseIdx)
  })

  it('quotes cells containing commas', () => {
    const budget = makeBudget()
    budget.expenses[0].notes = 'Note with, comma'
    const csv = buildBudgetCSV(budget)
    expect(csv).toContain('"Note with, comma"')
  })

  it('escapes double quotes in cells', () => {
    const budget = makeBudget()
    budget.income[0].notes = 'Say "hello"'
    const csv = buildBudgetCSV(budget)
    expect(csv).toContain('"Say ""hello"""')
  })

  it('sanitizes formula injection prefixes in notes and merchant names', () => {
    const budget = makeBudget()
    budget.expenses[0].notes = '=HYPERLINK("evil.com")'
    budget.expenses[0].merchant = '@EVIL'
    const csv = buildBudgetCSV(budget)
    expect(csv).not.toContain('"=HYPERLINK')
    expect(csv).not.toContain('"@EVIL')
    expect(csv).toContain('" =HYPERLINK')
    expect(csv).toContain('" @EVIL')
  })
})

describe('parseBudgetCSV', () => {
  it('round-trips a budget through build→parse', () => {
    const original = makeBudget()
    const csv = buildBudgetCSV(original)
    const parsed = parseBudgetCSV(csv)

    expect(parsed.income).toHaveLength(original.income.length)
    expect(parsed.expenses).toHaveLength(original.expenses.length)

    // Check income lines
    expect(parsed.income[0].category).toBe('Salary')
    expect(parsed.income[0].type).toBe('fixed')
    expect(parsed.income[0].amount).toBe(5000)

    // Check expense lines — merchant field round-trips correctly
    expect(parsed.expenses[0].category).toBe('Subscriptions')
    expect(parsed.expenses[0].merchant).toBe('Netflix')
    expect(parsed.expenses[0].type).toBe('fixed')
    expect(parsed.expenses[0].amount).toBe(15.99)
    expect(parsed.expenses[0].notes).toBe('Streaming')

    // one-time with notes
    const travel = parsed.expenses.find((l) => l.type === 'one-time')
    expect(travel).toBeDefined()
    expect(travel!.amount).toBe(0)
    expect(travel!.notes).toContain('excluded from monthly budget')
  })

  it('restores sourceRange from metadata', () => {
    const csv = buildBudgetCSV(makeBudget())
    const parsed = parseBudgetCSV(csv)
    expect(parsed.sourceRange.start).toBe('2024-01-01')
    expect(parsed.sourceRange.end).toBe('2024-03-31')
  })

  it('restores generatedAt from metadata', () => {
    const csv = buildBudgetCSV(makeBudget())
    const parsed = parseBudgetCSV(csv)
    expect(parsed.generatedAt).toBe('2024-04-01')
  })

  it('recomputes totalIncome and totalExpenses correctly', () => {
    const csv = buildBudgetCSV(makeBudget())
    const parsed = parseBudgetCSV(csv)
    const expectedIncome = parsed.income.reduce((s, l) => s + l.amount, 0)
    const expectedExpenses = parsed.expenses
      .filter((l) => l.type !== 'one-time')
      .reduce((s, l) => s + l.amount, 0)
    expect(parsed.totalIncome).toBeCloseTo(expectedIncome, 2)
    expect(parsed.totalExpenses).toBeCloseTo(expectedExpenses, 2)
  })

  it('throws on missing required columns', () => {
    const bad = 'Section,Category,Type\n"Income","Salary","fixed"'
    expect(() => parseBudgetCSV(bad)).toThrow(BudgetCSVParseError)
    expect(() => parseBudgetCSV(bad)).toThrow('missing required columns')
  })

  it('throws on invalid type value', () => {
    const bad = 'Section,Category,Type,Monthly Amount,Notes\n"Income","Salary","bogus-type",5000,""'
    expect(() => parseBudgetCSV(bad)).toThrow(BudgetCSVParseError)
    expect(() => parseBudgetCSV(bad)).toThrow('invalid type')
  })

  it('throws on non-numeric amount', () => {
    const bad = 'Section,Category,Type,Monthly Amount,Notes\n"Income","Salary","fixed","not-a-number",""'
    expect(() => parseBudgetCSV(bad)).toThrow(BudgetCSVParseError)
    expect(() => parseBudgetCSV(bad)).toThrow('invalid amount')
  })

  it('throws on unknown section', () => {
    const bad = 'Section,Category,Type,Monthly Amount,Notes\n"Investments","Stocks","fixed",5000,""'
    expect(() => parseBudgetCSV(bad)).toThrow(BudgetCSVParseError)
    expect(() => parseBudgetCSV(bad)).toThrow('unknown section')
  })

  it('throws when there are no data rows', () => {
    const bad = '# Just a comment\n# Another comment'
    expect(() => parseBudgetCSV(bad)).toThrow(BudgetCSVParseError)
  })

  it('handles extra whitespace in unquoted cells gracefully', () => {
    // v2 format with Merchant column
    const csv = 'Section,Category,Merchant,Type,Monthly Amount,Notes\nIncome , Salary , , fixed , 1000 , '
    const parsed = parseBudgetCSV(csv)
    expect(parsed.income[0].category).toBe('Salary')
    expect(parsed.income[0].amount).toBe(1000)
  })

  it('handles Windows line endings (CRLF)', () => {
    const csv = buildBudgetCSV(makeBudget()).replace(/\n/g, '\r\n')
    const parsed = parseBudgetCSV(csv)
    expect(parsed.income).toHaveLength(2)
  })

  it('skips blank lines in the middle of the file', () => {
    const csv = buildBudgetCSV(makeBudget())
    // Insert blank lines
    const lines = csv.split('\n')
    lines.splice(5, 0, '', '')
    const parsed = parseBudgetCSV(lines.join('\n'))
    expect(parsed.income).toHaveLength(2)
  })
})
