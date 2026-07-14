/**
 * Build-time generator for the shipped merchant dictionary (PR-7).
 *
 * Converts the *literal* merchant identities (as opposed to merchantLookup.ts's generic
 * category-signal keyword rules) into a token-indexed data artifact — see
 * docs/classification-improvement-fable.md §2.F and §4 PR-7. The output
 * (src/lib/merchantDict.generated.json) is committed so `npm run build` never needs to
 * regenerate it; re-run this script only when intentionally growing the merchant list:
 *
 *   npx vite-node scripts/build-merchant-dict.ts
 *
 * Deliberately excluded from MERCHANT_SOURCES: the handful of merchant names that
 * merchantLookup.ts only matches safely behind a negative-lookahead or mandatory
 * qualifier — "Shell", "Gap", "Boots", "Marathon", "Pandora", "Steam", "O2", "Co-op",
 * "USAA" — because a bare literal-token match would resurrect exactly the false positives
 * documented in doc §1.4a (e.g. "SHELL BEACH CAFE" -> Gas Station). Where a *safe*, already
 * name-qualified form of one of these exists (e.g. "SHELL OIL", "STEAM PURCHASE") it is
 * included — the qualifier is part of the literal phrase, not a runtime guard, so it can
 * never fire on the unqualified adversarial input.
 *
 * Lookup semantics (mirrored in src/lib/merchantDict.ts): each source phrase becomes a
 * token sequence. A transaction description matches an entry when that exact token
 * sequence appears *anywhere* (not just as a prefix) in the description's normalized
 * tokens (merchant.ts:normalizeMerchant) — trailing/leading noise (store numbers, city
 * names, "INC"/"LLC", order ids) doesn't need to be enumerated, since normalizeMerchant
 * already strips most of it and the scan checks every position. Prefer the SHORTEST phrase
 * that safely and uniquely identifies the merchant. Where a shorter phrase would be
 * ambiguous with a different merchant/category (e.g. "AMAZON" vs "AMAZON.COM PRIME"), add
 * the longer, more specific phrase too — the index prefers the longest match at a given
 * position, so specific entries safely coexist with shorter fallbacks.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Category } from '../src/lib/types'

interface MerchantSource {
  /** Literal merchant phrase, matched as a contiguous token subsequence (case-insensitive,
   *  uppercased at build time; whitespace-delimited exactly like normalizeMerchant's tokens). */
  phrase: string
  category: Category
  subcategory: string
}

// ---------------------------------------------------------------------------
// Curated literal merchant sources
// ---------------------------------------------------------------------------
// Grouped by category for readability; order within a group doesn't matter (the generated
// index sorts candidates by token-sequence length, longest first, independent of source order).

