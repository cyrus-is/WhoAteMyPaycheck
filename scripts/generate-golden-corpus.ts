/**
 * Golden-corpus generator for the offline classification eval harness (PR-1).
 *
 * Produces sample-data/labeled/*.csv from two deterministic sources:
 *  1. Hand-labeled gold categories for every description that appears in sample-data/*.csv
 *     (FIXTURE_GOLD below — assigned by reading each description and applying real-world
 *     judgment, not by trusting the bank's own Category column, which is frequently wrong —
 *     see docs/classification-improvement-fable.md §2 "D": WHOLEFDS/TRADER JOE'S are labeled
 *     "Food & Drink" by Chase but are Groceries; ALLSTATE renters insurance collides with the
 *     Transport/Auto-Insurance rule; etc.)
 *  2. Programmatically generated messy variants (store numbers, city/state suffixes, stacked
 *     processor prefixes) of a curated base merchant list, plus the §1.4a adversarial probes
 *     verbatim from the doc.
 *
 * Not part of the build or test pipeline — run once and commit the output so the corpus is
 * stable ("Deterministic generation is fine; commit the generated rows so the corpus is
 * stable" — spec §4 PR-1). Re-run only when intentionally growing/fixing the corpus:
 *
 *   npx vite-node scripts/generate-golden-corpus.ts
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Papa from 'papaparse'
import { detectFormat, parseTransactions } from '../src/lib/parser'
import type { Category, Transaction } from '../src/lib/types'

interface GoldLabel {
  category: Category
  subcategory: string
}

interface GoldCsvRow {
  sourceFile: string
  description: string
  amount: number
  type: 'debit' | 'credit'
  category: Category
  subcategory: string
  /** Raw bank-provided category column, when the fixture carries one (§4 PR-5) */
  bankCategory?: string
}

const SAMPLE_DIR = resolve(__dirname, '../sample-data')
const OUT_DIR = resolve(__dirname, '../sample-data/labeled')

// ---------------------------------------------------------------------------
// 1. Hand-labeled gold categories for the existing sample-data/*.csv fixtures
// ---------------------------------------------------------------------------
// Keyed by [fixture filename][exact trimmed description as produced by parser.ts].
// Every description that parseTransactions() produces for a fixture MUST have an
// entry here — the generator throws if one is missing, so the corpus can never
// silently go stale when a fixture changes.

