import { describe, it, expect, vi, beforeEach } from 'vitest'
import { categorizeTransactions, normalizeSubcategory, SUBCATEGORY_TAXONOMY } from './categorize'
import { clearCache, setCached } from './categorizationCache'
import type { Transaction } from './types'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn()
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  }
})

async function getMockCreate() {
  const mod = await import('@anthropic-ai/sdk')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).__mockCreate as ReturnType<typeof vi.fn>
}

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2024-01-15'),
    description: 'TEST MERCHANT',
    amount: 50,
    type: 'debit',
    category: 'Other',
    subcategory: '',
    sourceFile: 'test.csv',
    ...overrides,
  }
}

/** Build a mock API response that echoes back a category for each id */
function mockResponse(items: Array<{ id: string; category: string; subcategory: string }>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(items) }],
  }
}

describe('categorizeTransactions', () => {
  beforeEach(async () => {
    clearCache()
    const mockCreate = await getMockCreate()
    mockCreate.mockReset()
  })

  it('returns results for a basic batch', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Coffee Shop' },
      { id: 'tx-2', category: 'Groceries', subcategory: 'Supermarket' },
    ]))

    const txns = [
      makeTx({ id: 'tx-1', description: 'STARBUCKS' }),
      makeTx({ id: 'tx-2', description: 'WHOLE FOODS' }),
    ]
    const results = await categorizeTransactions(txns, 'test-key')
    expect(results).toHaveLength(2)
    // Known merchants are pre-classified without an API call
    expect(results.find((r) => r.id === 'tx-1')?.category).toBe('Dining')
    expect(results.find((r) => r.id === 'tx-2')?.category).toBe('Groceries')
    // No API calls — both merchants matched the static lookup
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('falls back to Claude API for unknown merchants', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Restaurant' },
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'JOES CRAB SHACK 9876' })]
    const results = await categorizeTransactions(txns, 'test-key')
    expect(results).toHaveLength(1)
    expect(results[0].category).toBe('Dining')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('skips API for cache hits and only calls for misses', async () => {
    // Use unknown merchants so they bypass the merchant pre-classifier
    setCached('OBSCURE CAFE 1234', 50, 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })

    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-2', category: 'Groceries', subcategory: 'Supermarket' },
    ]))

    const txns = [
      makeTx({ id: 'tx-1', description: 'OBSCURE CAFE 1234' }),
      makeTx({ id: 'tx-2', description: 'BOBS FARM STAND' }),
    ]
    const results = await categorizeTransactions(txns, 'test-key')

    // Only one API call — tx-1 was served from cache
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(2)
    expect(results.find((r) => r.id === 'tx-1')?.category).toBe('Dining')
    expect(results.find((r) => r.id === 'tx-2')?.category).toBe('Groceries')
  })

  it('makes zero API calls when all transactions are cache hits', async () => {
    setCached('STARBUCKS', 50, 'debit', 'simple', { category: 'Dining', subcategory: 'Coffee Shop' })

    const mockCreate = await getMockCreate()
    const txns = [makeTx({ id: 'tx-1', description: 'STARBUCKS' })]
    const results = await categorizeTransactions(txns, 'test-key')

    expect(mockCreate).not.toHaveBeenCalled()
    expect(results[0].category).toBe('Dining')
  })

  it('writes results to cache so a second call is a cache hit', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Transport', subcategory: 'Gas Station' },
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'SHELL GAS', amount: 60 })]
    await categorizeTransactions(txns, 'test-key')

    // Second call — should be served from cache, no new API call
    mockCreate.mockClear()
    const results2 = await categorizeTransactions(txns, 'test-key')
    expect(mockCreate).not.toHaveBeenCalled()
    expect(results2[0].category).toBe('Transport')
  })

  it('fires concurrent API calls for multiple batches', async () => {
    // 110 transactions → 3 batches (50+50+10); with CONCURRENCY=5 all fire together
    const mockCreate = await getMockCreate()
    mockCreate.mockImplementation(({ messages }: { messages: Array<{ content: string }> }) => {
      const items = JSON.parse(messages[0].content) as Array<{ id: string }>
      return Promise.resolve(mockResponse(
        items.map((item) => ({ id: item.id, category: 'Other', subcategory: '' })),
      ))
    })

    const txns = Array.from({ length: 110 }, (_, i) =>
      makeTx({ id: `tx-${i}`, description: `MERCHANT ${i}`, amount: i }),
    )
    const results = await categorizeTransactions(txns, 'test-key')

    expect(mockCreate).toHaveBeenCalledTimes(3) // 3 batches
    expect(results).toHaveLength(110)
  })

  it('calls onProgress with (0, total) before any batches and updates atomically', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockImplementation(({ messages }: { messages: Array<{ content: string }> }) => {
      const items = JSON.parse(messages[0].content) as Array<{ id: string }>
      return Promise.resolve(mockResponse(
        items.map((item) => ({ id: item.id, category: 'Other', subcategory: '' })),
      ))
    })

    const progressCalls: Array<[number, number]> = []
    const txns = Array.from({ length: 3 }, (_, i) =>
      makeTx({ id: `tx-${i}`, description: `MERCHANT ${i}`, amount: i }),
    )
    await categorizeTransactions(txns, 'test-key', (done, total) => progressCalls.push([done, total]))

    expect(progressCalls.length).toBeGreaterThan(0)
    // First call is at (0, total) from cache resolution pass
    expect(progressCalls[0]).toEqual([0, 3])
    // Final progress call should reach total
    const last = progressCalls[progressCalls.length - 1]
    expect(last[0]).toBe(last[1])
  })

  it('aborts when signal is triggered', async () => {
    const controller = new AbortController()
    controller.abort()

    const mockCreate = await getMockCreate()
    const txns = [makeTx({ id: 'tx-1', description: 'AMAZON', amount: 99 })]

    await expect(
      categorizeTransactions(txns, 'test-key', undefined, controller.signal),
    ).rejects.toThrow(/cancelled/)

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('uses mode as cache key discriminator — simple and detailed cache separately', async () => {
    const mockCreate = await getMockCreate()
    // Use unknown merchant so it bypasses pre-classifier and reaches API
    mockCreate.mockResolvedValueOnce(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Coffee' },
    ]))
    mockCreate.mockResolvedValueOnce(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Coffee Shop' },
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'OBSCURE CAFE 1234', amount: 5 })]

    const simpleResults = await categorizeTransactions(txns, 'test-key', undefined, undefined, 'simple')
    const detailedResults = await categorizeTransactions(txns, 'test-key', undefined, undefined, 'detailed')

    expect(mockCreate).toHaveBeenCalledTimes(2) // Both modes miss their respective caches
    expect(simpleResults[0].subcategory).toBe('Coffee')
    expect(detailedResults[0].subcategory).toBe('Coffee Shop')
  })
})

