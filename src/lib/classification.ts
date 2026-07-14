import type { Transaction } from './types'

/**
 * A transaction still sitting at parser.ts's type-based default (Income for credit / Other
 * for debit) with no subcategory has not been touched by any classification layer yet. This
 * also covers the categorize.ts Claude-failure fallback, which writes {category: 'Other',
 * subcategory: ''} for any transaction (debit or credit) missing from a batch response.
 */
export function isUnclassifiedDefault(tx: Transaction): boolean {
  return (
    tx.subcategory === '' &&
    (tx.category === 'Other' || (tx.type === 'credit' && tx.category === 'Income'))
  )
}

/**
 * The category a transaction should display as: the user's override if present, otherwise
 * "Uncategorized" for still-unclassified transactions instead of silently blending them into
 * a real category. Shared by the Sankey, visibility toggle, and transaction table so they
 * agree on the same name (docs/product-review-fable.md §5 PR-2's "Uncategorized" sink node).
 */
export function displayCategory(tx: Transaction, overrides: Record<string, string>): string {
  const overrideCategory = overrides[tx.id]
  if (overrideCategory !== undefined) return overrideCategory
  return isUnclassifiedDefault(tx) ? 'Uncategorized' : tx.category
}