const FIXTURE_GOLD: Record<string, Record<string, GoldLabel>> = {
  'amex-gold.csv': {
    'GRUBHUB INC': { category: 'Dining', subcategory: 'Food Delivery' },
    'AMAZON.COM': { category: 'Shopping', subcategory: 'Online Retail' },
    'DELTA AIR LINES': { category: 'Travel', subcategory: 'Flight' },
    'WHOLEFOODS #SF': { category: 'Groceries', subcategory: 'Specialty Food' },
    'MARRIOTT HOTELS': { category: 'Travel', subcategory: 'Hotel' },
    'UBER *TRIP': { category: 'Transport', subcategory: 'Rideshare' },
    'APPLE STORE': { category: 'Shopping', subcategory: 'Electronics' },
    'AUTOPAY PAYMENT - THANK YOU': { category: 'Transfer', subcategory: 'Transfer' },
    'SWEETGREEN': { category: 'Dining', subcategory: 'Fast Food' },
    'ZOOM.US': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'EQUINOX FITNESS': { category: 'Health', subcategory: 'Gym' },
    'AMAZON.COM REFUND': { category: 'Shopping', subcategory: 'Online Retail' },
    'INSTACART': { category: 'Groceries', subcategory: 'Grocery Delivery' },
    'NOTION.SO': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'RESY *RESTAURANT': { category: 'Dining', subcategory: 'Restaurant' },
    'APPLE.COM/BILL': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'ANTHROPIC *API': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'BLUE BOTTLE COFFEE': { category: 'Dining', subcategory: 'Coffee Shop' },
    'DELTA AIR LINES REFUND': { category: 'Travel', subcategory: 'Flight' },
    'MARRIOTT NYC': { category: 'Travel', subcategory: 'Hotel' },
    'AIRBNB': { category: 'Travel', subcategory: 'Vacation Rental' },
    'HILTON HOTELS': { category: 'Travel', subcategory: 'Hotel' },
  },
  'bofa-credit-card.csv': {
    'WHOLEFDS MKT #10': { category: 'Groceries', subcategory: 'Specialty Food' },
    'NETFLIX.COM': { category: 'Subscriptions', subcategory: 'Streaming' },
    'SHELL SERVICE STATION': { category: 'Transport', subcategory: 'Gas Station' },
    'AMAZON MKTPLACE PMTS': { category: 'Shopping', subcategory: 'Online Retail' },
    'UBER* PENDING': { category: 'Transport', subcategory: 'Rideshare' },
    'SPOTIFY USA': { category: 'Subscriptions', subcategory: 'Streaming' },
    'PAYMENT THANK YOU': { category: 'Transfer', subcategory: 'Transfer' },
    'CVS PHARMACY': { category: 'Health', subcategory: 'Pharmacy' },
    'STARBUCKS STORE 08432': { category: 'Dining', subcategory: 'Coffee Shop' },
    'COMCAST CABLE COMM': { category: 'Housing', subcategory: 'Internet/Cable' },
    'TRADER JOES #123': { category: 'Groceries', subcategory: 'Specialty Food' },
    'GYM MEMBERSHIP': { category: 'Health', subcategory: 'Gym' },
    'CHIPOTLE MEXICAN': { category: 'Dining', subcategory: 'Fast Food' },
    'ATT*BILL PAYMENT': { category: 'Housing', subcategory: 'Phone Bill' },
    'HULU LLC': { category: 'Subscriptions', subcategory: 'Streaming' },
    'LYFT *RIDE': { category: 'Transport', subcategory: 'Rideshare' },
    'TARGET STORE 00024831': { category: 'Shopping', subcategory: 'Department Store' },
    'CHEESECAKE FACTORY': { category: 'Dining', subcategory: 'Restaurant' },
    'COSTCO GAS #0472': { category: 'Transport', subcategory: 'Gas Station' },
    'PAYPAL *FREELANCE': { category: 'Income', subcategory: 'Freelance' },
    'DOORDASH*DASHPASS': { category: 'Dining', subcategory: 'Food Delivery' },
    'UBER EATS': { category: 'Dining', subcategory: 'Food Delivery' },
    'COSTCO WHSE #0472': { category: 'Groceries', subcategory: 'Warehouse Club' },
    'APPLE.COM/BILL': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'DOORDASH*DOORDASH': { category: 'Dining', subcategory: 'Food Delivery' },
    'ADOBE INC': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'MCDONALDS #4821': { category: 'Dining', subcategory: 'Fast Food' },
    'SWEETGREEN': { category: 'Dining', subcategory: 'Fast Food' },
    'TOTAL WINE AND MORE': { category: 'Entertainment', subcategory: 'Nightlife' },
    'BEST BUY 00287': { category: 'Shopping', subcategory: 'Electronics' },
    'DELTA AIR LINES TICKET': { category: 'Travel', subcategory: 'Flight' },
    'MARRIOTT SAN JOSE CONF CTR': { category: 'Travel', subcategory: 'Hotel' },
    'OAK & VINE RESTAURANT': { category: 'Dining', subcategory: 'Restaurant' },
    'AMAZON.COM OFFICE SUPPLIES': { category: 'Shopping', subcategory: 'Online Retail' },
    'ASPEN DENTAL ASSOCIATES': { category: 'Health', subcategory: 'Dentist' },
    'HILTON GARDEN INN': { category: 'Travel', subcategory: 'Hotel' },
    'MARKET BISTRO RESTAURANT': { category: 'Dining', subcategory: 'Restaurant' },
    'AMAZON.COM*9XM2K1PR': { category: 'Shopping', subcategory: 'Online Retail' },
    'DR SARAH CHEN MD OFFICE': { category: 'Health', subcategory: 'Doctor/Medical' },
    'GITHUB INC': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'VISION SOURCE EYE CARE': { category: 'Health', subcategory: 'Vision' },
    'WESTIN HOTEL': { category: 'Travel', subcategory: 'Hotel' },
    'TASTE OF ITALY RISTORANTE': { category: 'Dining', subcategory: 'Restaurant' },
    'AMAZON.COM*4PT8N2VX': { category: 'Shopping', subcategory: 'Online Retail' },
    'NOTION LABS INC': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
  },
  'chase-checking.csv': {
    'RENT PAYMENT - OAKWOOD APTS': { category: 'Housing', subcategory: 'Rent' },
    'WHOLEFDS #10 MARKET ST': { category: 'Groceries', subcategory: 'Specialty Food' },
    'NETFLIX.COM': { category: 'Subscriptions', subcategory: 'Streaming' },
    'SHELL OIL 57442 SAN FRANCISCO CA': { category: 'Transport', subcategory: 'Gas Station' },
    'DIRECT DEPOSIT EMPLOYER PAYROLL': { category: 'Income', subcategory: 'Payroll' },
    'AMAZON.COM*2K7LM9PQ4': { category: 'Shopping', subcategory: 'Online Retail' },
    'UBER* TRIP': { category: 'Transport', subcategory: 'Rideshare' },
    'SPOTIFY USA': { category: 'Subscriptions', subcategory: 'Streaming' },
    'ONLINE TRANSFER TO SAV ...4821': { category: 'Transfer', subcategory: 'Transfer' },
    'CVS PHARMACY #7824': { category: 'Health', subcategory: 'Pharmacy' },
    'STARBUCKS #08432': { category: 'Dining', subcategory: 'Coffee Shop' },
    'PG&E ELECTRIC BILL': { category: 'Housing', subcategory: 'Utilities' },
    'TRADER JOE S #123': { category: 'Groceries', subcategory: 'Specialty Food' },
    'PLANET FITNESS 0032': { category: 'Health', subcategory: 'Gym' },
    'AMZN MKTP US*3R9KP REFUND': { category: 'Shopping', subcategory: 'Online Retail' },
    'CHIPOTLE MEXICAN GRILL': { category: 'Dining', subcategory: 'Fast Food' },
    'AT&T *PAYMENT': { category: 'Housing', subcategory: 'Phone Bill' },
    'INTEREST PAYMENT': { category: 'Income', subcategory: 'Interest' },
    'HULU': { category: 'Subscriptions', subcategory: 'Streaming' },
    'AMAZON.COM*9X2MN5TR8': { category: 'Shopping', subcategory: 'Online Retail' },
    'LYFT *RIDE MON 5PM': { category: 'Transport', subcategory: 'Rideshare' },
    'VALENTIN RESTAURANT': { category: 'Dining', subcategory: 'Restaurant' },
    'TARGET 00024831': { category: 'Shopping', subcategory: 'Department Store' },
    'CHEESECAKE FACTORY': { category: 'Dining', subcategory: 'Restaurant' },
    'AMAZON.COM*7K4JL2QP1': { category: 'Shopping', subcategory: 'Online Retail' },
    'UBER EATS': { category: 'Dining', subcategory: 'Food Delivery' },
    'COSTCO WHSE #0472': { category: 'Groceries', subcategory: 'Warehouse Club' },
    'APPLE.COM/BILL': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'VENMO PAYMENT': { category: 'Transfer', subcategory: 'Transfer' },
    'STATE TAX REFUND': { category: 'Income', subcategory: 'Tax Refund' },
    'AMAZON.COM*3P8NX7YR2': { category: 'Shopping', subcategory: 'Online Retail' },
    'LYFT *RIDE': { category: 'Transport', subcategory: 'Rideshare' },
    'WALGREENS STORE #4201': { category: 'Health', subcategory: 'Pharmacy' },
    'AMAZON.COM*5H2KL9MQ7': { category: 'Shopping', subcategory: 'Online Retail' },
    'AMAZON.COM PRIME MEMBERSHIP': { category: 'Subscriptions', subcategory: 'Streaming' },
    'AMAZON.COM*8Q3NV5WP1': { category: 'Shopping', subcategory: 'Online Retail' },
    'TOTAL WINE & MORE': { category: 'Entertainment', subcategory: 'Nightlife' },
    'AMAZON.COM*1L6PQ2TK9': { category: 'Shopping', subcategory: 'Online Retail' },
    'AMAZON.COM*4R7MN8PQ3': { category: 'Shopping', subcategory: 'Online Retail' },
    'AMAZON.COM*9W2PK5QR6': { category: 'Shopping', subcategory: 'Online Retail' },
    'AMAZON.COM*6T4NM2KW8': { category: 'Shopping', subcategory: 'Online Retail' },
    'AMAZON.COM*2P5KQ9TN4': { category: 'Shopping', subcategory: 'Online Retail' },
    'YEAR END BONUS': { category: 'Income', subcategory: 'Bonus' },
    'AMAZON.COM*8N3LQ7PK5': { category: 'Shopping', subcategory: 'Online Retail' },
    'ACH CREDIT DESIGNCO CLIENT PAYMENT': { category: 'Income', subcategory: 'Freelance' },
    'CHARITY WATER DONATION': { category: 'Other', subcategory: 'Donation' },
    'BRIGHT HORIZONS CHILDCARE': { category: 'Childcare', subcategory: 'Daycare' },
    'AMERICAN RED CROSS DONATION': { category: 'Other', subcategory: 'Donation' },
    'COUNTY PROPERTY TAX PAYMENT': { category: 'Other', subcategory: 'Property Tax' },
    'DOCTORS MEDICAL GROUP': { category: 'Health', subcategory: 'Doctor/Medical' },
  },
  'credit-union-checking.csv': {
    'RENT PAYMENT - OAKWOOD APTS': { category: 'Housing', subcategory: 'Rent' },
    'PAYROLL DIRECT DEPOSIT ACME CORP': { category: 'Income', subcategory: 'Payroll' },
    'WHOLEFDS MARKET': { category: 'Groceries', subcategory: 'Specialty Food' },
    'NETFLIX': { category: 'Subscriptions', subcategory: 'Streaming' },
    'SHELL OIL 57442': { category: 'Transport', subcategory: 'Gas Station' },
    'AMAZON.COM': { category: 'Shopping', subcategory: 'Online Retail' },
    'UBER TRIP': { category: 'Transport', subcategory: 'Rideshare' },
    'SPOTIFY': { category: 'Subscriptions', subcategory: 'Streaming' },
    'TRANSFER TO SAVINGS': { category: 'Transfer', subcategory: 'Transfer' },
    'CVS PHARMACY': { category: 'Health', subcategory: 'Pharmacy' },
    'STARBUCKS': { category: 'Dining', subcategory: 'Coffee Shop' },
    'PG&E': { category: 'Housing', subcategory: 'Utilities' },
    'TRADER JOES': { category: 'Groceries', subcategory: 'Specialty Food' },
    'PLANET FITNESS': { category: 'Health', subcategory: 'Gym' },
    'AMAZON REFUND': { category: 'Shopping', subcategory: 'Online Retail' },
    'CHIPOTLE': { category: 'Dining', subcategory: 'Fast Food' },
    'AT&T WIRELESS': { category: 'Housing', subcategory: 'Phone Bill' },
    'INTEREST EARNED': { category: 'Income', subcategory: 'Interest' },
    'RENTER INSURANCE ALLSTATE': { category: 'Housing', subcategory: 'Insurance' },
    'HULU': { category: 'Subscriptions', subcategory: 'Streaming' },
    'LYFT': { category: 'Transport', subcategory: 'Rideshare' },
    'TARGET': { category: 'Shopping', subcategory: 'Department Store' },
    'CHEESECAKE FACTORY': { category: 'Dining', subcategory: 'Restaurant' },
    'COMCAST': { category: 'Housing', subcategory: 'Internet/Cable' },
    'ZELLE PAYMENT TO ALEX': { category: 'Transfer', subcategory: 'Transfer' },
    'DOORDASH': { category: 'Dining', subcategory: 'Food Delivery' },
    'UBER EATS': { category: 'Dining', subcategory: 'Food Delivery' },
    'COSTCO': { category: 'Groceries', subcategory: 'Warehouse Club' },
    'APPLE.COM/BILL': { category: 'Subscriptions', subcategory: 'Software/SaaS' },
    'SIDE JOB PAYMENT': { category: 'Income', subcategory: 'Side Income' },
    'WALGREENS': { category: 'Health', subcategory: 'Pharmacy' },
    'COSTCO WHSE': { category: 'Groceries', subcategory: 'Warehouse Club' },
  },
  'monzo-uk.csv': {
    'Tesco Express': { category: 'Groceries', subcategory: 'Supermarket' },
    'Pret A Manger': { category: 'Dining', subcategory: 'Coffee Shop' },
    'EMPLOYER SALARY': { category: 'Income', subcategory: 'Payroll' },
    'Deliveroo': { category: 'Dining', subcategory: 'Food Delivery' },
    'Amazon': { category: 'Shopping', subcategory: 'Online Retail' },
    'Oyster / TfL': { category: 'Transport', subcategory: 'Public Transit' },
    "Sainsbury's": { category: 'Groceries', subcategory: 'Supermarket' },
    'Netflix': { category: 'Subscriptions', subcategory: 'Streaming' },
    'Costa Coffee': { category: 'Dining', subcategory: 'Coffee Shop' },
    'Shell': { category: 'Transport', subcategory: 'Gas Station' },
    'Gym Membership': { category: 'Health', subcategory: 'Gym' },
    'M&S Food': { category: 'Groceries', subcategory: 'Specialty Food' },
    'Monzo Flex': { category: 'Transfer', subcategory: 'Transfer' },
    'Spotify': { category: 'Subscriptions', subcategory: 'Streaming' },
    'Restaurant 1847': { category: 'Dining', subcategory: 'Restaurant' },
    'Tesco': { category: 'Groceries', subcategory: 'Supermarket' },
    'RENT - LANDLORD': { category: 'Housing', subcategory: 'Rent' },
    'Uber Eats': { category: 'Dining', subcategory: 'Food Delivery' },
    'Restaurant': { category: 'Dining', subcategory: 'Restaurant' },
    'Marks & Spencer': { category: 'Shopping', subcategory: 'Clothing' },
  },
}

