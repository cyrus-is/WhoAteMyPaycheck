import type { Transaction } from './types'

/** Detected column mapping for a CSV file */
export interface ColumnMapping {
  date: string
  description: string
  /** Single signed amount column (positive = debit, negative = credit, or vice versa) */
  amount?: string
  /** Separate debit column (positive = money out) */
  debit?: string
  /** Separate credit column (positive = money in) */
  credit?: string
  /** Optional transaction type column */
  type?: string
  /** If true, positive in `amount` means credit (income). Default: false (positive = debit) */
  positiveIsCredit?: boolean
  /** Detected slash-date order for this file. 'dmy' = DD/MM/YYYY, 'mdy' = MM/DD/YYYY (default) */
  dateOrder?: 'mdy' | 'dmy'
}

// Common column name patterns for each field
const DATE_PATTERNS = [
  /^date$/i, /^transaction.?date$/i, /^posted.?date$/i, /^trans.?date$/i,
  /^posting.?date$/i, /^settlement.?date$/i,
]
const DESC_PATTERNS = [
  /^description$/i, /^memo$/i, /^transaction.?description$/i, /^details$/i,
  /^payee$/i, /^merchant$/i, /^reference$/i, /^name$/i, /^narrative$/i,
  /^original.?description$/i,
]
const AMOUNT_PATTERNS = [
  /^amount$/i, /^transaction.?amount$/i, /^trans.?amount$/i,
]
const DEBIT_PATTERNS = [
  /^debit$/i, /^withdrawal$/i, /^debit.?amount$/i, /^withdrawals?$/i,
  /^money.?out$/i, /^payment$/i, /paid\s*out/i,
]
const CREDIT_PATTERNS = [
  /^credit$/i, /^deposit$/i, /^credit.?amount$/i, /^deposits?$/i,
  /^money.?in$/i, /paid\s*in/i,
]

function matchesAny(col: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(col))
}

/**
 * Sniff the date order (MM/DD vs DD/MM) from a sample of date strings.
 * If any first-token value is > 12, it must be a day → DD/MM order.
 * If ambiguous (all values ≤ 12), default to MM/DD (US).
 */
export function detectDateOrder(dateStrings: string[]): 'mdy' | 'dmy' {
  const SLASH_RE = /^(\d{1,2})[/-](\d{1,2})[/-]/

  for (const s of dateStrings) {
    const m = s.trim().match(SLASH_RE)
    if (!m) continue
    const first = parseInt(m[1])
    const second = parseInt(m[2])
    if (first > 12) return 'dmy'   // unambiguous: first token can only be a day
    if (second > 12) return 'mdy'  // unambiguous: second token can only be a day
  }

  return 'mdy' // ambiguous — default to US format
}

/** Detect the column mapping from CSV headers and first few rows */
export function detectFormat(
  headers: string[],
  rows: Record<string, string>[],
): ColumnMapping {
  const dateCol = headers.find((h) => matchesAny(h, DATE_PATTERNS))
  const descCol = headers.find((h) => matchesAny(h, DESC_PATTERNS))
  const amountCol = headers.find((h) => matchesAny(h, AMOUNT_PATTERNS))
  const debitCol = headers.find((h) => matchesAny(h, DEBIT_PATTERNS))
  const creditCol = headers.find((h) => matchesAny(h, CREDIT_PATTERNS))

  if (!dateCol) throw new Error(`Could not detect date column. Headers: ${headers.join(', ')}`)
  if (!descCol) throw new Error(`Could not detect description column. Headers: ${headers.join(', ')}`)

  // Determine if positive amount = credit (income) for single-column banks.
  // Two signals, either one is sufficient:
  //   1. A Type column contains "credit" for rows with positive amounts (explicit)
  //   2. Majority of non-zero amounts are negative — indicates the Amex/credit-card
  //      convention where (NNN) or -NNN = charge, positive = payment.
  let positiveIsCredit = false
  if (amountCol) {
    const typeCol = headers.find((h) => /^type$/i.test(h) || /^transaction.?type$/i.test(h))
    if (typeCol) {
      const sample = rows.slice(0, 20)
      const creditRows = sample.filter(
        (r) => /credit/i.test(r[typeCol] ?? '') && parseFloat((r[amountCol] ?? '').replace(/[$,]/g, '')) > 0,
      )
      if (creditRows.length > 0) positiveIsCredit = true
    }

    if (!positiveIsCredit) {
      // Count sign of amounts in a broader sample to detect Amex-style convention
      const sample = rows.slice(0, 40)
      let negCount = 0
      let posCount = 0
      for (const r of sample) {
        const raw = (r[amountCol] ?? '').trim()
        if (!raw) continue
        const isNeg = raw.startsWith('(') || raw.startsWith('-')
        if (isNeg) negCount++
        else posCount++
      }
      // If clearly majority-negative (with a minimum sample to avoid false positives),
      // positive = credit (income). Require at least 5 non-zero amounts before deciding.
      if (negCount + posCount >= 5 && negCount > posCount * 2) positiveIsCredit = true
    }
  }

  // Detect slash-date order from the actual values in the file
  const sampleDates = rows.slice(0, 30).map((r) => r[dateCol] ?? '').filter(Boolean)
  const dateOrder = detectDateOrder(sampleDates)

  const mapping: ColumnMapping = { date: dateCol, description: descCol, dateOrder }
  // Prefer explicit debit/credit split over a single signed amount column —
  // the split is unambiguous and avoids sign-convention guessing.
  if (debitCol || creditCol) {
    if (debitCol) mapping.debit = debitCol
    if (creditCol) mapping.credit = creditCol
  } else if (amountCol) {
    mapping.amount = amountCol
    mapping.positiveIsCredit = positiveIsCredit
  }

  return mapping
}

