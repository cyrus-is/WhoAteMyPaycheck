/**
 * Unified merchant-identity normalizer — the single source of truth for turning a raw
 * bank-statement description into a clean, canonical merchant string.
 *
 * Consumed by merchantLookup.ts (classification), normalize.ts (display names / budget
 * grouping), and categorizationCache.ts (cache key) — see
 * docs/classification-improvement-fable.md §2.A.
 */

export interface NormalizedMerchant {
  /** Cleaned, uppercased, whitespace-collapsed merchant string */
  canonical: string
  /** canonical split on whitespace, for keyword/token matching */
  tokens: string[]
}

/** Known payment-processor prefixes that appear before the real merchant name.
 *  Stripped iteratively (see stripProcessorPrefix) — real descriptors stack, e.g.
 *  "POS DEBIT SQ *BLUE BOTTLE" needs two passes to reach "BLUE BOTTLE". */
export const PROCESSOR_PREFIXES: { pattern: RegExp; processor: string }[] = [
  { pattern: /^SQ \*\s*/i,                    processor: 'Square' },
  { pattern: /^SQC\*\s*/i,                    processor: 'Square Capital' },
  { pattern: /^TST\*\s*/i,                    processor: 'Toast' },
  { pattern: /^TST \*\s*/i,                   processor: 'Toast' },
  { pattern: /^TOAST?\s*\*?\s*/i,             processor: 'Toast' },
  { pattern: /^PAYPAL \*/i,                   processor: 'PayPal' },
  { pattern: /^PP\*/i,                        processor: 'PayPal' },
  { pattern: /^CLOVER\*\s*/i,                 processor: 'Clover' },
  { pattern: /^CLV\*\s*/i,                    processor: 'Clover' },
  { pattern: /^STRIPE\s*\*?\s*/i,             processor: 'Stripe' },
  { pattern: /^SP \*\s*/i,                    processor: 'Shopify' },
  { pattern: /^SHOPPAY \*/i,                  processor: 'Shop Pay' },
  { pattern: /^APL\*\s*/i,                    processor: 'Apple' },
  { pattern: /^APPLE\.COM\/BILL/i,            processor: 'Apple' },
  { pattern: /^GOOGLE \*/i,                   processor: 'Google' },
  { pattern: /^GOOG\*\s*/i,                   processor: 'Google' },
  { pattern: /^DD \*/i,                       processor: 'DoorDash' },
  { pattern: /^DD\*/i,                        processor: 'DoorDash' },
  { pattern: /^GITHUB\s*/i,                   processor: 'GitHub' },
  { pattern: /^GODADDY\s*/i,                  processor: 'GoDaddy' },
  { pattern: /^WPY\*\s*/i,                    processor: 'WorldPay' },
  { pattern: /^CKE\*\s*/i,                    processor: 'Cake (POS)' },
  { pattern: /^POS DEBIT\s*/i,                processor: 'POS' },
  { pattern: /^POS PURCHASE\s*/i,             processor: 'POS' },
  { pattern: /^DEBIT CARD PURCHASE\s*/i,      processor: 'Debit Card' },
  { pattern: /^RECURRING PAYMENT\s*/i,        processor: 'Recurring' },
  { pattern: /^CHECKCARD\s*/i,                processor: 'Check Card' },
]

const MAX_PREFIX_STRIP_PASSES = 5

function stripProcessorPrefixOnce(desc: string): string {
  for (const { pattern } of PROCESSOR_PREFIXES) {
    if (pattern.test(desc)) {
      const stripped = desc.replace(pattern, '').trim()
      // A prefix pattern that consumes the whole string (e.g. "APPLE.COM/BILL" itself
      // is also a PROCESSOR_PREFIXES entry) isn't a prefix here — it's the merchant
      // identifier. Leave it alone rather than stripping it down to nothing.
      if (stripped.length === 0) continue
      return stripped
    }
  }
  return desc
}

/** Strip stacked payment-processor prefixes, e.g. "POS DEBIT SQ *BLUE BOTTLE" -> "BLUE BOTTLE". */
export function stripProcessorPrefix(desc: string): string {
  let current = desc
  for (let i = 0; i < MAX_PREFIX_STRIP_PASSES; i++) {
    const stripped = stripProcessorPrefixOnce(current)
    if (stripped === current) break
    current = stripped
  }
  return current
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
])

/** Strip a trailing "<city words> <ST>" suffix, e.g. "SHELL OIL 57442 SAN FRANCISCO CA" ->
 *  "SHELL OIL 57442 SAN FRANCISCO". Only fires when the last token is a real 2-letter US
 *  state code, so short brand abbreviations (BP, CO-OP, IHG…) are never mistaken for one. */
function stripCityStateSuffix(desc: string): string {
  const match = desc.match(/^(.*\S)\s+([A-Za-z]{2})$/)
  if (!match) return desc
  const [, rest, state] = match
  return US_STATE_CODES.has(state.toUpperCase()) ? rest : desc
}

function stripStoreNumbers(desc: string): string {
  return desc.replace(/#\d+/g, '')
}

/** Strip a trailing processor order id, e.g. "*8N3LQ7PK5". Requires at least one digit so a
 *  real trailing word (e.g. "RESY *RESTAURANT") is never mistaken for an order code. */
function stripTrailingOrderId(desc: string): string {
  return desc.replace(/\*[A-Z0-9]*\d[A-Z0-9]*$/i, '')
}

/** Strip masked card suffixes, e.g. "...4821" or "XXXXXXXXXXXX1234". */
function stripCardLast4(desc: string): string {
  return desc.replace(/\.{3}\d{3,4}\b/g, '').replace(/\b[X*]{2,}\d{4}\b/gi, '')
}

function stripPhoneNumbers(desc: string): string {
  return desc.replace(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g, '')
}

function stripDates(desc: string): string {
  return desc.replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '')
}

/**
 * Normalize a raw bank-statement description into a canonical merchant identity.
 * Uppercases, strips payment-processor prefixes (iteratively), store numbers, trailing
 * order ids, masked card digits, phone numbers, dates, and trailing city/state suffixes,
 * then collapses whitespace.
 */
export function normalizeMerchant(rawDescription: string): NormalizedMerchant {
  let s = rawDescription.trim().toUpperCase()
  s = stripProcessorPrefix(s)
  s = stripTrailingOrderId(s)
  s = stripStoreNumbers(s)
  s = stripCardLast4(s)
  s = stripPhoneNumbers(s)
  s = stripDates(s)
  s = stripCityStateSuffix(s)
  s = s.replace(/\s{2,}/g, ' ').trim()

  return { canonical: s, tokens: s.length > 0 ? s.split(' ') : [] }
}
