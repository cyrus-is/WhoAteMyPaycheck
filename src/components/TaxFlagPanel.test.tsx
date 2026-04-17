import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TaxFlagPanel } from './TaxFlagPanel'
import type { Transaction } from '../lib/types'
import type { TaxResult } from '../lib/lenses/types'

function makeTx(id: string, description = 'TEST MERCHANT'): Transaction {
  return {
    id,
    date: new Date('2024-01-15'),
    description,
    amount: 50,
    type: 'debit',
    category: 'Shopping',
    subcategory: '',
    sourceFile: 'test.csv',
  }
}

function makeTaxResult(id: string, taxArea: TaxResult['taxArea'], ambiguous = false): TaxResult {
  return { id, taxArea, ambiguous }
}

describe('TaxFlagPanel', () => {
  it('renders nothing when there are no ambiguous transactions', () => {
    const { container } = render(
      <TaxFlagPanel
        transactions={[makeTx('tx-1')]}
        taxResults={[makeTaxResult('tx-1', 'non-deductible', false)]}
        taxOverrides={{}}
        onOverride={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows flagged transactions', () => {
    render(
      <TaxFlagPanel
        transactions={[makeTx('tx-1', 'AMAZON.COM OFFICE')]}
        taxResults={[makeTaxResult('tx-1', 'schedule-c', true)]}
        taxOverrides={{}}
        onOverride={() => {}}
      />,
    )
    expect(screen.getByText('AMAZON.COM OFFICE')).toBeInTheDocument()
    expect(screen.getByText(/1 need review/)).toBeInTheDocument()
  })

  it('calls onOverride when resolve button is clicked', () => {
    const onOverride = vi.fn()
    render(
      <TaxFlagPanel
        transactions={[makeTx('tx-1', 'DELTA AIR LINES')]}
        taxResults={[makeTaxResult('tx-1', 'schedule-c', true)]}
        taxOverrides={{}}
        onOverride={onOverride}
      />,
    )
    fireEvent.click(screen.getByTitle('Accept suggestion'))
    expect(onOverride).toHaveBeenCalledWith('tx-1', 'schedule-c')
  })

  it('calls onOverride when select changes', () => {
    const onOverride = vi.fn()
    render(
      <TaxFlagPanel
        transactions={[makeTx('tx-1', 'RESTAURANT')]}
        taxResults={[makeTaxResult('tx-1', 'schedule-c', true)]}
        taxOverrides={{}}
        onOverride={onOverride}
      />,
    )
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'non-deductible' } })
    expect(onOverride).toHaveBeenCalledWith('tx-1', 'non-deductible')
  })

  it('hides transactions that have been overridden', () => {
    render(
      <TaxFlagPanel
        transactions={[makeTx('tx-1', 'AMAZON PURCHASE'), makeTx('tx-2', 'RESTAURANT')]}
        taxResults={[
          makeTaxResult('tx-1', 'schedule-c', true),
          makeTaxResult('tx-2', 'schedule-c', true),
        ]}
        taxOverrides={{ 'tx-1': 'non-deductible' }}
        onOverride={() => {}}
      />,
    )
    // tx-1 is resolved — should not appear
    expect(screen.queryByText('AMAZON PURCHASE')).not.toBeInTheDocument()
    // tx-2 is still pending
    expect(screen.getByText('RESTAURANT')).toBeInTheDocument()
    expect(screen.getByText(/1 need review/)).toBeInTheDocument()
  })

  it('renders nothing when all flagged items are resolved', () => {
    const { container } = render(
      <TaxFlagPanel
        transactions={[makeTx('tx-1')]}
        taxResults={[makeTaxResult('tx-1', 'schedule-c', true)]}
        taxOverrides={{ 'tx-1': 'schedule-c' }}
        onOverride={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})