describe('normalizeSubcategory', () => {
  it('returns the subcategory unchanged when it is already in the taxonomy', () => {
    expect(normalizeSubcategory('Dining', 'Coffee Shop')).toBe('Coffee Shop')
    expect(normalizeSubcategory('Transport', 'Gas Station')).toBe('Gas Station')
    expect(normalizeSubcategory('Subscriptions', 'Software/SaaS')).toBe('Software/SaaS')
  })

  it('matches case-insensitively', () => {
    expect(normalizeSubcategory('Dining', 'coffee shop')).toBe('Coffee Shop')
    expect(normalizeSubcategory('Health', 'PHARMACY')).toBe('Pharmacy')
  })

  it('falls back to the category name for unrecognized subcategories', () => {
    expect(normalizeSubcategory('Dining', 'Sushi Bar')).toBe('Dining')
    expect(normalizeSubcategory('Shopping', 'Hardware Store')).toBe('Shopping')
  })

  it('passes through subcategory unchanged for unknown categories', () => {
    expect(normalizeSubcategory('UnknownCategory', 'Some Sub')).toBe('Some Sub')
  })

  it('all taxonomy entries are recognized by normalizeSubcategory', () => {
    for (const [category, subcategories] of Object.entries(SUBCATEGORY_TAXONOMY)) {
      for (const sub of subcategories) {
        expect(normalizeSubcategory(category, sub)).toBe(sub)
      }
    }
  })
})

describe('categorizeTransactions — detailed mode subcategory enforcement', () => {
  beforeEach(async () => {
    clearCache()
    const mockCreate = await getMockCreate()
    mockCreate.mockReset()
  })

  it('clamps out-of-taxonomy subcategory to category name in detailed mode', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Sushi Place' }, // not in taxonomy
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'NOBU RESTAURANT', amount: 120 })]
    const results = await categorizeTransactions(txns, 'test-key', undefined, undefined, 'detailed')
    // Falls back to category name
    expect(results[0].subcategory).toBe('Dining')
  })

  it('accepts a valid taxonomy subcategory in detailed mode', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Restaurant' },
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'NOBU RESTAURANT', amount: 120 })]
    const results = await categorizeTransactions(txns, 'test-key', undefined, undefined, 'detailed')
    expect(results[0].subcategory).toBe('Restaurant')
  })

  it('does NOT clamp subcategory in simple mode (free-form allowed)', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Sushi Place' }, // unusual but OK in simple
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'NOBU RESTAURANT', amount: 120 })]
    const results = await categorizeTransactions(txns, 'test-key', undefined, undefined, 'simple')
    expect(results[0].subcategory).toBe('Sushi Place')
  })

  it('uses DETAILED_SYSTEM_PROMPT (different system) for detailed mode API call', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Restaurant' },
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'NOBU RESTAURANT', amount: 120 })]
    await categorizeTransactions(txns, 'test-key', undefined, undefined, 'detailed')

    const callArgs = mockCreate.mock.calls[0][0] as { system: string }
    // Detailed prompt mentions the taxonomy table
    expect(callArgs.system).toContain('Rent/Mortgage')
    expect(callArgs.system).toContain('Software/SaaS')
  })

  it('simple mode uses the simple system prompt', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue(mockResponse([
      { id: 'tx-1', category: 'Dining', subcategory: 'Coffee Shop' },
    ]))

    const txns = [makeTx({ id: 'tx-1', description: 'OBSCURE CAFE 1234', amount: 5 })]
    await categorizeTransactions(txns, 'test-key', undefined, undefined, 'simple')

    const callArgs = mockCreate.mock.calls[0][0] as { system: string }
    // Simple prompt should NOT contain the taxonomy table
    expect(callArgs.system).not.toContain('Rent/Mortgage')
  })
})