function loadFixtureTransactions(filename: string): Transaction[] {
  const csv = readFileSync(resolve(SAMPLE_DIR, filename), 'utf8')
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  const mismatchedRow = result.data.findIndex((row) => '__parsed_extra' in row)
  if (mismatchedRow !== -1) {
    throw new Error(
      `${filename}: row ${mismatchedRow + 2} has more fields than the header (field-count mismatch) — ` +
        'a misparsed row would silently canonize wrong amount/type data as gold. Fix the CSV before regenerating.',
    )
  }
  const headers = result.meta.fields ?? []
  const mapping = detectFormat(headers, result.data)
  const { transactions } = parseTransactions(filename, result.data, mapping)
  return transactions
}

function buildFixtureRows(): GoldCsvRow[] {
  const rows: GoldCsvRow[] = []
  for (const filename of Object.keys(FIXTURE_GOLD)) {
    const gold = FIXTURE_GOLD[filename]
    const transactions = loadFixtureTransactions(filename)
    for (const tx of transactions) {
      const label = gold[tx.description]
      if (!label) {
        throw new Error(`Missing gold label for "${tx.description}" in ${filename} — add it to FIXTURE_GOLD.`)
      }
      rows.push({
        sourceFile: filename,
        description: tx.description,
        amount: tx.amount,
        type: tx.type,
        category: label.category,
        subcategory: label.subcategory,
        ...(tx.bankCategory ? { bankCategory: tx.bankCategory } : {}),
      })
    }
  }
  return rows
}

