/**
 * Component test for offline-first categorization + partial Sankey rendering
 * (docs/classification-improvement-fable.md §2.C, docs/product-review-fable.md §5 PR-2).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { App } from './App'
import { detectFormat, parseTransactions } from './lib/parser'
import { detectTransfers } from './lib/transfers'
import { classifyByMerchant } from './lib/merchantLookup'
import { storeApiKey } from './lib/apiKey'

// Node's experimental webstorage shadows jsdom's localStorage with a non-functional stub
// (no --localstorage-file), so install a working in-memory Storage for these tests —
// same pattern as ApiKeyEntry.test.tsx.
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

function loadSampleFile(filename: string): File {
  const content = readFileSync(resolve(__dirname, '../sample-data', filename), 'utf8')
  return new File([content], filename, { type: 'text/csv' })
}

/** Mirrors useCategorization's handleFiles offline pipeline to compute an independent
 *  expected on-device coverage percentage for the fixture, without touching the DOM. */
function expectedOfflineCoveragePercent(filename: string): number {
  const csv = readFileSync(resolve(__dirname, '../sample-data', filename), 'utf8')
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  const mapping = detectFormat(result.meta.fields ?? [], result.data)
  const { transactions } = parseTransactions(filename, result.data, mapping)

  const transferIds = detectTransfers(transactions)
  const nonTransfer = transactions.filter((tx) => !transferIds.has(tx.id))
  const categorized = nonTransfer.filter((tx) => classifyByMerchant(tx.description, tx.type) !== null)

  return Math.round((categorized.length / nonTransfer.length) * 100)
}

async function dropFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('App — offline-first categorization', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.stubGlobal('sessionStorage', createMemoryStorage())
    localStorage.setItem('whoatemypaycheck:how-it-works-seen', '1')
    fetchSpy = vi.fn(() => Promise.reject(new Error('unexpected network request in test')))
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('categorizes ≥80% of transactions on-device with no API key, renders a Sankey, and makes zero network requests', async () => {
    const expectedPercent = expectedOfflineCoveragePercent('bofa-credit-card.csv')
    expect(expectedPercent).toBeGreaterThanOrEqual(80)

    const { container } = render(<App />)

    await dropFile(container, loadSampleFile('bofa-credit-card.csv'))

    // Sankey rendered from offline-only categorization (no API key was ever set)
    await waitFor(() => {
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    // TransactionTable (not RawTable) is showing, confirming hasCategorized flipped true
    expect(screen.getByText('Transactions')).toBeInTheDocument()

    // Coverage banner shows the on-device percentage and prompts for a key
    const banner = screen.getByText(/% categorized on-device\. Add a Claude API key/)
    expect(banner).toHaveTextContent(`${expectedPercent}% categorized on-device.`)

    // No API key was ever provided, so the Claude button must not render
    expect(screen.queryByText(/Categorize remaining/)).not.toBeInTheDocument()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('still renders a Sankey via the Uncategorized sink when a CSV has zero offline merchant hits', async () => {
    const rows = [
      { date: '01/05/2024', description: 'ZZQX UNKNOWN MERCHANT 991', amount: '42.10' },
      { date: '01/12/2024', description: 'PLRVX MERCHANT ID 4471', amount: '18.75' },
      { date: '01/20/2024', description: 'QWKJH RANDOM VENDOR 205', amount: '63.40' },
    ]
    // Self-validating: confirm the fixture genuinely produces zero offline hits, so this test
    // actually exercises the zero-offline-hit path rather than silently passing on a fluke.
    for (const row of rows) {
      expect(classifyByMerchant(row.description, 'debit')).toBeNull()
    }

    const csv = ['Date,Description,Amount', ...rows.map((r) => `${r.date},${r.description},${r.amount}`)].join('\n')
    const file = new File([csv], 'synthetic-unknown.csv', { type: 'text/csv' })

    const { container } = render(<App />)
    await dropFile(container, file)

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    // TransactionTable (not RawTable) renders even though hasCategorized is false
    expect(screen.getByText('Transactions')).toBeInTheDocument()

    // 0% offline coverage — every transaction routes through the Uncategorized sink
    expect(screen.getByText(/0% categorized on-device\. Add a Claude API key/)).toBeInTheDocument()

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows "Categorize remaining N with Claude" only when a key is present and a remainder exists', async () => {
    storeApiKey('sk-ant-test-key', false)
    const { container } = render(<App />)

    await dropFile(container, loadSampleFile('bofa-credit-card.csv'))

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    const button = await screen.findByRole('button', { name: /Categorize remaining \d+ with Claude/ })
    expect(button).toBeInTheDocument()

    // The on-device coverage banner is for the key-free path only — once a key is present
    // the button (with its own remaining-count hint) replaces it.
    expect(screen.queryByText(/% categorized on-device/)).not.toBeInTheDocument()

    // Dropping files and rendering offline-only results makes no network calls —
    // categorization only fires on an explicit click of the button above.
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
