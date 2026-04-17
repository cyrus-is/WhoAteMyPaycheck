import Anthropic from '@anthropic-ai/sdk'
import type { Transaction } from '../types'
import type { TaxArea, TaxResult } from './types'
import { getTaxCached, setTaxCached } from './taxCache'

const TAX_AREA_IDS: TaxArea[] = [
  'schedule-a',
  'schedule-c',
  'schedule-se',
  'form-2441',
  'hsa-medical',
  'non-deductible',
]

const VALID_TAX_AREAS = new Set<string>(TAX_AREA_IDS)

const TAX_ALIASES: Record<string, TaxArea> = {
  // Schedule A
  'schedule a': 'schedule-a',
  'itemized': 'schedule-a',
  'itemized deductions': 'schedule-a',
  'charitable': 'schedule-a',
  'mortgage interest': 'schedule-a',
  'property tax': 'schedule-a',
  'state tax': 'schedule-a',
  'salt': 'schedule-a',
  'medical deduction': 'schedule-a',
  // Schedule C
  'schedule c': 'schedule-c',
  'business expense': 'schedule-c',
  'business expenses': 'schedule-c',
  'business': 'schedule-c',
  'home office': 'schedule-c',
  'business travel': 'schedule-c',
  'business meal': 'schedule-c',
  'professional': 'schedule-c',
  // Schedule SE
  'schedule se': 'schedule-se',
  'self employment': 'schedule-se',
  'self-employment': 'schedule-se',
  'freelance income': 'schedule-se',
  'freelance': 'schedule-se',
  // Form 2441
  'form 2441': 'form-2441',
  'dependent care': 'form-2441',
  'childcare': 'form-2441',
  'daycare': 'form-2441',
  'child care': 'form-2441',
  // HSA / Medical
  'hsa': 'hsa-medical',
  'medical': 'hsa-medical',
  'out of pocket medical': 'hsa-medical',
  'dental': 'hsa-medical',
  'vision': 'hsa-medical',
  'healthcare': 'hsa-medical',
  // Non-deductible
  'non deductible': 'non-deductible',
  'nondeductible': 'non-deductible',
  'personal': 'non-deductible',
  'not deductible': 'non-deductible',
}

const SYSTEM_PROMPT = `You are a US tax categorization assistant helping someone prepare their taxes. Your job is to classify bank transactions into IRS tax areas.

For each transaction, assign EXACTLY one of these taxArea strings (use the exact spelling including hyphens):
- schedule-a       → Itemized Deductions (Schedule A): mortgage interest, property tax, state/local taxes, charitable donations to 501(c)(3) organizations, and medical expenses ABOVE 7.5% of AGI threshold. Common examples: Red Cross donation, Charity: Water, county property tax payment, mortgage interest.
- schedule-c       → Business Expenses (Schedule C): deductible business expenses for self-employed people. Home office, business travel (flights and hotels when traveling for work), business meals (50% deductible — restaurant during a business trip or client meeting), professional software and tools (GitHub, Notion, Adobe), professional subscriptions. NOTE: these must be legitimate business expenses, not personal ones.
- schedule-se      → Self-Employment Income (Schedule SE): freelance payments, consulting fees, contractor income, 1099 income. These are CREDIT transactions (money coming in).
- form-2441        → Dependent Care (Form 2441): childcare centers, daycare, after-school programs, summer camps for kids under 13. Examples: Bright Horizons, KinderCare, any daycare center.
- hsa-medical      → HSA / Out-of-Pocket Medical: medical, dental, vision expenses paid out-of-pocket (not reimbursed by insurance). Examples: doctor office visits, dentist, eye exam, prescription drugs, orthodontist, physical therapy.
- non-deductible   → Non-Deductible: everything else — personal groceries, restaurants (unless clearly a business meal), personal clothing, entertainment, personal travel/vacations, personal subscriptions, gym memberships for personal fitness.

IMPORTANT rules:
- Flights and hotels: classify as schedule-c ONLY if the description suggests a business context (conference hotel, short trips mid-week). Otherwise use non-deductible.
- Restaurants: classify as schedule-c ONLY if there is a clear business context. Otherwise use non-deductible.
- Amazon/generic retail: use non-deductible unless the description explicitly says "office supplies" — these are ambiguous.
- Gym memberships: non-deductible (personal fitness is not deductible).
- Streaming/personal subscriptions: non-deductible.
- Professional software (GitHub, Notion, Adobe, Zoom, Anthropic API): schedule-c.

Each transaction includes an amount in dollars. Use it as context:
- A $15 restaurant charge is likely personal dining (non-deductible). A $200 restaurant with a business-sounding merchant could be a client dinner (schedule-c, ambiguous).
- Small recurring charges at software companies ($10-50/mo) are likely SaaS subscriptions (schedule-c for business tools).
- Large medical charges ($500+) are more likely to be significant out-of-pocket expenses (hsa-medical).

Set "ambiguous" to true if the transaction could PLAUSIBLY belong to 2 or more tax areas and you are not confident. Common ambiguous cases: Amazon charge (office supplies or personal?), restaurant (business meal or personal dining?), flight (business travel or vacation?), phone bill (home office deduction or personal?). When ambiguous, still pick your best guess for taxArea, but set ambiguous: true.

IMPORTANT: Respond ONLY with a valid JSON array. No markdown, no explanation, no code fences.
Each element: {"id": "...", "taxArea": "...", "ambiguous": false}

Examples:
{"id":"tx1","taxArea":"schedule-a","ambiguous":false}
{"id":"tx2","taxArea":"schedule-c","ambiguous":false}
{"id":"tx3","taxArea":"non-deductible","ambiguous":false}
{"id":"tx4","taxArea":"hsa-medical","ambiguous":false}
{"id":"tx5","taxArea":"schedule-c","ambiguous":true}`