// ---------------------------------------------------------------------------
// 2. §1.4a adversarial probes — verbatim from docs/classification-improvement-fable.md
// ---------------------------------------------------------------------------

const ADVERSARIAL_PROBES: (GoldLabel & { description: string })[] = [
  { description: 'SHELL BEACH CAFE SAN LUIS OBISPO', category: 'Dining', subcategory: 'Restaurant' },
  { description: 'O2 ARENA LONDON EVENT', category: 'Entertainment', subcategory: 'Concert/Event' },
  { description: 'PANDORA JEWELRY #442', category: 'Shopping', subcategory: 'Department Store' },
  { description: 'STEAM ROOM DAY SPA', category: 'Health', subcategory: 'Doctor/Medical' },
  { description: 'GAP INSURANCE PREMIUM AUTO', category: 'Transport', subcategory: 'Auto Insurance' },
  { description: 'RIVERSIDE ELECTRIC CO-OP', category: 'Housing', subcategory: 'Utilities' },
  { description: 'BOOTS AND SADDLES WESTERN WEAR', category: 'Shopping', subcategory: 'Clothing' },
  { description: 'MARATHON SPORTS RUNNING SHOES', category: 'Shopping', subcategory: 'Clothing' },
  { description: 'USAA TRANSFER TO CHECKING', category: 'Transfer', subcategory: 'Transfer' },
  { description: 'ACH CREDIT ACME CORP', category: 'Income', subcategory: 'Payroll' },
]

