import type { Budget } from './budget-types'

const BUDGET_KEY = 'whoatemypaycheck:budget'

export function saveBudget(budget: Budget): void {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(budget))
}

export function loadBudget(): Budget | null {
  const raw = localStorage.getItem(BUDGET_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Budget
  } catch {
    return null
  }
}

export function clearBudget(): void {
  localStorage.removeItem(BUDGET_KEY)
}
