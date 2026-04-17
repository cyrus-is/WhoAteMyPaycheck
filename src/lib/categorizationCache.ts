const CACHE_KEY = 'whoatemypaycheck:cat-cache'

interface CacheEntry {
  category: string
  subcategory: string
}

type CacheStore = Record<string, CacheEntry>

function hashTx(description: string, amount: number, type: string, mode: string): string {
  // Simple deterministic key — no crypto needed, just collision-resistant enough for this use case
  return `${mode}|${type}|${amount.toFixed(2)}|${description}`
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
  amount: number,
  type: string,
  mode: string,
): CacheEntry | null {
  const store = loadStore()
  return store[hashTx(description, amount, type, mode)] ?? null
}

export function setCached(
  description: string,
  amount: number,
  type: string,
  mode: string,
  entry: CacheEntry,
): void {
  const store = loadStore()
  store[hashTx(description, amount, type, mode)] = entry
  saveStore(store)
}

export function clearCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}
