/**
 * Fuzzy/variant category vocabulary -> canonical taxonomy category.
 *
 * Shared by categorize.ts (normalizing Claude's free-form category responses) and
 * bankCategory.ts (harvesting bank-provided category columns, docs/classification-
 * improvement-fable.md §2.D / §4 PR-5) so both resolve the same vocabulary the same way.
 * Lives outside categorize.ts specifically so it has no @anthropic-ai/sdk import — this
 * module needs to be safe to import eagerly (bankCategory.ts runs unconditionally in
 * useCategorization.ts's handleFiles, no API key required).
 */
import { CATEGORIES, type Category } from './types'

export const CATEGORY_ALIASES: Record<string, string> = {
  // Groceries
  grocery: 'Groceries', supermarket: 'Groceries', 'grocery store': 'Groceries',
  'warehouse grocery': 'Groceries', 'grocery delivery': 'Groceries',
  food: 'Groceries',  // generic "Food" → Groceries as the safer default
  'food & drink': 'Groceries', 'food and drink': 'Groceries',
  // Dining
  dining: 'Dining', restaurant: 'Dining', restaurants: 'Dining',
  'dining out': 'Dining', 'eating out': 'Dining',
  'coffee shop': 'Dining', 'coffee shops': 'Dining', coffee: 'Dining',
  'food delivery': 'Dining', takeout: 'Dining', takeaway: 'Dining',
  'fast food': 'Dining',
  // Transport
  gas: 'Transport', transportation: 'Transport', transit: 'Transport',
  rideshare: 'Transport', 'car insurance': 'Transport', parking: 'Transport',
  fuel: 'Transport', 'public transit': 'Transport',
  // Travel
  travel: 'Travel', hotel: 'Travel', hotels: 'Travel',
  airline: 'Travel', airlines: 'Travel', flight: 'Travel', flights: 'Travel',
  accommodation: 'Travel', lodging: 'Travel', vacation: 'Travel',
  // Shopping
  retail: 'Shopping', 'online shopping': 'Shopping', clothing: 'Shopping',
  electronics: 'Shopping', merchandise: 'Shopping', 'online retail': 'Shopping',
  // Entertainment
  entertainment: 'Entertainment', games: 'Entertainment', gaming: 'Entertainment',
  movies: 'Entertainment', concerts: 'Entertainment', sports: 'Entertainment',
  streaming: 'Subscriptions', alcohol: 'Entertainment',
  // Health
  medical: 'Health', healthcare: 'Health', pharmacy: 'Health',
  fitness: 'Health', gym: 'Health', dental: 'Health',
  'health & wellness': 'Health', 'health and wellness': 'Health',
  // Subscriptions
  subscription: 'Subscriptions', subscriptions: 'Subscriptions',
  'streaming services': 'Subscriptions', 'recurring services': 'Subscriptions',
  'ai api service': 'Subscriptions', saas: 'Subscriptions',
  // Childcare
  childcare: 'Childcare', daycare: 'Childcare', 'child care': 'Childcare',
  preschool: 'Childcare', 'pre-school': 'Childcare', 'after school': 'Childcare',
  'summer camp': 'Childcare', nanny: 'Childcare', babysitter: 'Childcare',
  'dependent care': 'Childcare',
  // Education
  education: 'Education', tuition: 'Education', 'school tuition': 'Education',
  'student loan': 'Education', 'student loans': 'Education',
  tutoring: 'Education', 'online course': 'Education', 'online learning': 'Education',
  'test prep': 'Education', university: 'Education', college: 'Education',
  // Housing
  housing: 'Housing', rent: 'Housing', mortgage: 'Housing', home: 'Housing',
  utilities: 'Housing', utility: 'Housing', insurance: 'Housing',
  'phone bill': 'Housing', 'utility bill': 'Housing', 'electric bill': 'Housing',
  'bills & utilities': 'Housing', 'bills and utilities': 'Housing',
  // Income
  income: 'Income', salary: 'Income', payroll: 'Income', interest: 'Income',
  wages: 'Income', deposit: 'Income', 'side job': 'Income',
  // Transfer
  transfer: 'Transfer', transfers: 'Transfer',
  // Other
  miscellaneous: 'Other', misc: 'Other',
  // Deliberately unmapped: bank vocabularies with no home in the current taxonomy
  // (e.g. Chase's "Charity", "Tax") fall through to null rather than a guessed category —
  // see docs/classification-improvement-fable.md §1.4d, scoped out as a taxonomy follow-up.
}

const VALID_CATEGORIES = new Set<string>(CATEGORIES)

/**
 * Resolve a free-form category string (from Claude or a bank's own CSV column) to a
 * canonical taxonomy Category. Returns null — not a guess — when nothing matches, so
 * callers can tell "recognized" from "unrecognized" apart (categorize.ts's Claude
 * normalizer falls back to 'Other' on null; bankCategory.ts's harvester treats null as
 * "no signal" and leaves the transaction for a later layer).
 */
export function resolveCategoryAlias(raw: string): Category | null {
  if (VALID_CATEGORIES.has(raw)) return raw as Category
  const lower = raw.toLowerCase().trim()
  const titled = lower.charAt(0).toUpperCase() + lower.slice(1)
  if (VALID_CATEGORIES.has(titled)) return titled as Category
  const alias = CATEGORY_ALIASES[lower]
  return alias && VALID_CATEGORIES.has(alias) ? (alias as Category) : null
}