/** Parse a date string into a Date object. dateOrder controls MM/DD vs DD/MM for slash dates. */
export function parseDate(raw: string, dateOrder: 'mdy' | 'dmy' = 'mdy'): Date {
  const s = raw.trim()

  // ISO: 2024-01-15 — parse as local time (not UTC)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
    if (!isNaN(d.getTime())) return d
  }

  // Slash dates: MM/DD/YYYY, DD/MM/YYYY, or MM/DD/YY — order determined by dateOrder
  const slashMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (slashMatch) {
    const a = parseInt(slashMatch[1])
    const b = parseInt(slashMatch[2])
    const rawYear = slashMatch[3]
    const year = rawYear.length === 2 ? parseInt(rawYear) + 2000 : parseInt(rawYear)

    const mm = dateOrder === 'dmy' ? b : a
    const dd = dateOrder === 'dmy' ? a : b
    return new Date(year, mm - 1, dd)
  }

  // Month DD, YYYY: "Jan 15, 2024" or "January 15, 2024"
  // Parse ourselves to avoid locale-dependent new Date(s) behaviour
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    january: 1, february: 2, march: 3, april: 4, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  }
  const monthNameMatch = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (monthNameMatch) {
    const month = MONTHS[monthNameMatch[1].toLowerCase()]
    const day = parseInt(monthNameMatch[2])
    const year = parseInt(monthNameMatch[3])
    if (month) {
      const d = new Date(year, month - 1, day)
      if (!isNaN(d.getTime())) return d
    }
  }

  throw new Error(`Cannot parse date: "${raw}"`)
}

/** Parse an amount string to a number. Returns the raw numeric value. */
function parseAmount(raw: string): number {
  let s = raw.trim()
  const negative = s.startsWith('(') && s.endsWith(')')
  s = s.replace(/[()$€£¥,\s]/g, '')
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return negative ? -Math.abs(n) : n
}

let txCounter = 0

/** Normalize raw CSV rows into Transactions using the detected format */
export function parseTransactions(
  sourceFile: string,
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): { transactions: Transaction[]; skippedRows: number } {
  const transactions: Transaction[] = []
  const dateOrder = mapping.dateOrder ?? 'mdy'
  let skippedRows = 0

  for (const row of rows) {
    const rawDate = row[mapping.date] ?? ''
    const description = (row[mapping.description] ?? '').trim()

    if (!rawDate || !description) continue

    let date: Date
    try {
      date = parseDate(rawDate, dateOrder)
    } catch {
      skippedRows++
      continue
    }

    let amount: number
    let type: 'debit' | 'credit'

    if (mapping.amount) {
      const raw = parseAmount(row[mapping.amount] ?? '0')
      if (mapping.positiveIsCredit) {
        amount = raw >= 0 ? raw : Math.abs(raw)
        type = raw >= 0 ? 'credit' : 'debit'
      } else {
        amount = Math.abs(raw)
        type = raw < 0 ? 'credit' : 'debit'
      }
    } else if (mapping.debit !== undefined || mapping.credit !== undefined) {
      const debitRaw = mapping.debit ? parseAmount(row[mapping.debit] ?? '') : 0
      const creditRaw = mapping.credit ? parseAmount(row[mapping.credit] ?? '') : 0

      if (debitRaw !== 0) {
        amount = Math.abs(debitRaw)
        type = 'debit'
      } else if (creditRaw !== 0) {
        amount = Math.abs(creditRaw)
        type = 'credit'
      } else {
        continue
      }
    } else {
      continue
    }

    transactions.push({
      id: `tx-${++txCounter}`,
      date,
      description,
      amount,
      type,
      category: type === 'credit' ? 'Income' : 'Other',
      subcategory: '',
      sourceFile,
    })
  }

  return { transactions, skippedRows }
}