const BATCH_SIZE = 50
const CONCURRENCY = 5

function normalizeTaxArea(raw: string): TaxArea {
  if (VALID_TAX_AREAS.has(raw)) return raw as TaxArea
  const lower = raw.toLowerCase().trim()
  if (VALID_TAX_AREAS.has(lower)) return lower as TaxArea
  return TAX_ALIASES[lower] ?? 'non-deductible'
}

function parseBatchResponse(text: string, requestedIds: string[]): TaxResult[] {
  if (!text.trim()) {
    throw new Error('Claude returned an empty response for a tax categorization batch.')
  }

  let parsed: unknown
  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    parsed = JSON.parse(stripped)
  } catch {
    throw new Error(
      `Claude returned non-JSON for tax categorization. Raw: ${text.substring(0, 200)}`,
    )
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array from Claude, got: ${typeof parsed}`)
  }

  const results: TaxResult[] = []
  const returnedIds = new Set<string>()

  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const obj = item as Record<string, unknown>

    const id = typeof obj['id'] === 'string' ? obj['id'] : null
    if (!id) continue

    const taxArea = normalizeTaxArea(
      typeof obj['taxArea'] === 'string' ? obj['taxArea'] : 'non-deductible',
    )
    const ambiguous = obj['ambiguous'] === true

    returnedIds.add(id)
    results.push({ id, taxArea, ambiguous })
  }

  // Fill any missing IDs as non-deductible so nothing is silently dropped
  for (const id of requestedIds) {
    if (!returnedIds.has(id)) {
      results.push({ id, taxArea: 'non-deductible', ambiguous: false })
    }
  }

  return results
}

export async function taxCategorize(
  transactions: Transaction[],
  apiKey: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<TaxResult[]> {
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const total = transactions.length
  const allResults: TaxResult[] = []
  let done = 0

  // Resolve cache hits first — only send misses to Claude
  const cacheMisses: Transaction[] = []
  for (const tx of transactions) {
    const cached = getTaxCached(tx.description, tx.amount)
    if (cached) {
      allResults.push({ id: tx.id, ...cached })
      done++
    } else {
      cacheMisses.push(tx)
    }
  }
  onProgress?.(done, total)

  // Split misses into batches
  const batches: Transaction[][] = []
  for (let i = 0; i < cacheMisses.length; i += BATCH_SIZE) {
    batches.push(cacheMisses.slice(i, i + BATCH_SIZE))
  }

  const runBatch = async (batch: Transaction[]): Promise<TaxResult[]> => {
    if (signal?.aborted) throw new Error('Tax categorization cancelled.')
    const items = batch.map((tx) => ({ id: tx.id, description: tx.description, amount: tx.amount }))
    const requestedIds = batch.map((tx) => tx.id)
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(items) }],
    })
    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const results = parseBatchResponse(text, requestedIds)
    // Write results to cache
    const txMap = new Map(batch.map((tx) => [tx.id, tx]))
    for (const r of results) {
      const tx = txMap.get(r.id)
      if (tx) setTaxCached(tx.description, tx.amount, { taxArea: r.taxArea, ambiguous: r.ambiguous })
    }
    return results
  }

  // Run batches with bounded concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    if (signal?.aborted) throw new Error('Tax categorization cancelled.')
    const group = batches.slice(i, i + CONCURRENCY)
    const groupResults = await Promise.all(group.map(runBatch))
    for (const batchResults of groupResults) {
      allResults.push(...batchResults)
      done += batchResults.length
    }
    onProgress?.(Math.min(done, total), total)
  }

  return allResults
}
