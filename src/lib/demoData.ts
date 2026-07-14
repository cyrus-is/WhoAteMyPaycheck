/**
 * Fetches the shipped sample dataset (docs/product-review-fable.md §5 PR-3) as a File so
 * it can flow through the exact same handleFiles pipeline as a user-dropped CSV — no
 * parallel parsing path.
 */
export const DEMO_SAMPLE_PATH = '/samples/sfbay-mid-career-tech-couple/checking.csv'
const DEMO_SAMPLE_NAME = 'checking.csv'

export async function fetchDemoFile(): Promise<File> {
  const res = await fetch(DEMO_SAMPLE_PATH)
  if (!res.ok) {
    throw new Error(`Failed to load sample data (${res.status})`)
  }
  const text = await res.text()
  return new File([text], DEMO_SAMPLE_NAME, { type: 'text/csv' })
}
