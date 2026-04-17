import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { CategorizationModeSelector } from './CategorizationModeSelector'

describe('CategorizationModeSelector', () => {
  it('renders both mode options', () => {
    render(<CategorizationModeSelector mode="simple" onChange={() => {}} />)
    expect(screen.getByLabelText(/simple/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/detailed/i)).toBeInTheDocument()
  })

  it('checks the currently active mode', () => {
    render(<CategorizationModeSelector mode="simple" onChange={() => {}} />)
    expect(screen.getByLabelText(/simple/i)).toBeChecked()
    expect(screen.getByLabelText(/detailed/i)).not.toBeChecked()
  })

  it('checks detailed when mode is detailed', () => {
    render(<CategorizationModeSelector mode="detailed" onChange={() => {}} />)
    expect(screen.getByLabelText(/detailed/i)).toBeChecked()
    expect(screen.getByLabelText(/simple/i)).not.toBeChecked()
  })

  it('calls onChange with "simple" when Simple is selected', () => {
    const onChange = vi.fn()
    render(<CategorizationModeSelector mode="detailed" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/simple/i))
    expect(onChange).toHaveBeenCalledWith('simple')
  })

  it('calls onChange with "detailed" when Detailed is selected', () => {
    const onChange = vi.fn()
    render(<CategorizationModeSelector mode="simple" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText(/detailed/i))
    expect(onChange).toHaveBeenCalledWith('detailed')
  })

  it('shows description text for both options', () => {
    render(<CategorizationModeSelector mode="simple" onChange={() => {}} />)
    expect(screen.getByText(/12 spending categories/i)).toBeInTheDocument()
    expect(screen.getByText(/subcategory breakdown/i)).toBeInTheDocument()
  })

  it('applies active class to the selected option label', () => {
    const { container } = render(<CategorizationModeSelector mode="detailed" onChange={() => {}} />)
    const labels = container.querySelectorAll('.cat-mode-option')
    const activeLabel = Array.from(labels).find((l) => l.classList.contains('cat-mode-option--active'))
    expect(activeLabel?.textContent).toContain('Detailed')
  })
})
