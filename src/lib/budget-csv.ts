import type { Budget, BudgetLine, BudgetLineType } from './budget-types'

const FORMAT_VERSION = '2'

// ── Build ──────────────────────────────────────────────────────────────────

/** Prevent spreadsheet formula injection: prefix dangerous-start characters with a space. */
function sanitizeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? ` ${value}` : value
}

/** Pure: build a budget CSV string. Includes #-prefixed metadata lines. */
export function buildBudgetCSV(budget: Budget): string {
  const lines: string[] = []

  // Metadata header
  lines.push('# WhoAteMyPaycheck Budget Export')
  lines.push(`# Generated: ${budget.generatedAt}`)
  lines.push(`# Source data: ${budget.sourceRange.start} to ${budget.sourceRange.end}`)
  lines.push(`# Version: ${FORMAT_VERSION}`)

  // Column header — Merchant column preserves merchant-level lines on round-trip
  lines.push('Section,Category,Merchant,Type,Monthly Amount,Notes')

  function row(section: string, line: BudgetLine): string {
    const cells = [section, line.category, line.merchant ?? '', line.type, line.amount.toFixed(2), line.notes]
    return cells.map((c) => `"${sanitizeCsvCell(String(c)).replace(/"/g, '""')}"`).join(',')
  }

  for (const line of budget.income) {
    lines.push(row('Income', line))
  }
  for (const line of budget.expenses) {
    lines.push(row('Expenses', line))
  }

  return lines.join('\n')
}

/** Trigger a browser CSV download of the budget. */
export function exportBudgetCSV(budget: Budget): void {
  const csv = buildBudgetCSV(budget)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${budget.name.replace(/[^a-zA-Z0-9]+/g, '-')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ── Parse ──────────────────────────────────────────────────────────────────

export class BudgetCSVParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetCSVParseError'
  }
}

/** Parse a budget CSV string back into a Budget object. */
export function parseBudgetCSV(csv: string): Budget {
  const allLines = csv.split(/\r?\n/)

  // Extract metadata from # lines
  let generatedAt = ''
  let sourceStart = ''
  let sourceEnd = ''

  const dataLines: string[] = []

  for (const line of allLines) {
    if (line.startsWith('# Generated:')) {
      generatedAt = line.replace('# Generated:', '').trim()
    } else if (line.startsWith('# Source data:')) {
      const match = line.match(/(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/)
      if (match) {
        sourceStart = match[1]
        sourceEnd = match[2]
      }
    } else if (line.startsWith('#') || line.trim() === '') {
      // skip other metadata lines and blank lines
      continue
    } else {
      dataLines.push(line)
    }
  }

  if (dataLines.length === 0) {
    throw new BudgetCSVParseError('No data rows found in budget CSV')
  }

  // Parse the header row
  const header = parseCSVRow(dataLines[0])
  const sectionIdx = header.indexOf('Section')
  const categoryIdx = header.indexOf('Category')
  const merchantIdx = header.indexOf('Merchant')   // v2+ only; -1 for v1 files
  const typeIdx = header.indexOf('Type')
  const amountIdx = header.indexOf('Monthly Amount')
  const notesIdx = header.indexOf('Notes')

  if ([sectionIdx, categoryIdx, typeIdx, amountIdx].some((i) => i === -1)) {
    throw new BudgetCSVParseError(
      'Budget CSV is missing required columns (Section, Category, Type, Monthly Amount)',
    )
  }

  const income: BudgetLine[] = []
  const expenses: BudgetLine[] = []
  const VALID_TYPES = new Set<string>(['fixed', 'variable-predictable', 'variable-discretionary', 'one-time'])

  for (let i = 1; i < dataLines.length; i++) {
    const row = parseCSVRow(dataLines[i])
    if (row.length === 0 || row.every((c) => c === '')) continue

    const section = row[sectionIdx] ?? ''
    const category = row[categoryIdx] ?? ''
    const merchantRaw = merchantIdx >= 0 ? (row[merchantIdx] ?? '') : ''
    const typeRaw = row[typeIdx] ?? ''
    const amountRaw = row[amountIdx] ?? '0'
    const notes = notesIdx >= 0 ? (row[notesIdx] ?? '') : ''

    if (!VALID_TYPES.has(typeRaw)) {
      throw new BudgetCSVParseError(
        `Row ${i + 1}: invalid type "${typeRaw}". Expected one of: fixed, variable-predictable, variable-discretionary, one-time`,
      )
    }

    const amount = parseFloat(amountRaw)
    if (isNaN(amount)) {
      throw new BudgetCSVParseError(`Row ${i + 1}: invalid amount "${amountRaw}"`)
    }

    const line: BudgetLine = {
      category,
      ...(merchantRaw ? { merchant: merchantRaw } : {}),
      type: typeRaw as BudgetLineType,
      amount: Math.round(amount * 100) / 100,
      notes,
    }

    const sectionLower = section.toLowerCase()
    if (sectionLower === 'income') {
      income.push(line)
    } else if (sectionLower === 'expenses') {
      expenses.push(line)
    } else {
      throw new BudgetCSVParseError(`Row ${i + 1}: unknown section "${section}". Expected "Income" or "Expenses"`)
    }
  }

  const totalIncome = income.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = expenses
    .filter((l) => l.type !== 'one-time')
    .reduce((s, l) => s + l.amount, 0)

  return {
    id: `budget-${Date.now()}`,
    name: sourceStart && sourceEnd
      ? formatBudgetName(sourceStart, sourceEnd)
      : 'Imported Budget',
    generatedAt: generatedAt || new Date().toISOString().substring(0, 10),
    sourceRange: { start: sourceStart, end: sourceEnd },
    income,
    expenses,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Parse a single CSV row, handling quoted fields with embedded commas and quotes. */
function parseCSVRow(line: string): string[] {
  const result: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = ''
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (line[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          field += line[i++]
        }
      }
      result.push(field)
      if (line[i] === ',') i++ // skip comma
    } else {
      // Unquoted field
      const end = line.indexOf(',', i)
      if (end === -1) {
        result.push(line.slice(i).trim())
        break
      } else {
        result.push(line.slice(i, end).trim())
        i = end + 1
      }
    }
  }
  return result
}

function formatBudgetName(start: string, end: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  const startLabel = `${MONTHS[sm - 1]} ${sy}`
  const endLabel = `${MONTHS[em - 1]} ${ey}`
  return startLabel === endLabel ? `${startLabel} Budget` : `${startLabel}–${endLabel} Budget`
}
