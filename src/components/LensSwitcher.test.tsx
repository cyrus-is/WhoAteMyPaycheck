import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { LensSwitcher } from './LensSwitcher'
import type { LensId } from '../lib/lenses/types'

describe('LensSwitcher', () => {
  it('renders all three lens buttons', () => {
    render(<LensSwitcher active="spending" onChange={() => {}} taxReady={true} />)
    expect(screen.getByText('Spending')).toBeInTheDocument()
    expect(screen.getByText('Tax (US)')).toBeInTheDocument()
    expect(screen.getByText('Essentials')).toBeInTheDocument()
  })

  it('marks the active lens button as pressed', () => {
    render(<LensSwitcher active="essentials" onChange={() => {}} taxReady={true} />)
    expect(screen.getByText('Essentials').closest('button')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Spending').closest('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the selected lens', () => {
    const onChange = vi.fn()
    render(<LensSwitcher active="spending" onChange={onChange} taxReady={true} />)
    fireEvent.click(screen.getByText('Essentials'))
    expect(onChange).toHaveBeenCalledWith('essentials')
  })

  it('disables Tax button when taxReady is false', () => {
    render(<LensSwitcher active="spending" onChange={() => {}} taxReady={false} />)
    expect(screen.getByText('Tax (US)').closest('button')).toBeDisabled()
  })

  it('enables Tax button when taxReady is true', () => {
    render(<LensSwitcher active="spending" onChange={() => {}} taxReady={true} />)
    expect(screen.getByText('Tax (US)').closest('button')).not.toBeDisabled()
  })

  it('does not fire onChange when clicking disabled Tax button', () => {
    const onChange = vi.fn()
    render(<LensSwitcher active="spending" onChange={onChange} taxReady={false} />)
    fireEvent.click(screen.getByText('Tax (US)'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches between lenses correctly', () => {
    const onChange = vi.fn()
    const { rerender } = render(<LensSwitcher active="spending" onChange={onChange} taxReady={true} />)

    fireEvent.click(screen.getByText('Tax (US)'))
    expect(onChange).toHaveBeenCalledWith('tax-us' as LensId)

    rerender(<LensSwitcher active="tax-us" onChange={onChange} taxReady={true} />)
    expect(screen.getByText('Tax (US)').closest('button')).toHaveAttribute('aria-pressed', 'true')
  })
})