const MERCHANT_SOURCES: MerchantSource[] = [
  // --- Dining ---
  { phrase: 'STARBUCKS', category: 'Dining', subcategory: 'Coffee Shop' },
  { phrase: 'BLUE BOTTLE COFFEE', category: 'Dining', subcategory: 'Coffee Shop' },
  { phrase: 'DUNKIN', category: 'Dining', subcategory: 'Coffee Shop' },
  { phrase: 'COSTA COFFEE', category: 'Dining', subcategory: 'Coffee Shop' },
  { phrase: 'PRET A MANGER', category: 'Dining', subcategory: 'Coffee Shop' },
  { phrase: 'MCDONALDS', category: 'Dining', subcategory: 'Fast Food' },
  { phrase: 'CHIPOTLE', category: 'Dining', subcategory: 'Fast Food' },
  { phrase: 'CHICK-FIL-A', category: 'Dining', subcategory: 'Fast Food' },
  { phrase: 'FIVE GUYS', category: 'Dining', subcategory: 'Fast Food' },
  { phrase: 'SWEETGREEN', category: 'Dining', subcategory: 'Fast Food' },
  { phrase: 'OLIVE GARDEN', category: 'Dining', subcategory: 'Restaurant' },
  { phrase: 'CHEESECAKE FACTORY', category: 'Dining', subcategory: 'Restaurant' },
  { phrase: 'RESY', category: 'Dining', subcategory: 'Restaurant' },
  { phrase: 'DOORDASH', category: 'Dining', subcategory: 'Food Delivery' },
  { phrase: 'GRUBHUB', category: 'Dining', subcategory: 'Food Delivery' },
  { phrase: 'DELIVEROO', category: 'Dining', subcategory: 'Food Delivery' },
  // Must outrank the bare "UBER" fallback below (longer match wins) so Uber Eats doesn't
  // get classified as rideshare — see merchant.ts:classifyByDictionary.
  { phrase: 'UBER EATS', category: 'Dining', subcategory: 'Food Delivery' },

  // --- Groceries ---
  { phrase: 'WHOLE FOODS MARKET', category: 'Groceries', subcategory: 'Specialty Food' },
  { phrase: 'WHOLEFOODS', category: 'Groceries', subcategory: 'Specialty Food' },
  { phrase: 'WHOLEFDS', category: 'Groceries', subcategory: 'Specialty Food' },
  { phrase: 'TRADER JOES', category: 'Groceries', subcategory: 'Specialty Food' },
  { phrase: "TRADER JOE'S", category: 'Groceries', subcategory: 'Specialty Food' },
  { phrase: 'KROGER', category: 'Groceries', subcategory: 'Supermarket' },
  { phrase: 'SAFEWAY', category: 'Groceries', subcategory: 'Supermarket' },
  { phrase: 'TESCO', category: 'Groceries', subcategory: 'Supermarket' },
  { phrase: "SAINSBURY'S", category: 'Groceries', subcategory: 'Supermarket' },
  { phrase: 'M&S FOOD', category: 'Groceries', subcategory: 'Specialty Food' },
  { phrase: 'INSTACART', category: 'Groceries', subcategory: 'Grocery Delivery' },
  // "COSTCO GAS" / "COSTCO WHSE" must outrank bare "COSTCO" (longer match wins).
  { phrase: 'COSTCO WHSE', category: 'Groceries', subcategory: 'Warehouse Club' },
  { phrase: 'COSTCO', category: 'Groceries', subcategory: 'Warehouse Club' },

  // --- Transport ---
  // "SHELL OIL" / "SHELL SERVICE" — qualified forms only; bare "SHELL" is excluded (see
  // file docstring) because "SHELL BEACH CAFE" is Dining, not a gas station (§1.4a).
  { phrase: 'SHELL OIL', category: 'Transport', subcategory: 'Gas Station' },
  { phrase: 'SHELL SERVICE', category: 'Transport', subcategory: 'Gas Station' },
  { phrase: 'CHEVRON', category: 'Transport', subcategory: 'Gas Station' },
  { phrase: 'COSTCO GAS', category: 'Transport', subcategory: 'Gas Station' },
  { phrase: 'UBER TRIP', category: 'Transport', subcategory: 'Rideshare' },
  { phrase: 'UBER', category: 'Transport', subcategory: 'Rideshare' },
  { phrase: 'LYFT', category: 'Transport', subcategory: 'Rideshare' },
  { phrase: 'GEICO', category: 'Transport', subcategory: 'Auto Insurance' },
  { phrase: 'STATE FARM', category: 'Transport', subcategory: 'Auto Insurance' },
  { phrase: 'TFL TRAVEL', category: 'Transport', subcategory: 'Public Transit' },

  // --- Shopping ---
  { phrase: 'AMAZON.COM PRIME', category: 'Subscriptions', subcategory: 'Streaming' },
  { phrase: 'AMAZON.COM', category: 'Shopping', subcategory: 'Online Retail' },
  { phrase: 'AMAZON', category: 'Shopping', subcategory: 'Online Retail' },
  { phrase: 'AMZN', category: 'Shopping', subcategory: 'Online Retail' },
  { phrase: 'TARGET', category: 'Shopping', subcategory: 'Department Store' },
  { phrase: 'BEST BUY', category: 'Shopping', subcategory: 'Electronics' },
  { phrase: 'HOME DEPOT', category: 'Shopping', subcategory: 'Department Store' },
  { phrase: 'MACYS', category: 'Shopping', subcategory: 'Department Store' },
  { phrase: 'TJ MAXX', category: 'Shopping', subcategory: 'Clothing' },
  { phrase: 'NIKE', category: 'Shopping', subcategory: 'Clothing' },
  { phrase: 'IKEA', category: 'Shopping', subcategory: 'Department Store' },
  { phrase: 'SEPHORA', category: 'Shopping', subcategory: 'Department Store' },
  { phrase: 'APPLE STORE', category: 'Shopping', subcategory: 'Electronics' },

  // --- Subscriptions ---
  { phrase: 'NETFLIX.COM', category: 'Subscriptions', subcategory: 'Streaming' },
  { phrase: 'NETFLIX', category: 'Subscriptions', subcategory: 'Streaming' },
  { phrase: 'SPOTIFY', category: 'Subscriptions', subcategory: 'Streaming' },
  { phrase: 'HULU', category: 'Subscriptions', subcategory: 'Streaming' },
  { phrase: 'DISNEY PLUS', category: 'Subscriptions', subcategory: 'Streaming' },
  { phrase: 'ADOBE', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'GITHUB', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'ANTHROPIC', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'ZOOM.US', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'NOTION.SO', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'NOTION', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'APPLE.COM/BILL', category: 'Subscriptions', subcategory: 'Software/SaaS' },
  { phrase: 'DROPBOX', category: 'Subscriptions', subcategory: 'Cloud Storage' },
  { phrase: 'NYTIMES', category: 'Subscriptions', subcategory: 'News/Media' },

  // --- Entertainment ---
  { phrase: 'AMC THEATRES', category: 'Entertainment', subcategory: 'Movies/Theater' },
  { phrase: 'TICKETMASTER', category: 'Entertainment', subcategory: 'Concert/Event' },
  // "STEAM PURCHASE" — qualified form only; bare "STEAM" is excluded (see file docstring)
  // because "STEAM ROOM DAY SPA" is Health, not the gaming platform (§1.4a).
  { phrase: 'STEAM PURCHASE', category: 'Entertainment', subcategory: 'Gaming' },
  { phrase: 'PLAYSTATION NETWORK', category: 'Entertainment', subcategory: 'Gaming' },
  { phrase: 'TOTAL WINE', category: 'Entertainment', subcategory: 'Nightlife' },

  // --- Health ---
  { phrase: 'CVS PHARMACY', category: 'Health', subcategory: 'Pharmacy' },
  { phrase: 'WALGREENS', category: 'Health', subcategory: 'Pharmacy' },
  { phrase: 'PLANET FITNESS', category: 'Health', subcategory: 'Gym' },
  { phrase: 'EQUINOX', category: 'Health', subcategory: 'Gym' },
  { phrase: 'ASPEN DENTAL', category: 'Health', subcategory: 'Dentist' },
  { phrase: 'WARBY PARKER', category: 'Health', subcategory: 'Vision' },

  // --- Travel ---
  { phrase: 'DELTA AIR LINES', category: 'Travel', subcategory: 'Flight' },
  { phrase: 'UNITED AIRLINES', category: 'Travel', subcategory: 'Flight' },
  { phrase: 'MARRIOTT', category: 'Travel', subcategory: 'Hotel' },
  { phrase: 'HILTON', category: 'Travel', subcategory: 'Hotel' },
  { phrase: 'WESTIN', category: 'Travel', subcategory: 'Hotel' },
  { phrase: 'AIRBNB', category: 'Travel', subcategory: 'Vacation Rental' },
  { phrase: 'HERTZ RENT A CAR', category: 'Travel', subcategory: 'Car Rental' },

  // --- Housing ---
  { phrase: 'PG&E ELECTRIC', category: 'Housing', subcategory: 'Utilities' },
  { phrase: 'PG&E', category: 'Housing', subcategory: 'Utilities' },
  { phrase: 'COMCAST XFINITY', category: 'Housing', subcategory: 'Internet/Cable' },
  { phrase: 'COMCAST', category: 'Housing', subcategory: 'Internet/Cable' },
  { phrase: 'AT&T WIRELESS', category: 'Housing', subcategory: 'Phone Bill' },
  { phrase: 'AT&T', category: 'Housing', subcategory: 'Phone Bill' },
  { phrase: 'VERIZON WIRELESS', category: 'Housing', subcategory: 'Phone Bill' },

  // --- Childcare / Education ---
  { phrase: 'BRIGHT HORIZONS', category: 'Childcare', subcategory: 'Daycare' },
  { phrase: 'KINDERCARE', category: 'Childcare', subcategory: 'Daycare' },
  { phrase: 'MONTESSORI ACADEMY', category: 'Childcare', subcategory: 'Preschool' },
  { phrase: 'NAVIENT STUDENT LOAN', category: 'Education', subcategory: 'Student Loan' },
  { phrase: 'KUMON MATH CENTER', category: 'Education', subcategory: 'Tutoring' },
  { phrase: 'COURSERA', category: 'Education', subcategory: 'Online Course' },

  // --- Transfer / Income ---
  { phrase: 'VENMO', category: 'Transfer', subcategory: 'Transfer' },
  { phrase: 'ZELLE', category: 'Transfer', subcategory: 'Transfer' },
  { phrase: 'DIRECT DEPOSIT', category: 'Income', subcategory: 'Payroll' },
  { phrase: 'ADP PAYROLL', category: 'Income', subcategory: 'Payroll' },
  { phrase: 'EMPLOYER SALARY', category: 'Income', subcategory: 'Payroll' },
  { phrase: 'INTEREST PAYMENT', category: 'Income', subcategory: 'Interest' },
  { phrase: 'INTEREST EARNED', category: 'Income', subcategory: 'Interest' },
  { phrase: 'STATE TAX REFUND', category: 'Income', subcategory: 'Tax Refund' },
  { phrase: 'SIDE JOB', category: 'Income', subcategory: 'Side Income' },

  // --- Other ---
  { phrase: 'CHARITY WATER', category: 'Other', subcategory: 'Donation' },
  { phrase: 'RED CROSS', category: 'Other', subcategory: 'Donation' },
  { phrase: 'PROPERTY TAX', category: 'Other', subcategory: 'Property Tax' },
]

