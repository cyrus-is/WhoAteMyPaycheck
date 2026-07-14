/**
 * Bank-provided category harvesting — a free, key-free classification layer that reads
 * the Category-like column some banks already export (Chase's "Food & Drink", Monzo's
 * "Groceries") instead of discarding it (docs/classification-improvement-fable.md §2.D
 * / §4 PR-5).
 *
 * Mid-confidence hint, not truth — a bank's own categorization is sometimes wrong (see
 * scripts/generate-golden-corpus.ts's FIXTURE_GOLD comment), so this only fires when the
 * merchant dictionary (merchantLookup.ts) doesn't already know the merchant. Consumers:
 * useCategorization.ts:handleFiles (Layer 4, after the merchant dictionary misses) and
 * evaluate.ts (the offline eval harness).
 */
import type { Category } from './types'
import { resolveCategoryAlias } from './categoryAliases'

export interface BankCategoryClassification {
  category: Category
  subcategory: string
  source: 'bank'
}

/**
 * Translate a bank's own category label to our taxonomy. Returns null when the bank
 * category is missing or has no home in the taxonomy (e.g. Chase's "Charity", "Tax") —
 * never guesses. Also returns null when the alias resolves to Income on a debit (e.g. a
 * bank's "Interest" label meaning interest charged, not earned) — Sankey buckets debits
 * as expenses, so that combination would render an expense-side "Income" node.
 */
export function classifyByBankCategory(
  bankCategory: string | undefined,
  type: 'debit' | 'credit',
): BankCategoryClassification | null {
  if (!bankCategory) return null
  const trimmed = bankCategory.trim()
  if (!trimmed) return null

  const category = resolveCategoryAlias(trimmed)
  if (!category) return null
  if (category === 'Income' && type === 'debit') return null

  return { category, subcategory: trimmed, source: 'bank' }
}
