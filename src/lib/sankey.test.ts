import { describe, it, expect } from 'vitest'
import { buildSankeyData } from './sankey'
import type { Transaction } from './types'

function makeTx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-1',
    date: new Date('2024-01-15'),
    description: 'TEST MERCHANT',
    amount: 100,
    type: 'debit',
    category: 'Dining',
    subcategory: 'Restaurant',
    sourceFile: 'test.csv',
    ...overrides,
  }
}

const INCOME_TX = makeTx({
  id: 'income-1',
  description: 'PAYROLL DEPOSIT',
  amount: 5000,
  type: 'credit',
  category: 'Income',
  subcategory: 'Payroll',
})

describe('buildSankeyData — simple mode (default)', () => {
  it('produces cat: nodes for expenses in simple mode', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 200 }),
    ]
    const data = buildSankeyData(txns, {})
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).toContain('cat:Dining')
    expect(nodeIds.some((id) => id.startsWith('sub:'))).toBe(false)
  })

  it('links spending → cat: in simple mode', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Groceries', subcategory: 'Supermarket', amount: 300 }),
    ]
    const data = buildSankeyData(txns, {})
    const link = data.links.find((l) => l.source === 'spending' && l.target === 'cat:Groceries')
    expect(link).toBeDefined()
    expect(link?.value).toBe(300)
  })
})

describe('buildSankeyData — detailed mode', () => {
  it('emits sub: nodes in detailed mode', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 150 }),
      makeTx({ id: 'tx-2', category: 'Dining', subcategory: 'Food Delivery', amount: 80 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).toContain('cat:Dining')
    expect(nodeIds).toContain('sub:Dining/Restaurant')
    expect(nodeIds).toContain('sub:Dining/Food Delivery')
  })

  it('cat: node value equals sum of its sub: nodes', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 150 }),
      makeTx({ id: 'tx-2', category: 'Dining', subcategory: 'Food Delivery', amount: 80 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const catNode = data.nodes.find((n) => n.id === 'cat:Dining')
    expect(catNode?.value).toBe(230)

    const subRestaurant = data.nodes.find((n) => n.id === 'sub:Dining/Restaurant')
    const subDelivery = data.nodes.find((n) => n.id === 'sub:Dining/Food Delivery')
    expect(subRestaurant?.value).toBe(150)
    expect(subDelivery?.value).toBe(80)
  })

  it('links spending → cat: → sub: in detailed mode', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 150 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')

    const spendingToCat = data.links.find(
      (l) => l.source === 'spending' && l.target === 'cat:Dining',
    )
    const catToSub = data.links.find(
      (l) => l.source === 'cat:Dining' && l.target === 'sub:Dining/Restaurant',
    )
    expect(spendingToCat).toBeDefined()
    expect(catToSub).toBeDefined()
    expect(catToSub?.value).toBe(150)
  })

  it('has no spending → sub: direct links (always goes through cat:)', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 150 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const directLinks = data.links.filter((l) => l.source === 'spending' && l.target.startsWith('sub:'))
    expect(directLinks).toHaveLength(0)
  })

  it('groups transactions with the same subcategory together', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Coffee Shop', amount: 5 }),
      makeTx({ id: 'tx-2', category: 'Dining', subcategory: 'Coffee Shop', amount: 6 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const subNode = data.nodes.find((n) => n.id === 'sub:Dining/Coffee Shop')
    expect(subNode?.value).toBe(11)
    // Only one sub: node for Coffee Shop (not two)
    const coffeeNodes = data.nodes.filter((n) => n.id === 'sub:Dining/Coffee Shop')
    expect(coffeeNodes).toHaveLength(1)
  })

  it('falls back to category name as subcategory when subcategory is empty', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Shopping', subcategory: '', amount: 200 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    // Should produce sub:Shopping/Shopping (category name used as fallback)
    const subNode = data.nodes.find((n) => n.id === 'sub:Shopping/Shopping')
    expect(subNode).toBeDefined()
    expect(subNode?.value).toBe(200)
  })

  it('handles multiple categories in detailed mode', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 100 }),
      makeTx({ id: 'tx-2', category: 'Transport', subcategory: 'Gas Station', amount: 60 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).toContain('cat:Dining')
    expect(nodeIds).toContain('cat:Transport')
    expect(nodeIds).toContain('sub:Dining/Restaurant')
    expect(nodeIds).toContain('sub:Transport/Gas Station')
  })

  it('topVendors on sub: nodes reflects vendors within that subcategory', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', description: 'STARBUCKS', category: 'Dining', subcategory: 'Coffee Shop', amount: 5 }),
      makeTx({ id: 'tx-2', description: 'BLUE BOTTLE', category: 'Dining', subcategory: 'Coffee Shop', amount: 7 }),
      makeTx({ id: 'tx-3', description: 'NOBU', category: 'Dining', subcategory: 'Restaurant', amount: 100 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const coffeeNode = data.nodes.find((n) => n.id === 'sub:Dining/Coffee Shop')
    expect(coffeeNode?.topVendors?.map((v) => v.name)).not.toContain('Nobu')
  })

  it('simple mode produces no sub: nodes even when subcategory is set', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 100 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'simple')
    const subNodes = data.nodes.filter((n) => n.id.startsWith('sub:'))
    expect(subNodes).toHaveLength(0)
  })

  it('Savings node still links from spending in detailed mode', () => {
    const txns = [
      INCOME_TX, // $5000 income
      makeTx({ id: 'tx-1', category: 'Dining', subcategory: 'Restaurant', amount: 100 }),
    ]
    const data = buildSankeyData(txns, {}, 0.02, {}, 'detailed')
    const savingsLink = data.links.find(
      (l) => l.source === 'spending' && l.target === 'cat:Savings',
    )
    expect(savingsLink).toBeDefined()
  })
})

