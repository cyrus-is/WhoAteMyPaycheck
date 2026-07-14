import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { RecurringPanel } from './RecurringPanel'
import type { RecurringMerchant } from '../lib/budget-types'

function makeMerchant(overrides: Partial<RecurringMerchant> = {}): RecurringMerchant {
  return {
    merchant: 'Netflix',
    category: 'Subscriptions',
    cadence: 'monthly',
    type: 'fixed',
    averageAmount: 15.49,
    lastAmount: 15.49,
    transactionCount: 6,
    ...overrides,
  }
}

describe('RecurringPanel', () => {
  it('renders nothing when there are no recurring merchants', () => {
    const { container } = render(<RecurringPanel merchants={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the merchant list with cadence and amounts', () => {
    render(<RecurringPanel merchants={[
      makeMerchant({ merchant: 'Netflix', averageAmount: 15.49, lastAmount: 15.49 }),
      makeMerchant({ merchant: 'Spotify', averageAmount: 9.99, lastAmount: 9.99, cadence: 'monthly' }),
    ]} />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
    expect(screen.getAllByText('Monthly')).toHaveLength(2)
  })

  it('shows the monthly recurring total, normalized across cadences', () => {
    render(<RecurringPanel merchants={[
      makeMerchant({ merchant: 'Netflix', cadence: 'monthly', averageAmount: 15.49, lastAmount: 15.49 }),
      // Quarterly $30 averages to $10/mo
      makeMerchant({ merchant: 'Adobe', cadence: 'quarterly', averageAmount: 30, lastAmount: 30 }),
    ]} />)
    // 15.49 + (30 / 3) = 25.49
    expect(screen.getByText('$25.49')).toBeInTheDocument()
  })

  it('flags drift greater than 5% between average and last amount', () => {
    render(<RecurringPanel merchants={[
      makeMerchant({ merchant: 'Netflix', averageAmount: 15.49, lastAmount: 17.99 }),
    ]} />)
    // (17.99 - 15.49) / 15.49 ≈ 16.1% — flagged
    expect(screen.getByTitle(/vs average/)).toBeInTheDocument()
  })

  it('does not flag drift of 5% or less', () => {
    render(<RecurringPanel merchants={[
      // 15.49 -> 16.00 is ~3.3% drift — under the 5% threshold
      makeMerchant({ merchant: 'Netflix', averageAmount: 15.49, lastAmount: 16.00 }),
    ]} />)
    expect(screen.queryByTitle(/vs average/)).not.toBeInTheDocument()
  })
})