function buildAdversarialRows(): GoldCsvRow[] {
  return ADVERSARIAL_PROBES.map((probe) => ({
    sourceFile: 'adversarial-probes.csv',
    description: probe.description,
    amount: 25,
    type: probe.category === 'Income' ? 'credit' : 'debit',
    category: probe.category,
    subcategory: probe.subcategory,
  }))
}

// ---------------------------------------------------------------------------
// 3. Generated messy variants — deterministic transforms of a curated merchant base
// ---------------------------------------------------------------------------

const STORE_NUMBERS = [1024, 5578, 219, 8842, 33, 7701, 456, 9012, 214, 6689]
const CITY_SUFFIXES = [
  'SAN LUIS OBISPO CA', 'AUSTIN TX', 'BROOKLYN NY', 'PORTLAND OR', 'DENVER CO',
  'MIAMI FL', 'SEATTLE WA', 'CHICAGO IL', 'PHOENIX AZ', 'BOSTON MA',
]
// Pairs of stackable processor-style prefixes, outer-then-inner, mirroring the real
// "POS DEBIT SQ *BLUE BOTTLE" two-layer prefixing described in doc §2 A.
const STACKED_PREFIXES: [string, string][] = [
  ['POS DEBIT ', 'SQ *'],
  ['RECURRING PAYMENT ', 'TST* '],
  ['CHECKCARD ', 'PAYPAL *'],
  ['DEBIT CARD PURCHASE ', 'SP *'],
]

