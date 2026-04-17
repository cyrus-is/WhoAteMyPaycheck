import type { Category } from '../types'
import type { EssentialsBucket } from './types'

const BUCKET_MAP: Record<Category, EssentialsBucket> = {
  // Hard to reduce — locked-in recurring costs
  Housing:       'fixed-essential',
  Childcare:     'fixed-essential',
  Education:     'fixed-essential',
  Health:        'fixed-essential',
  // Necessary but amount varies month to month
  Groceries:     'variable-essential',
  Transport:     'variable-essential',
  // Recurring discretionary — easy to cancel or reduce
  Subscriptions: 'easy-cut',
  Dining:        'easy-cut',
  Entertainment: 'easy-cut',
  // One-off optional spending
  Shopping:      'discretionary',
  Travel:        'discretionary',
  Other:         'discretionary',
  // Non-expense categories — should not appear on expense side but map safely
  Income:        'discretionary',
  Transfer:      'discretionary',
}

export function mapToEssentialsBucket(category: string): EssentialsBucket {
  return BUCKET_MAP[category as Category] ?? 'discretionary'
}
