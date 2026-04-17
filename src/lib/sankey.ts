import type { Transaction } from './types'
import { EXPENSE_CATEGORIES } from './types'
import { normalizeVendorName, normalizeSource } from './normalize'

export interface VendorTotal {
  name: string
  amount: number
}

export interface SankeyNode {
  id: string
  label: string
  value: number
  color: string
  /** Top vendors by spend — populated for expense category nodes only */
  topVendors?: VendorTotal[]
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface SankeyData {
  nodes: SankeyNode[]
  links: SankeyLink[]
  totalIncome: number
  totalExpenses: number
  /** Set when rendering a Tax lens — sum of deductible nodes (Schedule A, C, 2441, HSA) */
  totalDeductible?: number
  /** Set when rendering a Tax lens — sum of Non-Deductible node */
  totalNonDeductible?: number
}

const CATEGORY_COLORS: Record<string, string> = {
  Income: '#68d391',
  Housing: '#fc8181',
  Childcare: '#f687b3',
  Education: '#d6bcfa',
  Groceries: '#f6ad55',
  Dining: '#f9a74b',
  Transport: '#76e4f7',
  Travel: '#4fd1c7',
  Shopping: '#b794f4',
  Entertainment: '#fbb6ce',
  Health: '#90cdf4',
  Subscriptions: '#fed7aa',
  Other: '#a0aec0',
}

const INCOME_COLOR = '#68d391'

export function buildSankeyData(
  transactions: Transaction[],
  overrides: Record<string, string>,
  /** Income sources below this fraction of total are merged into "Other Income". Default 0.02 (2%). */
  mergeThreshold = 0.02,
  /** Extra node colors — merged with CATEGORY_COLORS. Use for lens-specific bucket colors. */
  extraNodeColors: Record<string, string> = {},
  /** 'simple' = 3-column layout (income → spending → categories).
   *  'detailed' = 4-column layout adding subcategory nodes on the right. */
  mode: 'simple' | 'detailed' = 'simple',
): SankeyData {
  const nodeColors = { ...CATEGORY_COLORS, ...extraNodeColors }

  // Apply overrides
  const txns = transactions.map((tx) => ({
    ...tx,
    category: overrides[tx.id] ?? tx.category,
  }))

  // Filter out transfers
  const nonTransfer = txns.filter((tx) => tx.category !== 'Transfer')

  // EXPENSE_CATEGORIES imported from types.ts — credits with an expense category are refunds

  // Separate income and expenses; credits with an expense category are refunds
  const refundTransactions = nonTransfer.filter(
    (tx) => tx.type === 'credit' && EXPENSE_CATEGORIES.has(tx.category),
  )
  const incomeTransactions = nonTransfer.filter(
    (tx) => tx.type === 'credit' && !EXPENSE_CATEGORIES.has(tx.category),
  )
  const expenseTransactions = nonTransfer.filter((tx) => tx.type === 'debit')

  const totalIncome = incomeTransactions.reduce((s, tx) => s + tx.amount, 0)

  // Group income by source label, merging small ones into "Other Income"
  const incomeBySource = new Map<string, number>()
  for (const tx of incomeTransactions) {
    const source = normalizeSource(tx.description)
    incomeBySource.set(source, (incomeBySource.get(source) ?? 0) + tx.amount)
  }

  // Merge income sources below mergeThreshold into "Other Income"
  const threshold = totalIncome * mergeThreshold
  const mergedIncome = new Map<string, number>()
  let otherIncome = 0
  for (const [source, amount] of incomeBySource) {
    if (amount < threshold && incomeBySource.size > 3) {
      otherIncome += amount
    } else {
      mergedIncome.set(source, amount)
    }
  }
  if (otherIncome > 0) mergedIncome.set('Other Income', otherIncome)

  // Group expenses by category, and track vendor totals within each category
  const expenseByCategory = new Map<string, number>()
  const vendorsByCategory = new Map<string, Map<string, number>>()
  for (const tx of expenseTransactions) {
    expenseByCategory.set(tx.category, (expenseByCategory.get(tx.category) ?? 0) + tx.amount)
    if (!vendorsByCategory.has(tx.category)) vendorsByCategory.set(tx.category, new Map())
    const vendorName = normalizeVendorName(tx.description)
    const vendors = vendorsByCategory.get(tx.category)!
    vendors.set(vendorName, (vendors.get(vendorName) ?? 0) + tx.amount)
  }

  // Net refunds against their expense category (and vendor totals)
  for (const tx of refundTransactions) {
    const cat = tx.category
    expenseByCategory.set(cat, (expenseByCategory.get(cat) ?? 0) - tx.amount)
    if (!vendorsByCategory.has(cat)) vendorsByCategory.set(cat, new Map())
    const vendorName = normalizeVendorName(tx.description)
    const vendors = vendorsByCategory.get(cat)!
    vendors.set(vendorName, (vendors.get(vendorName) ?? 0) - tx.amount)
  }

  const totalExpenses = [...expenseByCategory.values()]
    .filter((v) => v > 0)
    .reduce((s, v) => s + v, 0)

  // Build nodes
  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []

  // Central "Spending" node that all income flows through
  nodes.push({
    id: 'spending',
    label: 'Spending',
    value: Math.min(totalIncome, totalExpenses),
    color: '#4a5568',
  })

  // Income source nodes (left side)
  for (const [source, amount] of mergedIncome) {
    const nodeId = `income:${source}`
    nodes.push({
      id: nodeId,
      label: source,
      value: amount,
      color: INCOME_COLOR,
    })
    links.push({
      source: nodeId,
      target: 'spending',
      value: amount,
    })
  }

  if (mode === 'detailed') {
    // ── Detailed mode: 4-column layout ─────────────────────────────────────────
    // Group expense transactions by (category, subcategory) for sub: nodes.
    // subcategory '' (unset) is treated as same as the category name itself.
    const expenseBySubcategory = new Map<string, Map<string, number>>()
    const vendorsBySubcategory = new Map<string, Map<string, number>>()

    for (const tx of expenseTransactions) {
      const sub = tx.subcategory || tx.category   // fallback: use category name
      if (!expenseBySubcategory.has(tx.category)) expenseBySubcategory.set(tx.category, new Map())
      const subMap = expenseBySubcategory.get(tx.category)!
      subMap.set(sub, (subMap.get(sub) ?? 0) + tx.amount)

      const subKey = `${tx.category}/${sub}`
      if (!vendorsBySubcategory.has(subKey)) vendorsBySubcategory.set(subKey, new Map())
      const vendorName = normalizeVendorName(tx.description)
      const vendors = vendorsBySubcategory.get(subKey)!
      vendors.set(vendorName, (vendors.get(vendorName) ?? 0) + tx.amount)
    }

    // Net refunds against their (category, subcategory) bucket
    for (const tx of refundTransactions) {
      const sub = tx.subcategory || tx.category
      if (!expenseBySubcategory.has(tx.category)) expenseBySubcategory.set(tx.category, new Map())
      const subMap = expenseBySubcategory.get(tx.category)!
      subMap.set(sub, (subMap.get(sub) ?? 0) - tx.amount)

      const subKey = `${tx.category}/${sub}`
      if (!vendorsBySubcategory.has(subKey)) vendorsBySubcategory.set(subKey, new Map())
      const vendorName = normalizeVendorName(tx.description)
      const vendors = vendorsBySubcategory.get(subKey)!
      vendors.set(vendorName, (vendors.get(vendorName) ?? 0) - tx.amount)
    }

    // Emit cat: + sub: nodes and links
    for (const [category, amount] of expenseByCategory) {
      if (amount <= 0) continue
      const catNodeId = `cat:${category}`
      nodes.push({
        id: catNodeId,
        label: category,
        value: amount,
        color: nodeColors[category] ?? '#a0aec0',
        // topVendors on cat node aggregated across all subcategories
        topVendors: (() => {
          const vendorMap = vendorsByCategory.get(category)
          return vendorMap
            ? [...vendorMap.entries()]
                .filter(([, amt]) => amt > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, amt]) => ({ name, amount: amt }))
            : []
        })(),
      })
      links.push({ source: 'spending', target: catNodeId, value: amount })

      // Subcategory nodes for this category
      const subMap = expenseBySubcategory.get(category)
      if (subMap) {
        for (const [sub, subAmt] of subMap) {
          if (subAmt <= 0) continue
          const subNodeId = `sub:${category}/${sub}`
          const subKey = `${category}/${sub}`
          const vendorMap = vendorsBySubcategory.get(subKey)
          const topVendors = vendorMap
            ? [...vendorMap.entries()]
                .filter(([, amt]) => amt > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, amt]) => ({ name, amount: amt }))
            : []
          nodes.push({
            id: subNodeId,
            label: sub,
            value: subAmt,
            color: nodeColors[category] ?? '#a0aec0',
            topVendors,
          })
          links.push({ source: catNodeId, target: subNodeId, value: subAmt })
        }
      }
    }
  } else {
    // ── Simple mode: 3-column layout (existing logic) ───────────────────────────
    // Expense category nodes (right side); skip categories fully neutralized by refunds
    for (const [category, amount] of expenseByCategory) {
      if (amount <= 0) continue
      const nodeId = `cat:${category}`
      const vendorMap = vendorsByCategory.get(category)
      const topVendors = vendorMap
        ? [...vendorMap.entries()]
            .filter(([, amt]) => amt > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, amt]) => ({ name, amount: amt }))
        : []
      nodes.push({
        id: nodeId,
        label: category,
        value: amount,
        color: nodeColors[category] ?? '#a0aec0',
        topVendors,
      })
      links.push({
        source: 'spending',
        target: nodeId,
        value: amount,
      })
    }
  }

  // If income > expenses, add "Savings" node
  if (totalIncome > totalExpenses && totalIncome > 0) {
    const savings = totalIncome - totalExpenses
    nodes.push({
      id: 'cat:Savings',
      label: 'Savings',
      value: savings,
      color: '#68d391',
    })
    links.push({
      source: 'spending',
      target: 'cat:Savings',
      value: savings,
    })
  }

  return { nodes, links, totalIncome, totalExpenses }
}

// normalizeVendorName and normalizeSource are imported from ./normalize