interface BaseMerchant {
  name: string
  category: Category
  subcategory: string
}

// Curated base merchants spanning every category, drawn from real-world names —
// mostly ones already known to classifyByMerchant (to test whether messiness defeats
// an otherwise-correct rule), plus a few generic/unknown ones matching doc §2's planned
// keyword rules (expected to miss until PR-2 adds generic keyword matching).
const VARIANT_BASE: BaseMerchant[] = [
  { name: 'STARBUCKS', category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'BLUE BOTTLE COFFEE', category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'DUNKIN', category: 'Dining', subcategory: 'Coffee Shop' },
  { name: 'MCDONALDS', category: 'Dining', subcategory: 'Fast Food' },
  { name: 'CHIPOTLE', category: 'Dining', subcategory: 'Fast Food' },
  { name: 'CHICK-FIL-A', category: 'Dining', subcategory: 'Fast Food' },
  { name: 'FIVE GUYS', category: 'Dining', subcategory: 'Fast Food' },
  { name: 'OLIVE GARDEN', category: 'Dining', subcategory: 'Restaurant' },
  { name: 'DOORDASH', category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'GRUBHUB', category: 'Dining', subcategory: 'Food Delivery' },
  { name: 'WHOLE FOODS MARKET', category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'TRADER JOES', category: 'Groceries', subcategory: 'Specialty Food' },
  { name: 'KROGER', category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'SAFEWAY', category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'COSTCO WHSE', category: 'Groceries', subcategory: 'Warehouse Club' },
  { name: 'INSTACART', category: 'Groceries', subcategory: 'Grocery Delivery' },
  { name: 'TESCO', category: 'Groceries', subcategory: 'Supermarket' },
  { name: "SAINSBURY'S", category: 'Groceries', subcategory: 'Supermarket' },
  { name: 'SHELL OIL', category: 'Transport', subcategory: 'Gas Station' },
  { name: 'CHEVRON', category: 'Transport', subcategory: 'Gas Station' },
  { name: 'COSTCO GAS', category: 'Transport', subcategory: 'Gas Station' },
  { name: 'UBER TRIP', category: 'Transport', subcategory: 'Rideshare' },
  { name: 'LYFT', category: 'Transport', subcategory: 'Rideshare' },
  { name: 'GEICO', category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'STATE FARM', category: 'Transport', subcategory: 'Auto Insurance' },
  { name: 'TFL TRAVEL', category: 'Transport', subcategory: 'Public Transit' },
  { name: 'AMAZON.COM', category: 'Shopping', subcategory: 'Online Retail' },
  { name: 'TARGET', category: 'Shopping', subcategory: 'Department Store' },
  { name: 'BEST BUY', category: 'Shopping', subcategory: 'Electronics' },
  { name: 'HOME DEPOT', category: 'Shopping', subcategory: 'Department Store' },
  { name: 'MACYS', category: 'Shopping', subcategory: 'Department Store' },
  { name: 'TJ MAXX', category: 'Shopping', subcategory: 'Clothing' },
  { name: 'NIKE', category: 'Shopping', subcategory: 'Clothing' },
  { name: 'IKEA', category: 'Shopping', subcategory: 'Department Store' },
  { name: 'SEPHORA', category: 'Shopping', subcategory: 'Department Store' },
  { name: 'NETFLIX', category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'SPOTIFY', category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'HULU', category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'DISNEY PLUS', category: 'Subscriptions', subcategory: 'Streaming' },
  { name: 'ADOBE', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'GITHUB', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { name: 'DROPBOX', category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { name: 'NYTIMES', category: 'Subscriptions', subcategory: 'News/Media' },
  { name: 'AMC THEATRES', category: 'Entertainment', subcategory: 'Movies/Theater' },
  { name: 'TICKETMASTER', category: 'Entertainment', subcategory: 'Concert/Event' },
  { name: 'STEAM PURCHASE', category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'PLAYSTATION NETWORK', category: 'Entertainment', subcategory: 'Gaming' },
  { name: 'TOTAL WINE', category: 'Entertainment', subcategory: 'Nightlife' },
  { name: 'CVS PHARMACY', category: 'Health', subcategory: 'Pharmacy' },
  { name: 'WALGREENS', category: 'Health', subcategory: 'Pharmacy' },
  { name: 'PLANET FITNESS', category: 'Health', subcategory: 'Gym' },
  { name: 'EQUINOX', category: 'Health', subcategory: 'Gym' },
  { name: 'ASPEN DENTAL', category: 'Health', subcategory: 'Dentist' },
  { name: 'WARBY PARKER', category: 'Health', subcategory: 'Vision' },
  { name: 'DELTA AIR LINES', category: 'Travel', subcategory: 'Flight' },
  { name: 'UNITED AIRLINES', category: 'Travel', subcategory: 'Flight' },
  { name: 'MARRIOTT', category: 'Travel', subcategory: 'Hotel' },
  { name: 'HILTON', category: 'Travel', subcategory: 'Hotel' },
  { name: 'AIRBNB', category: 'Travel', subcategory: 'Vacation Rental' },
  { name: 'HERTZ RENT A CAR', category: 'Travel', subcategory: 'Car Rental' },
  { name: 'PG&E ELECTRIC', category: 'Housing', subcategory: 'Utilities' },
  { name: 'COMCAST XFINITY', category: 'Housing', subcategory: 'Internet/Cable' },
  { name: 'AT&T WIRELESS', category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'VERIZON WIRELESS', category: 'Housing', subcategory: 'Phone Bill' },
  { name: 'BRIGHT HORIZONS', category: 'Childcare', subcategory: 'Daycare' },
  { name: 'KINDERCARE', category: 'Childcare', subcategory: 'Daycare' },
  { name: 'MONTESSORI ACADEMY', category: 'Childcare', subcategory: 'Preschool' },
  { name: 'NAVIENT STUDENT LOAN', category: 'Education', subcategory: 'Student Loan' },
  { name: 'KUMON MATH CENTER', category: 'Education', subcategory: 'Tutoring' },
  { name: 'COURSERA', category: 'Education', subcategory: 'Online Course' },
  { name: 'VENMO', category: 'Transfer', subcategory: 'Transfer' },
  { name: 'ZELLE', category: 'Transfer', subcategory: 'Transfer' },
  { name: 'DIRECT DEPOSIT PAYROLL', category: 'Income', subcategory: 'Payroll' },
  { name: 'ADP PAYROLL', category: 'Income', subcategory: 'Payroll' },
  { name: 'INTEREST PAYMENT', category: 'Income', subcategory: 'Interest' },
  // Generic/unknown merchants — no rule exists yet (doc §2 A: planned for PR-2), expected
  // to stay MISS regardless of messiness; kept in the corpus so PR-2's coverage lift is measurable.
  { name: 'OAKWOOD APTS RENT', category: 'Housing', subcategory: 'Rent' },
  { name: 'GOLDEN GYM FITNESS', category: 'Health', subcategory: 'Gym' },
  { name: 'RIVERVIEW MEDICAL CLINIC', category: 'Health', subcategory: 'Doctor/Medical' },
  { name: 'HOPE CHARITY DONATION', category: 'Other', subcategory: 'Donation' },
  { name: 'MAPLEWOOD PROPERTY MANAGEMENT', category: 'Housing', subcategory: 'Rent' },
]

function storeNumberVariant(name: string, i: number): string {
  return `${name} #${STORE_NUMBERS[i % STORE_NUMBERS.length]}`
}

function citySuffixVariant(name: string, i: number): string {
  return `${name} ${CITY_SUFFIXES[i % CITY_SUFFIXES.length]}`
}

function stackedPrefixVariant(name: string, i: number): string {
  const [outer, inner] = STACKED_PREFIXES[i % STACKED_PREFIXES.length]
  return `${outer}${inner}${name}`
}

function comboVariant(name: string, i: number): string {
  const [, inner] = STACKED_PREFIXES[i % STACKED_PREFIXES.length]
  return `${inner}${name} #${STORE_NUMBERS[i % STORE_NUMBERS.length]}`
}

function buildMessyVariantRows(): GoldCsvRow[] {
  const rows: GoldCsvRow[] = []
  const transformers = [storeNumberVariant, citySuffixVariant, stackedPrefixVariant, comboVariant]

  VARIANT_BASE.forEach((base, i) => {
    for (const transform of transformers) {
      rows.push({
        sourceFile: 'messy-variants.csv',
        description: transform(base.name, i),
        amount: 25,
        type: base.category === 'Income' ? 'credit' : 'debit',
        category: base.category,
        subcategory: base.subcategory,
      })
    }
  })

  return rows
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

function writeCsv(filename: string, rows: GoldCsvRow[]): void {
  const csv = Papa.unparse(rows, { columns: ['sourceFile', 'description', 'amount', 'type', 'category', 'subcategory', 'bankCategory'] })
  writeFileSync(resolve(OUT_DIR, filename), csv + '\n', 'utf8')
  console.log(`Wrote ${rows.length} rows to sample-data/labeled/${filename}`)
}

const fixtureRows = buildFixtureRows()
const adversarialRows = buildAdversarialRows()
const messyVariantRows = buildMessyVariantRows()

writeCsv('fixtures-gold.csv', fixtureRows)
writeCsv('adversarial-probes.csv', adversarialRows)
writeCsv('messy-variants.csv', messyVariantRows)

console.log(`\nTotal golden-corpus rows: ${fixtureRows.length + adversarialRows.length + messyVariantRows.length}`)
