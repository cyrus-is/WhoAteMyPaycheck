import { normalizeMerchant } from './merchant'

const CACHE_KEY = 'whoatemypaycheck:cat-cache'

interface CacheEntry {
  category: string
  subcategory: string
}

type CacheStore = Record<string, CacheEntry>

/** Cache key excludes amount — the same merchant classified once at $12 shouldn't need a
 *  fresh API call at $18 (docs/classification-improvement-fable.md §1.2/§2.A). Keyed on the
 *  normalized merchant identity so descriptor variants (store numbers, city suffixes,
 *  stacked processor prefixes) of the same merchant also share one entry. */
function hashTx(description: string, type: string, mode: string): string {
  const { canonical } = normalizeMerchant(description)
  return `${mode}|${type}|${canonical}`
}

function loadStore(): CacheStore {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CacheStore) : {}
  } catch {
    return {}
  }
}

function saveStore(store: CacheStore): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(store))
  } catch {
    // sessionStorage quota exceeded — silently skip; cache is best-effort
  }
}

export function getCached(
  description: string,
  type: string,
  mode: string,
): CacheEntry | null {
  const store = loadStore()
  return store[hashTx(description, type, mode)] ?? null
}

export function setCached(
  description: string,
  type: string,
  mode: string,
  entry: CacheEntry,
): void {
  const store = loadStore()
  store[hashTx(description, type, mode)] = entry
  saveStore(store)
}

export function clearCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
