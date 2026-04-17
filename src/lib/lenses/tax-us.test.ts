import { describe, it, expect, vi, beforeEach } from 'vitest'
import { taxCategorize } from './tax-us'
import { clearTaxCache } from './taxCache'
import type { Transaction } from '../types'

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

async function getMockCreate() {
  const mod = await import('@anthropic-ai/sdk')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).__mockCreate as ReturnType<typeof vi.fn>
}

describe('taxCategorize', () => {
  beforeEach(async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockReset()
    clearTaxCache()
  })

  it('parses a well-formed tax response', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx-1', taxArea: 'schedule-a', ambiguous: false },
        { id: 'tx-2', taxArea: 'hsa-medical', ambiguous: false },
      ])}],
    })

    const txns = [
      makeTx({ id: 'tx-1', description: 'RED CROSS DONATION' }),
      makeTx({ id: 'tx-2', description: 'DR SMITH DENTAL' }),
    ]
    const results = await taxCategorize(txns, 'test-key')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: 'tx-1', taxArea: 'schedule-a', ambiguous: false })
    expect(results[1]).toEqual({ id: 'tx-2', taxArea: 'hsa-medical', ambiguous: false })
  })

  it('parses ambiguous flag correctly', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx-1', taxArea: 'schedule-c', ambiguous: true },
      ])}],
    })

    const results = await taxCategorize([makeTx({ id: 'tx-1' })], 'test-key')
    expect(results[0].ambiguous).toBe(true)
    expect(results[0].taxArea).toBe('schedule-c')
  })

  it('fills missing IDs as non-deductible', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx-1', taxArea: 'schedule-a', ambiguous: false },
        // tx-2 is missing from the response
      ])}],
    })

    const txns = [
      makeTx({ id: 'tx-1' }),
      makeTx({ id: 'tx-2' }),
    ]
    const results = await taxCategorize(txns, 'test-key')
    const missing = results.find((r) => r.id === 'tx-2')
    expect(missing).toBeDefined()
    expect(missing?.taxArea).toBe('non-deductible')
    expect(missing?.ambiguous).toBe(false)
  })

  it('handles malformed JSON gracefully by throwing', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    })

    await expect(taxCategorize([makeTx({})], 'test-key')).rejects.toThrow(/non-JSON/)
  })

  it('normalizes tax area aliases', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx-1', taxArea: 'medical', ambiguous: false },  // alias for hsa-medical
      ])}],
    })

    const results = await taxCategorize([makeTx({ id: 'tx-1' })], 'test-key')
    expect(results[0].taxArea).toBe('hsa-medical')
  })

  it('falls back to non-deductible for unknown tax areas', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        { id: 'tx-1', taxArea: 'completely-unknown-area', ambiguous: false },
      ])}],
    })

    const results = await taxCategorize([makeTx({ id: 'tx-1' })], 'test-key')
    expect(results[0].taxArea).toBe('non-deductible')
  })

  it('strips markdown code fences from response', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n[{"id":"tx-1","taxArea":"form-2441","ambiguous":false}]\n```' }],
    })

    const results = await taxCategorize([makeTx({ id: 'tx-1' })], 'test-key')
    expect(results[0].taxArea).toBe('form-2441')
  })

  it('calls API once per BATCH_SIZE transactions', async () => {
    const mockCreate = await getMockCreate()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    })

    // 51 transactions should produce 2 API calls (50 + 1)
    const txns = Array.from({ length: 51 }, (_, i) => makeTx({ id: `tx-${i}` }))
    await taxCategorize(txns, 'test-key')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('fires concurrent API calls for multiple batches (CONCURRENCY=5)', async () => {
    const mockCreate = await getMockCreate()
    // 110 transactions → 3 batches; all 3 fire concurrently in one round
    mockCreate.mockImplementation(({ messages }: { messages: Array<{ content: string }> }) => {
      const items = JSON.parse(messages[0].content) as Array<{ id: string }>
      return Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(
          items.map((item) => ({ id: item.id, taxArea: 'non-deductible', ambiguous: false })),
        )}],
      })
    })

    const txns = Array.from({ length: 110 }, (_, i) => makeTx({ id: `tx-${i}`, amount: i }))
    const results = await taxCategorize(txns, 'test-key')

    expect(mockCreate).toHaveBeenCalledTimes(3)
    expect(results).toHaveLength(110)
  })
})
