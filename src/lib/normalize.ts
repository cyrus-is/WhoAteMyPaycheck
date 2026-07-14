/**
 * Shared merchant and income source normalization utilities.
 * Used by sankey.ts (tooltip vendor grouping) and recurring.ts / budget.ts
 * (recurring detection and budget generation).
 */

import { classifyByMerchant } from './merchantLookup'
import { normalizeMerchant } from './merchant'

/** Strip a disambiguating "(...)" suffix from a merchant rule name, e.g.
 *  "Uber (ride)" -> "Uber", "AT&T (generic)" -> "AT&T". Those suffixes exist to keep
 *  merchantLookup.ts's rules readable for developers; they're not meant for display. */
function cleanDisplayName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '')
}

/**
 * Normalize a vendor description to a clean, groupable name.
 * Built on the same merchant identity used for classification (merchantLookup.ts /
 * merchant.ts) so a Sankey tooltip and a categorized transaction never disagree about
 * what merchant a description refers to (docs/classification-improvement-fable.md §1.2/§2.A).
 */
export function normalizeVendorName(description: string): string {
  const match = classifyByMerchant(description)
  if (match) return cleanDisplayName(match.merchant)

  const { canonical } = normalizeMerchant(description)
  if (!canonical) return description.trim()
  return canonical.length > 28 ? canonical.substring(0, 28) + '…' : canonical
}

/**
 * Return true if the description looks like a merchant/vendor credit rather than income.
 * Used by budget generation to exclude retail refunds, restaurant credits, etc. that
 * banks may label as a non-expense category when the real category is a purchase reversal.
 */

// Patterns beyond classifyByMerchant — generic vendor-type words (or bank-shorthand brand
// abbreviations too ambiguous to classify, e.g. bare "M&S") that can't be income.
const VENDOR_INDICATOR_PATTERNS: RegExp[] = [
  /\brestaurant\b/i,
  /\bcafe\b|\bcoffee\s*shop\b|\bcoffee\s*house\b/i,
  /\bpub\b|\btavern\b|\bbar\b/i,
  /\bsupermarket\b|\bgrocery\b|\bgroceries\b/i,
  /\bpharmacy\b|\bchemist\b/i,
  /\bretail\b|\boutlet\b|\bshop\b(?!\s*\w+\s+payment)/i,
  /\bdeli\b|\bbakery\b|\bbutcher\b/i,
  /\bdaycare\b|\bchildcare\b|\bchild\s*care\b|\bpreschool\b/i,
  /\btuition\b|\bstudent\s*loan\b/i,
  /\bm&s\b/i,
]

export function isMerchantCredit(description: string): boolean {
  // A classified merchant is only a "credit that isn't income" if the merchant itself is
  // a spending category (Amazon, Tesco…) — classifyByMerchant also resolves real income
  // (payroll, freelance, bonuses…), which must NOT be excluded here.
  const match = classifyByMerchant(description)
  if (match && match.category !== 'Income') return true
  return VENDOR_INDICATOR_PATTERNS.some((pattern) => pattern.test(description))
}

/** Normalize an income source description to a clean label. */
export function normalizeSource(description: string): string {
  if (/payroll|salary|direct.dep|employer|ach.credit/i.test(description)) return 'Salary'
  if (/interest/i.test(description)) return 'Interest'
  if (/dividend/i.test(description)) return 'Dividends'
  if (/zelle|venmo|cashapp|paypal/i.test(description)) return 'Peer Transfer'
  if (/refund|return/i.test(description)) return 'Refunds'
  return description.length > 28 ? description.substring(0, 28) + '…' : description
}
