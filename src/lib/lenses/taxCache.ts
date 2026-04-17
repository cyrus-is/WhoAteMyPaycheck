import type { TaxArea } from './types'

const CACHE_KEY = 'whoatemypaycheck:tax-cache'

interface TaxCacheEntry {
  taxArea: TaxArea
  ambiguous: boolean
}

type TaxCacheStore = Record<string, TaxCacheEntry>

function hashTx(description: string, amount: number): string {
  return `${amount.toFixed(2)}|${description}`
}

function loadStore(): TaxCacheStore {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as TaxCacheStore) : {}
  } catch {
    return {}
  }
}

function saveStore(store: TaxCacheStore): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {
    // sessionStorage quota exceeded — cache is best-effort
  }
}

export function getTaxCached(description: string, amount: number): TaxCacheEntry | null {
  const store = loadStore()
  return store[hashTx(description, amount)] ?? null
}

export function setTaxCached(description: string, amount: number, entry: TaxCacheEntry): void {
  const store = loadStore()
  store[hashTx(description, amount)] = entry
  saveStore(store)
}

export function clearTaxCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
