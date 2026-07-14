import { describe, it, expect } from 'vitest'
import { resolveCategoryAlias, CATEGORY_ALIASES } from './categoryAliases'
import { CATEGORIES } from './types'

describe('resolveCategoryAlias', () => {
  it('resolves an exact canonical category unchanged', () => {
    expect(resolveCategoryAlias('Groceries')).toBe('Groceries')
    expect(resolveCategoryAlias('Transfer')).toBe('Transfer')
  })

  it('resolves a differently-cased canonical category', () => {
    expect(resolveCategoryAlias('groceries')).toBe('Groceries')
    expect(resolveCategoryAlias('SHOPPING')).toBe('Shopping')
  })

  it('resolves known bank/Claude vocabulary through the alias table', () => {
    expect(resolveCategoryAlias('Food & Drink')).toBe('Groceries')
    expect(resolveCategoryAlias('Eating out')).toBe('Dining')
    expect(resolveCategoryAlias('Transfers')).toBe('Transfer')
    expect(resolveCategoryAlias('Home')).toBe('Housing')
    expect(resolveCategoryAlias('Bills & Utilities')).toBe('Housing')
    expect(resolveCategoryAlias('Health & Wellness')).toBe('Health')
    expect(resolveCategoryAlias('Interest')).toBe('Income')
    expect(resolveCategoryAlias('Payroll')).toBe('Income')
  })

  it('is case-insensitive and trims whitespace for alias lookups', () => {
    expect(resolveCategoryAlias('  EATING OUT  ')).toBe('Dining')
  })

  it('returns null for vocabulary with no home in the taxonomy, rather than guessing', () => {
    expect(resolveCategoryAlias('Charity')).toBeNull()
    expect(resolveCategoryAlias('Tax')).toBeNull()
    expect(resolveCategoryAlias('Something Totally Unrecognized')).toBeNull()
  })

  it('every alias value is a real taxonomy category', () => {
    const valid = new Set<string>(CATEGORIES)
    for (const [alias, category] of Object.entries(CATEGORY_ALIASES)) {
      expect(valid.has(category), `alias "${alias}" -> "${category}" is not a valid Category`).toBe(true)
    }
  })
})