describe('buildSankeyData — Uncategorized sink (offline-first partial categorization)', () => {
  it('routes a debit transaction still at the parser default (Other, no subcategory) to cat:Uncategorized', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Other', subcategory: '', amount: 150 }),
    ]
    const data = buildSankeyData(txns, {})
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).toContain('cat:Uncategorized')
    expect(nodeIds).not.toContain('cat:Other')
    const node = data.nodes.find((n) => n.id === 'cat:Uncategorized')
    expect(node?.value).toBe(150)
  })

  it('does not route a transaction genuinely classified as Other (has a subcategory) to Uncategorized', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Other', subcategory: 'Miscellaneous', amount: 150 }),
    ]
    const data = buildSankeyData(txns, {})
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).toContain('cat:Other')
    expect(nodeIds).not.toContain('cat:Uncategorized')
  })

  it('an explicit user override on an unclassified transaction wins over the Uncategorized fallback', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Other', subcategory: '', amount: 150 }),
    ]
    const data = buildSankeyData(txns, { 'tx-1': 'Groceries' })
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).toContain('cat:Groceries')
    expect(nodeIds).not.toContain('cat:Uncategorized')
  })

  it('still excludes Transfer-category transactions entirely (never routed to Uncategorized)', () => {
    const txns = [
      INCOME_TX,
      makeTx({ id: 'tx-1', category: 'Transfer', subcategory: '', amount: 500 }),
      makeTx({ id: 'tx-2', category: 'Dining', subcategory: 'Restaurant', amount: 50 }),
    ]
    const data = buildSankeyData(txns, {})
    const nodeIds = data.nodes.map((n) => n.id)
    expect(nodeIds).not.toContain('cat:Uncategorized')
    expect(nodeIds).not.toContain('cat:Transfer')
  })

  it('an unclassified credit (Income default, no subcategory) still counts as income, not an expense node', () => {
    const txns = [
      makeTx({
        id: 'tx-1',
        description: 'UNKNOWN CREDIT SOURCE',
        type: 'credit',
        category: 'Income',
        subcategory: '',
        amount: 200,
      }),
    ]
    const data = buildSankeyData(txns, {})
    expect(data.totalIncome).toBe(200)
    const nodeIds = data.nodes.map((n) => n.id)
    // No expense node at all — the only 'cat:' node is the unspent-income Savings node
    expect(nodeIds).not.toContain('cat:Uncategorized')
    expect(nodeIds).not.toContain('cat:Income')
  })
})