// ---------------------------------------------------------------------------
// Tokenization + index construction
// ---------------------------------------------------------------------------

interface MerchantDictEntry {
  tokens: string[]
  category: Category
  subcategory: string
}

interface MerchantDictData {
  /** Keyed by an entry's first token. Within a bucket, sorted longest-token-sequence-first
   *  so the runtime lookup can take the first structural match at a given position. */
  index: Record<string, MerchantDictEntry[]>
}

function tokenize(phrase: string): string[] {
  return phrase.trim().toUpperCase().split(/\s+/).filter((t) => t.length > 0)
}

function buildIndex(sources: MerchantSource[]): MerchantDictData {
  const index: Record<string, MerchantDictEntry[]> = {}
  const seenPhrases = new Set<string>()

  for (const source of sources) {
    const tokens = tokenize(source.phrase)
    if (tokens.length === 0) {
      throw new Error(`empty merchant phrase in MERCHANT_SOURCES: ${JSON.stringify(source)}`)
    }

    const key = tokens.join(' ')
    if (seenPhrases.has(key)) {
      throw new Error(`duplicate merchant phrase in MERCHANT_SOURCES: "${source.phrase}"`)
    }
    seenPhrases.add(key)

    const entry: MerchantDictEntry = { tokens, category: source.category, subcategory: source.subcategory }
    const bucket = index[tokens[0]] ?? []
    bucket.push(entry)
    index[tokens[0]] = bucket
  }

  for (const bucket of Object.values(index)) {
    bucket.sort((a, b) => b.tokens.length - a.tokens.length)
  }

  return { index }
}

const data = buildIndex(MERCHANT_SOURCES)
const outPath = resolve(__dirname, '../src/lib/merchantDict.generated.json')
writeFileSync(outPath, JSON.stringify(data), 'utf8')

const entryCount = MERCHANT_SOURCES.length
const bucketCount = Object.keys(data.index).length
console.log(`Wrote ${entryCount} merchant entries (${bucketCount} first-token buckets) to src/lib/merchantDict.generated.json`)
