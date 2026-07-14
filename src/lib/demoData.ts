/**
 * Fetches the shipped sample dataset (docs/product-review-fable.md §5 PR-3) as a File so
 * it can flow through the exact same handleFiles pipeline as a user-dropped CSV — no
 * parallel parsing path.
 */
export const DEMO_SAMPLE_PATH = `${import.meta.env.BASE_URL}samples/sfbay-mid-career-tech-couple/checking.csv`
// Deliberately not "checking.csv" — a user's own export is often named exactly that, and
// handleFiles dedupes newly-dropped files by name (useCategorization.ts), so a same-named
// demo file would silently swallow a real drop before the demo state was ever cleared.
const DEMO_SAMPLE_NAME = 'sample-sfbay-tech-couple-checking.csv'

export async function fetchDemoFile(): Promise<File> {
  const res = await fetch(DEMO_SAMPLE_PATH)
  if (!res.ok) {
    throw new Error(`Failed to load sample data (${res.status})`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  // Guards against a static-host SPA fallback returning 200 + index.html for a missing
  // sample path — res.ok would otherwise pass and hand HTML to the CSV parser.
  if (contentType.includes('text/html') || text.trimStart().startsWith('<')) {
    throw new Error('Failed to load sample data (unexpected response)')
  }
  return new File([text], DEMO_SAMPLE_NAME, { type: 'text/csv' })
}
