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
import { classifyByDictionary, loadMerchantDict } from './lib/merchantDict'
import { storeApiKey } from './lib/apiKey'
import { DEMO_SAMPLE_PATH } from './lib/demoData'

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

/** Mirrors useCategorization's handleFiles offline pipeline (transfers, then the shipped
 *  dictionary, then the merchant regex table — docs/classification-improvement-fable.md
 *  §4 PR-7) to compute an independent expected on-device coverage percentage for the
 *  fixture, without touching the DOM. bofa-credit-card.csv carries no bank Category
 *  column, so that layer is intentionally omitted here. */
async function expectedOfflineCoveragePercent(filename: string): Promise<number> {
  await loadMerchantDict()
  const csv = readFileSync(resolve(__dirname, '../sample-data', filename), 'utf8')
  const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  const mapping = detectFormat(result.meta.fields ?? [], result.data)
  const { transactions } = parseTransactions(filename, result.data, mapping)

  const transferIds = detectTransfers(transactions)
  const nonTransfer = transactions.filter((tx) => !transferIds.has(tx.id))
  const categorized = nonTransfer.filter(
    (tx) => classifyByDictionary(tx.description) !== null || classifyByMerchant(tx.description, tx.type) !== null,
  )

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
    const expectedPercent = await expectedOfflineCoveragePercent('bofa-credit-card.csv')
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

/**
 * Component test for demo mode (docs/product-review-fable.md §5 PR-3) — the "Try with
 * sample data" button must fetch the shipped sample through the same handleFiles pipeline
 * a real drop uses, not a parallel one.
 */
describe('App — demo mode', () => {
  let fetchSpy: ReturnType<typeof vi.fn>
  const demoCsv = readFileSync(
    resolve(__dirname, '../public/samples/sfbay-mid-career-tech-couple/checking.csv'),
    'utf8',
  )

  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage())
    vi.stubGlobal('sessionStorage', createMemoryStorage())
    localStorage.setItem('whoatemypaycheck:how-it-works-seen', '1')
    fetchSpy = vi.fn((url: string) => {
      if (url === DEMO_SAMPLE_PATH) return Promise.resolve(new Response(demoCsv))
      return Promise.reject(new Error('unexpected network request in test'))
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fresh browser, zero files, zero key: one click populates the Sankey + table, labeled and dismissible', async () => {
    render(<App />)

    expect(screen.queryByText('Transactions')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try with sample data' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(DEMO_SAMPLE_PATH)
    })

    await waitFor(() => {
      expect(document.querySelector('svg')).toBeInTheDocument()
    })
    expect(screen.getByText('Transactions')).toBeInTheDocument()

    // Demo state is clearly labeled
    expect(screen.getByText(/Viewing sample data/)).toBeInTheDocument()

    // Dismiss returns to a clean empty state
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(/Viewing sample data/)).not.toBeInTheDocument()
    expect(screen.queryByText('Transactions')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument()
  })

  it('clears the demo transactions (not just the label) once the user drops their own file', async () => {
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await waitFor(() => {
      expect(screen.getByText(/Viewing sample data/)).toBeInTheDocument()
    })
    expect(screen.getAllByText(/NVIDIA CORPORATION PAYROLL/).length).toBeGreaterThan(0)

    // bofa-credit-card.csv is dated Jan 2024 — fully outside the demo's Jan-Mar 2026 span. If
    // the demo's stale date range or its transactions survived the drop, the real data would
    // either be filtered out (empty state) or shown mixed in with the fictional NVIDIA/mortgage
    // rows instead of replacing them.
    await dropFile(container, loadSampleFile('bofa-credit-card.csv'))

    await waitFor(() => {
      expect(screen.queryByText(/Viewing sample data/)).not.toBeInTheDocument()
    })

    // The fictional demo transactions are gone entirely, not merged in unlabeled
    expect(screen.queryAllByText(/NVIDIA CORPORATION PAYROLL/)).toHaveLength(0)

    // The dropped file's own data renders — proves the stale date range didn't blank it out
    await waitFor(() => {
      expect(container.querySelector('svg')).toBeInTheDocument()
    })
    expect(screen.queryByText(/No income or expenses to display/)).not.toBeInTheDocument()
  })

  it('resets the stale demo date range on explicit Dismiss so a subsequently dropped file renders', async () => {
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await waitFor(() => {
      expect(screen.getByText(/Viewing sample data/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(/Viewing sample data/)).not.toBeInTheDocument()

    // Same disjoint-date fixture as above — this is the exact "try demo, dismiss, drop own
    // CSV" conversion flow the feature exists to drive.
    await dropFile(container, loadSampleFile('bofa-credit-card.csv'))

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeInTheDocument()
    })
    expect(screen.queryByText(/No income or expenses to display/)).not.toBeInTheDocument()
  })

  it('hides "Generate Budget" while demo data is active, so a fictional budget can never be saved', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Try with sample data' }))
    await waitFor(() => {
      expect(screen.getByText(/Viewing sample data/)).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /Generate Budget/ })).not.toBeInTheDocument()
  })

  it('shows an error and leaves the empty state intact when the fetch fails', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error('network down')))
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Try with sample data' }))

    await waitFor(() => {
      expect(screen.getByText('network down')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Viewing sample data/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument()
  })

  it('rejects an HTML response (e.g. an SPA-fallback 200) instead of entering demo mode', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(new Response('<!DOCTYPE html><html><body>Not Found</body></html>', {
        headers: { 'content-type': 'text/html' },
      })),
    )
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Try with sample data' }))

    await waitFor(() => {
      expect(screen.getByText(/Failed to load sample data/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Viewing sample data/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try with sample data' })).toBeInTheDocument()
  })
})
