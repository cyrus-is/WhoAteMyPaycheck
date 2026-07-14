/**
 * Bundle-size gate for the shipped merchant dictionary (PR-7 acceptance criteria,
 * docs/classification-improvement-fable.md §4 PR-7):
 *
 *   - the merchantDict.generated.json chunk must be <= 90 KB gzipped
 *   - the initial (entry) bundle must be unchanged, i.e. within a small epsilon of the
 *     pre-PR-7 measured baseline — the dictionary must only ever ship as a lazy chunk
 *
 * Runs a real production build via Vite's JS API (no new dependency — vite is already a
 * devDependency) and inspects the Rollup output directly, rather than pattern-matching
 * filenames, so chunk identification survives hash/naming changes.
 *
 *   npx vite-node scripts/check-bundle-size.ts
 */
import { build } from 'vite'
import { gzipSync } from 'node:zlib'
import type { OutputChunk, RollupOutput } from 'rollup'

const MAX_DICT_CHUNK_GZIP_BYTES = 90 * 1024

// Measured on main before PR-7 (index-Bi0uwod3.js), via the exact same zlib.gzipSync(...)
// call this script uses below — not Vite's own CLI-reported "kB" figure, which rounds and
// uses decimal (1000-byte) kilobytes, not binary bytes; mixing the two produced a false
// ~3 KB "regression" during development of this script. A lazy-loader shim
// (the loadMerchantDict/classifyByDictionary call site) necessarily still ships in the
// entry chunk — only the generated JSON itself is lazy — so allow a small epsilon rather
// than requiring byte-for-byte equality.
const BASELINE_ENTRY_GZIP_BYTES = 130455
const MAX_ENTRY_GZIP_GROWTH_BYTES = 2048

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`
}

async function main(): Promise<void> {
  // vite-node's own dev-oriented runtime sets NODE_ENV=development before this script runs,
  // which Vite's define plugin honors over the `mode` build option below — without this,
  // React ships its dev build (extra warnings/checks), badly inflating the measured
  // entry-chunk size relative to a real `vite build` CLI run.
  process.env.NODE_ENV = 'production'
  const result = await build({ logLevel: 'silent', mode: 'production' })
  const output = (Array.isArray(result) ? result[0] : result) as RollupOutput
  const chunks = output.output.filter((o): o is OutputChunk => o.type === 'chunk')

  const dictChunk = chunks.find((c) => c.moduleIds.some((id) => id.includes('merchantDict.generated.json')))
  if (!dictChunk) {
    throw new Error(
      'merchant dictionary chunk not found in build output — check the dynamic import in src/lib/merchantDict.ts',
    )
  }
  const dictGzipBytes = gzipSync(Buffer.from(dictChunk.code, 'utf8')).length
  console.log(`merchant dictionary chunk (${dictChunk.fileName}): ${kb(dictGzipBytes)} gzipped`)
  if (dictGzipBytes > MAX_DICT_CHUNK_GZIP_BYTES) {
    throw new Error(
      `merchant dictionary chunk is ${kb(dictGzipBytes)} gzipped, exceeds the ${kb(MAX_DICT_CHUNK_GZIP_BYTES)} budget (docs/classification-improvement-fable.md §4 PR-7)`,
    )
  }

  const entryChunk = chunks.find((c) => c.isEntry)
  if (!entryChunk) {
    throw new Error('no entry chunk found in build output')
  }
  const entryGzipBytes = gzipSync(Buffer.from(entryChunk.code, 'utf8')).length
  console.log(`entry chunk (${entryChunk.fileName}): ${kb(entryGzipBytes)} gzipped (baseline ${kb(BASELINE_ENTRY_GZIP_BYTES)})`)
  const growth = entryGzipBytes - BASELINE_ENTRY_GZIP_BYTES
  if (growth > MAX_ENTRY_GZIP_GROWTH_BYTES) {
    throw new Error(
      `entry chunk grew by ${kb(growth)} (baseline ${kb(BASELINE_ENTRY_GZIP_BYTES)} -> ${kb(entryGzipBytes)}), exceeds the ${kb(MAX_ENTRY_GZIP_GROWTH_BYTES)} epsilon — the merchant dictionary must stay a lazy chunk, not ship in the initial bundle`,
    )
  }

  console.log('\nBundle-size gate passed: dictionary chunk within budget, initial bundle unchanged.')
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
