import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { ApiKeyEntry } from './ApiKeyEntry'
import { storeApiKey } from '../lib/apiKey'

// Node's experimental webstorage shadows jsdom's localStorage with a
// non-functional stub (no --localstorage-file), so install a working
// in-memory Storage for these tests.
function createMemoryStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear: () => {
      store = {}
    },
    getItem: (key: string) => store[key] ?? null,
    key: (index: number) => Object.keys(store)[index] ?? null,
    removeItem: (key: string) => {
      delete store[key]
    },
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }
}

describe('ApiKeyEntry', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.stubGlobal('sessionStorage', createMemoryStorage())
  })

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('shows the key-status pill without a remembered disclosure for a session-only key', () => {
    storeApiKey('sk-ant-test', false)
    render(<ApiKeyEntry onKey={() => {}} hasKey={true} />)
    expect(screen.getByText('Claude API key set')).toBeInTheDocument()
    expect(screen.queryByText('remembered on this device')).not.toBeInTheDocument()
  })

  it('discloses a remembered key next to the key-status pill', () => {
    storeApiKey('sk-ant-test', true)
    render(<ApiKeyEntry onKey={() => {}} hasKey={true} />)
    expect(screen.getByText('Claude API key set')).toBeInTheDocument()
    expect(screen.getByText('remembered on this device')).toBeInTheDocument()
  })

  it('shows the disclosure after submitting with "Remember my key" checked', () => {
    const onKey = vi.fn()
    const { rerender } = render(<ApiKeyEntry onKey={onKey} hasKey={false} />)

    fireEvent.change(screen.getByLabelText(/Claude API key/), {
      target: { value: 'sk-ant-test' },
    })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Save'))
    expect(onKey).toHaveBeenCalledWith('sk-ant-test')

    rerender(<ApiKeyEntry onKey={onKey} hasKey={true} />)
    expect(screen.getByText('remembered on this device')).toBeInTheDocument()
  })

  it('does not show the disclosure after submitting with "Remember my key" unchecked', () => {
    const onKey = vi.fn()
    const { rerender } = render(<ApiKeyEntry onKey={onKey} hasKey={false} />)

    fireEvent.change(screen.getByLabelText(/Claude API key/), {
      target: { value: 'sk-ant-test' },
    })
    fireEvent.click(screen.getByText('Save'))

    rerender(<ApiKeyEntry onKey={onKey} hasKey={true} />)
    expect(screen.getByText('Claude API key set')).toBeInTheDocument()
    expect(screen.queryByText('remembered on this device')).not.toBeInTheDocument()
  })

  it('clears the remembered key when Clear is clicked', () => {
    storeApiKey('sk-ant-test', true)
    const onKey = vi.fn()
    render(<ApiKeyEntry onKey={onKey} hasKey={true} />)

    fireEvent.click(screen.getByText('Clear'))
    expect(onKey).toHaveBeenCalledWith('')
    expect(localStorage.getItem('claude_api_key_saved')).toBeNull()
    expect(localStorage.getItem('claude_api_key_remember')).toBeNull()
  })

  it('discloses localStorage persistence on the "Remember my key" label', () => {
    render(<ApiKeyEntry onKey={() => {}} hasKey={false} />)
    expect(
      screen.getByText(/kept in this browser's localStorage until you clear it/),
    ).toBeInTheDocument()
  })
})
