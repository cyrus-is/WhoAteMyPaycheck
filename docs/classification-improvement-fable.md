# Classification Improvement Plan — 100% In-Browser

**Status:** proposal · **Author:** Claude (Fable 5) · **Date:** 2026-07-12
**Scope:** improve transaction classification accuracy while keeping everything client-side — no backend, no server round-trips, no new cloud ML dependency. All numbers marked *measured* were produced by running the actual `classifyByMerchant` code against `sample-data/` fixtures and adversarial probes (methodology in §5).

---

## TL;DR

Classification today is a 4-layer waterfall: transfer heuristics → 537 hand-written merchant regexes → an exact-match sessionStorage cache → the Claude API (BYOK). Measured offline hit rate on the repo's own fixtures is **81.6%**, but the offline layers **never run unless the user has entered an API key**, corrections the user makes are **thrown away on refresh**, and the regex table has confirmed false positives (a beach café classified as a gas station, a jewelry store as a streaming subscription).

The highest-leverage improvements are not ML. They are: (1) a single shared merchant normalizer, (2) persisting user corrections as a local merchant→category dictionary that outranks everything else, (3) running the offline layers key-free, and (4) a confidence-scored resolver with a review queue. A small on-device linear model is worth considering *last*, at ~100 KB; embedding models (transformers.js) are not worth their 25–30 MB for this problem.

---

## 1. How classification works today

### 1.1 The pipeline (files and functions)

```
CSV drop
  → readCsv.ts / parser.ts:detectFormat + parseTransactions   (format sniffing, sign conventions)
  → hooks/useCategorization.ts:handleFiles
      → lib/transfers.ts:detectTransfers          [Layer 0 — runs at load, no key needed]
  → user clicks "Categorize" (button gated on !!apiKey — useCategorization.ts:65-66)
  → lib/categorize.ts:categorizeTransactions      (lazy-imported at useCategorization.ts:151)
      → lib/merchantLookup.ts:classifyByMerchant  [Layer 1 — 537 regex rules]
      → lib/categorizationCache.ts:getCached      [Layer 2 — sessionStorage, exact key]
      → Claude API (claude-sonnet-4-6)            [Layer 3 — batches of 50, concurrency 5]
  → hooks/useCategorization.ts:handleOverride     [Layer 4 — manual, in-memory only]
```

**Layer 0 — transfer detection** (`transfers.ts:detectTransfers`). Two phases: (a) keyword patterns for transfer services and credit-card autopay phrases ("PAYMENT THANK YOU", "AUTOPAY PAYMENT"); (b) for multi-file uploads, debit/credit pairs with the same amount ±1% within 3 days across different files. Matches get `category: 'Transfer'` and are excluded from all later layers (`useCategorization.ts:140`, `:165`).

**Layer 1 — static merchant regexes** (`merchantLookup.ts`). 537 `MerchantRule` entries in `ALL_RULES`, first-match-wins, priority set by category-array concatenation order (Income → Transfer → Subscriptions → Transport → Groceries → … → Housing, `merchantLookup.ts:772-799`). If nothing matches the raw uppercased description, one processor prefix (`SQ *`, `TST*`, `PAYPAL *`, … — 27 patterns in `PROCESSOR_PREFIXES`) is stripped and the table is retried once (`classifyByMerchant`, `merchantLookup.ts:811-841`). A match is total confidence — there is no score, no runner-up, no "weak match" concept.

**Layer 2 — categorization cache** (`categorizationCache.ts`). sessionStorage map keyed `` `${mode}|${type}|${amount.toFixed(2)}|${description}` `` (`hashTx`, `categorizationCache.ts:10-13`). Exact-match only, includes the amount, dies with the tab.

**Layer 3 — Claude API** (`categorize.ts:categorizeTransactions`). Remaining misses go to `claude-sonnet-4-6` in batches of `BATCH_SIZE = 50` at `CONCURRENCY = 5`, 3 attempts with backoff. Prompt (`SYSTEM_PROMPT` / `DETAILED_SYSTEM_PROMPT`) embeds the taxonomy, merchant examples, and amount-context heuristics ("a $5 Starbucks charge is Coffee Shop; $200+ might be catering"). Responses are repaired by `normalizeCategory` + `CATEGORY_ALIASES` (~90 fuzzy aliases) and `normalizeSubcategory` (detailed-mode clamp); transactions Claude drops from the response are backfilled as `Other` (`categorize.ts:297-301`).

**Layer 4 — user overrides** (`useCategorization.ts:129-131`). A `Record<txId, category>` in React state. Category only (no subcategory — see `TransactionTable.tsx:60-68`), keyed by `tx-${counter}` ids that are regenerated every parse (`parser.ts:245`), consulted at render time all over `App.tsx` (`cat.overrides[tx.id] ?? tx.category`). Not persisted, not written to the cache, not generalized to identical descriptions.

**Inputs to classification:** `description`, `amount`, `type` (debit/credit). Date is used only by transfer pairing and recurring detection, never by the classifier. Notably, **bank-provided category columns are parsed and discarded** — `chase-checking.csv` has `Category` ("Food & Drink", "Home") and `monzo-uk.csv` has `Category` ("Groceries", "Eating out"), but `parser.ts:detectFormat` maps only date/description/amount/debit/credit/type.

### 1.2 Structural problems (before any accuracy discussion)

1. **The offline layers are gated behind the API key.** `handleCategorize` bails on `!apiKey` (`useCategorization.ts:134`) and the button doesn't render without one (`:65-66`). A user without a key gets *zero* categorization — even though Layer 1 alone measures 81.6% coverage on the fixtures. The strongest free asset in the codebase is unreachable in the no-key state.
2. **Corrections evaporate.** Overrides live in component state keyed by ephemeral ids. Refresh the tab, re-upload the same CSV → every correction must be redone, and the same Claude tokens are re-spent (cache is session-scoped too).
3. **Four disjoint merchant-knowledge bases.** `merchantLookup.ts:ALL_RULES` (537 rules), `normalize.ts:MERCHANT_MAP` (~44 rules, used by Sankey tooltips / `recurring.ts` / `budget.ts`), `transfers.ts:TRANSFER_PATTERNS`, and the merchant examples inside the LLM prompts. They drift: e.g. classification can say a transaction is `Transport/Gas Station` (Costco Gas rule) while `normalizeVendorName` groups it separately for budgeting; "ONLINE TRANSFER" is a transfer in `transfers.ts` but unknown to `merchantLookup.ts`.
4. **The cache key contains the exact amount** (`categorizationCache.ts:12`). "THAI SPICE HOUSE" at $23.50 and $31.20 are two different cache entries → two API classifications. For variable-amount merchants (most dining/groceries — exactly the ones the regex table misses) the cache is nearly useless across visits.
5. **No confidence anywhere.** A regex hit, a cache hit, and an LLM guess are all presented identically. The user has no way to know which 5% to double-check, and the app has no basis for deciding when to defer to a stronger layer.

### 1.3 Measured baseline

Ran the real `classifyByMerchant` (bundled from `src/lib/merchantLookup.ts` via esbuild, unmodified) over the description column of every fixture in `sample-data/`:

| Fixture | Offline hit rate |
|---|---|
| amex-gold.csv | 146/164 (89%) |
| chase-checking.csv | 206/239 (86%) |
| credit-union-checking.csv | 180/209 (86%) |
| bofa-credit-card.csv | 151/195 (77%) |
| monzo-uk.csv | 135/196 (69%) |
| **Total** | **818/1003 (81.6%)** |

Caveats: fixtures are synthetic and merchant-friendly; real statements skew messier (more local merchants, more descriptor garbage), so treat 81.6% as an optimistic upper bound for Layer-1 coverage — but note it comfortably beats the "~50-60%" claimed in the file's own header comment (`merchantLookup.ts:4`). Hit rate ≠ accuracy: a hit can be wrong (§1.4a). Some misses (e.g. "ONLINE TRANSFER TO SAV", "PAYMENT THANK YOU") are handled upstream by Layer 0, so effective offline coverage is a few points higher.

### 1.4 Failure taxonomy (each mode verified against the actual code)

**(a) Ambiguous merchants / regex false positives.** First-match-wins with overly loose patterns misfires with full confidence. All of these are *measured* outputs of the current `classifyByMerchant`:

| Input | Current output | Should be | Offending rule |
|---|---|---|---|
| `SHELL BEACH CAFE SAN LUIS OBISPO` | Transport/Gas Station | Dining | `/\bSHELL\b.*(?:OIL\|SVC\|SERVICE)?/` — the qualifier group is optional, so it's really just `\bSHELL\b` |
| `O2 ARENA LONDON EVENT` | Housing/Phone Bill | Entertainment | `/\bO2\b/` |
| `PANDORA JEWELRY #442` | Subscriptions/Streaming | Shopping | `/\bPANDORA\b/` |
| `STEAM ROOM DAY SPA` | Entertainment/Gaming | Health | optional group in `/\bSTEAM\b.*(?:GAMES\|PURCHASE)?/` |
| `GAP INSURANCE PREMIUM AUTO` | Shopping/Clothing | Transport/Insurance | optional group in `/\bGAP\b.*(?:STORE\|#)?/` |
| `RIVERSIDE ELECTRIC CO-OP` | Groceries/Supermarket | Housing/Utilities | `/\bCO[\s-]*OP\b/` (UK grocery rule) |
| `BOOTS AND SADDLES WESTERN WEAR` | Health/Pharmacy | Shopping | `/\bBOOTS\b/` (UK pharmacy) |
| `MARATHON SPORTS RUNNING SHOES` | Transport/Gas Station | Shopping | optional group in `/\bMARATHON\b.*(?:PETRO)?/` |
| `USAA TRANSFER TO CHECKING` | Transport/Auto Insurance | Transfer | `/\bUSAA\b/` — USAA is also a bank |
| `ACH CREDIT ACME CORP` (payroll) | Transfer/Transfer | Income/Payroll | `/ACH\s*(?:TRANSFER\|CREDIT\|DEBIT\|PMT)/` swallows payroll ACH credits that lack the word "PAYROLL" |

The recurring anti-pattern: `(?:...)?` optional qualifier groups that were meant to require context but require nothing, and brand names that collide with common words. The amount-context heuristics exist **only in the LLM prompt** (`categorize.ts:68-71`); the regex layer is amount-blind, so `WM SUPERCENTER GROCERY` → Shopping/Department Store regardless of signal.

**(b) Unknown / new merchants.** No generic fallback heuristics at all — a miss goes straight to the API (or, keyless, stays uncategorized). Measured fixture misses include entire structural classes, not just obscure brands: `RENT PAYMENT - OAKWOOD APTS` (rent! the largest line item in most budgets — there is no generic RENT rule), `GYM MEMBERSHIP`, `DOCTORS MEDICAL GROUP`, `VALENTIN RESTAURANT`, `YEAR END BONUS`, `PAYPAL *FREELANCE` (prefix strips cleanly, then "FREELANCE" matches nothing).

**(c) Descriptor variants of known merchants.** `AMAZON MKTPLACE PMTS` — a top-3 real-world descriptor — misses because the Amazon rule enumerates `AMZN MKTP|AMAZON.COM|AMZN.COM|AMAZON MAR` and this variant is `AMAZON MKT…`. Enumerated-literal regexes lose to descriptor drift; this is a normalization problem, not a coverage problem.

**(d) Taxonomy gaps.** `CHARITY WATER DONATION`, `AMERICAN RED CROSS DONATION`, `COUNTY PROPERTY TAX PAYMENT` have no home in the 14-category taxonomy (`types.ts:25-39`) and land in `Other` even when the API classifies them. Donations/Giving, Taxes/Government, Fees/Interest, Pets, and Personal Care are the obvious absentees.

**(e) Splits, recurring, transfers.** Phase-2 transfer pairing (`transfers.ts:44-76`) will happily pair a $50 restaurant debit on the card with an unrelated $50 Venmo credit in checking (same amount ±1%, ≤3 days, different files — no description similarity check). It also runs only inside `handleFiles`, so removing a file leaves the surviving half of a pair permanently marked `Transfer`. Recurring detection (`recurring.ts`) exists but feeds only budgets — cadence is never used as a classification signal ("unknown merchant, fixed $12.99 monthly" is a near-certain Subscription).

**(f) Edge formats.** `detectDateOrder` (`parser.ts:52`) defaults ambiguous slash dates to MM/DD — a UK statement covering only days 1–12 parses silently wrong (wrong dates → wrong transfer pairing and cadence windows, which feed classification). Amount sign conventions are heuristic (`positiveIsCredit`). And per §1.1, bank-supplied category columns are discarded — free ground truth thrown away.

**(g) LLM-layer inconsistency.** Same merchant in different batches can get different answers (nothing enforces cross-batch consistency); free-form subcategories in simple mode fragment groupings ("Coffee Shop" vs "Coffee"); silent `Other` backfill for dropped ids (`categorize.ts:297-301`) means an API hiccup quietly degrades a batch. Because the cache key includes the amount, "consistency via cache" only works for fixed-amount merchants within one tab session.

---

## 2. Improvement design (all 100% in-browser)

Current relevant budget facts: initial bundle already excludes `@anthropic-ai/sdk` and `merchantLookup.ts` (lazy import at `useCategorization.ts:151`); `merchantLookup.ts` alone bundles to 62 KB / **12.4 KB gzipped**; CSP is `connect-src 'self' https://api.anthropic.com` (`index.html:7`) — every proposal below needs **zero CSP changes** (same-origin assets are `'self'`).

### A. Unified merchant normalizer — `lib/merchant.ts` *(the keystone)*

One exported `normalizeMerchant(description): { canonical: string; tokens: string[] }` that: uppercases; strips processor prefixes **iteratively** (real descriptors stack: `POS DEBIT SQ *BLUE BOTTLE` needs two passes — today's `stripProcessorPrefix` strips one); strips store numbers (`#123`), trailing order ids (`*8N3LQ7PK5`), phone numbers, city/state suffixes (`SAN LUIS OBISPO CA`), dates, and last-4 card digits; collapses whitespace. Consumers: `classifyByMerchant`, `normalizeVendorName` (kills the `normalize.ts` fork), `recurring.ts` grouping, the cache key, and the correction dictionary (C).

Then fix the confirmed false-positive rules from §1.4a (make qualifier groups mandatory, add negative guards, demote ACH-credit to a weak signal) and add ~30 generic keyword rules for the measured structural misses (RENT/LEASE/APTS/PROPERTY MGMT → Housing; DONATION/charity names → Giving; MEDICAL/DENTAL/CLINIC → Health; GYM/FITNESS MEMBERSHIP → Health; BONUS/COMMISSION credits → Income; PROPERTY TAX → Taxes).

- **Expected lift:** kills the whole §1.4a false-positive class and the §1.4c variant-miss class; on the fixtures, keyword rules alone recover most of the 185 misses (rent + gym + donations + medical account for ~60% of them). Estimate: fixture coverage 81.6% → ~92%, and — more importantly — hits become trustworthy.
- **Browser cost:** ~0. A few KB of code; normalization is string ops, < 1 µs/tx.
- **Complexity:** M (touches 4 call sites; needs a regression corpus first — see PR-1).

### B. Persist user corrections as a local dictionary — Layer -1 *(highest accuracy-per-cost)*

On `handleOverride`, write `normalizeMerchant(tx.description).canonical → { category, count, lastUsed }` to a localStorage store (`lib/correctionStore.ts`). Consult it **before** every other layer. Offer "apply to 7 similar transactions" in the UI (same canonical merchant), and extend the override control to subcategories while at it (today it's category-only).

Personal spending is person-locally Zipfian: a user's statements repeat the same ~100–300 merchants. One correction to "VALENTIN RESTAURANT" fixes it forever — this month, next month, every future upload — and permanently removes those tokens from the Claude bill. It is also the only layer that can learn *this user's* semantics ("Costco is Groceries for me, not Shopping").

- **Expected lift:** compounds monotonically; after 2–3 months of use the effective accuracy on a user's own data approaches 100% for repeated merchants regardless of how weak the other layers are. Immediate UX lift: corrections stop being Sisyphean.
- **Browser cost:** ~0 bundle; a few KB of localStorage.
- **Complexity:** S–M (store + lookup are trivial; the "apply to similar" UI and the privacy toggle are the work).
- **Privacy note:** stores normalized merchant names (derived from descriptions) in localStorage. The security rules say never *persist* raw bank data; the existing sessionStorage cache already stores full raw descriptions, so the precedent is "descriptions ≠ forbidden, but session-scoped". For localStorage, ship it behind an explicit opt-in ("Remember my corrections on this device"), store *only* merchant + category (no amounts, dates, or account data), and add a "Clear learned categories" button. Hashing the keys (SHA-256) is an option but costs debuggability and fuzzy matching; opt-in plaintext is the better trade.

### C. Offline-first: decouple the free layers from the API key

Run `classifyByMerchant` (+ corrections dictionary) inside `handleFiles`, at load, unconditionally. The Sankey renders immediately from offline results; the key-gated button becomes "Categorize the remaining N with Claude". Move the `new Anthropic(...)` construction in `categorizeTransactions` (`categorize.ts:314`) below the offline layers so the no-key path never touches the SDK.

- **Expected lift:** not accuracy per se — *availability*. ~80% of the product value with zero setup, and a marketing-grade claim ("works with no API key, nothing leaves your machine at all"). Also cuts Claude spend for keyed users since obviously-known merchants never reach the button's count.
- **Browser cost:** moves the 12.4 KB gz lookup chunk earlier (still lazy-loadable on first file drop).
- **Complexity:** S.

### D. Harvest bank-provided category columns

Extend `detectFormat` to map a `Category`-like column, and translate bank vocabularies through the existing `CATEGORY_ALIASES` table (`categorize.ts:144-199` — "Food & Drink", "Eating out" already resolve). Use as a mid-confidence hint, not truth (Chase's own categories are mediocre).

- **Expected lift:** on Chase/Monzo-style exports, covers a chunk of exactly the long tail the regexes miss (the bank has already resolved the merchant entity). Estimate +3–8% coverage on statements that carry the column, ~0 on those that don't.
- **Browser cost:** ~0. **Complexity:** S.

### E. Confidence-scored resolver + review queue

Replace the boolean waterfall with a resolver where every layer emits `{ category, subcategory, confidence, source }`: corrections 1.0 · exact dictionary/regex 0.9 (0.75 for the loose generic-keyword rules) · bank column 0.6 · amount/cadence priors 0.55–0.65 · LLM 0.85. Highest confidence wins; below ~0.6 → `Other` + `needsReview` flag. Add the priors that today exist only in prose in the LLM prompt: credit + round-ish + 14/30-day cadence → Income/Payroll; unknown merchant + fixed amount + monthly cadence (reuse `detectRecurring`) → Subscriptions; airline merchant + amount < $75 → Transport fee. Surface a "review these 12" list sorted by amount — this converts residual error from silent misinformation into a 30-second task, and every review feeds layer B.

- **Expected lift:** indirect but structural — it's what makes A–D composable, lets weak signals participate safely, and concentrates user attention where the model is guessing. The review→correction loop is the accuracy flywheel.
- **Browser cost:** ~0. **Complexity:** M (touches the `Transaction` type: add `confidence`/`source`; UI work).

### F. Shipped merchant dictionary (build-time generated, lazy chunk)

The 537 regexes are hand-maintained code. Convert the *literal* ones to data: a build-time-generated token-indexed dictionary (top ~5,000 US/UK merchants with descriptor variants, generatable offline with Claude against public merchant lists — build-time, not runtime, so still zero runtime cloud dependency). Keep regexes only for genuinely positional patterns. Lookup: exact token / prefix match on the normalized string, O(tokens).

- **Expected lift:** +5–10% coverage on real-world (non-fixture) data; near-zero on the friendly fixtures. Main win is maintainability and the UK/EU tail (Monzo fixture is the worst performer at 69%).
- **Browser cost:** extrapolating from 537 rules = 12.4 KB gz → ~5,000 entries ≈ **50–90 KB gz** as a lazy-loaded same-origin JSON chunk. Parse < 50 ms, memory ~2–5 MB. Acceptable; keep it out of the initial bundle.
- **Complexity:** M (build script + data sourcing + tests).

### G. Optional on-device ML — the honest assessment

Bank descriptors are **entity identifiers, not natural language**. "OAKWOOD APTS" is classifiable only if you know what Oakwood is or you key off the token "APTS" — knowledge and keywords, which layers A–F already provide. That caps what representation learning can add.

- **G1 — Hashed character-n-gram linear classifier** (the only variant worth shipping). Char 3–5-grams → hashing trick (2^15 buckets) → one-vs-rest logistic regression over the 14 categories, trained offline on a build-time synthetic corpus (public merchant lists labeled by Claude at build time). Weights int8, pruned: **~80–150 KB gz** lazy chunk, pure JS, no WASM. Inference: microseconds/tx, 5,000 tx ≪ 100 ms, memory ~1 MB. Realistic performance: fires only on the residual tail (after A–F, maybe 5–10% of volume); expect ~70–85% accuracy on that slice (vs Claude's ~95%), i.e. a net +2–4% overall accuracy for keyless users, ~0 for keyed users. Gate it below correction/dictionary confidence.
- **G2 — Embeddings via transformers.js** (e.g. quantized all-MiniLM-L6-v2 + kNN vs precomputed category anchors): ~23 MB model + ~8 MB anchors, 1–4 s WASM init, ~150–300 MB RAM, 5–20 ms/tx. For opaque strings like "XYZ CORP 4432" an embedding is as lost as a regex. **Not worth it** for this product's privacy-lightweight positioning; revisit only if a future feature needs semantic search over transactions anyway.

**Verdict: better heuristics beat on-device ML here.** G1 is a defensible last step for the keyless long tail; G2 is not justified.

### Ranked by accuracy-per-cost

| Rank | Improvement | Accuracy effect | Bundle / runtime cost | Complexity |
|---|---|---|---|---|
| 1 | B — local correction learning | Compounds to ~100% on repeated merchants | ~0 | S–M |
| 2 | A — unified normalizer + rule fixes | Kills measured FP class; ~+10 pts coverage | ~0 | M |
| 3 | C — offline-first (key-free) | 0 pts model accuracy, huge effective accuracy for keyless users | ~0 | S |
| 4 | D — bank category harvesting | +3–8 pts on carrying formats | ~0 | S |
| 5 | E — confidence + review queue | Structural; powers the flywheel | ~0 | M |
| 6 | F — shipped dictionary | +5–10 pts real-world coverage | 50–90 KB gz lazy | M |
| 7 | G1 — tiny linear model | +2–4 pts, keyless tail only | 80–150 KB gz lazy | L |
| — | G2 — embeddings | marginal | 25–30 MB, 100s of MB RAM | L |

---

## 3. The in-browser constraint analysis

**What "client-side" means here.** Today the strongest layer is already a browser→cloud call: the Claude API (BYOK, direct from the client, `dangerouslyAllowBrowser: true`). The hard product constraint is *no server we control*; the founder's goal for this work is that the **improvements** add no server and no new cloud dependency, and reduce reliance on the existing one. Everything in §2 runs fully offline; the Claude layer is demoted from "the classifier" to "optional long-tail resolver."

**Where the ceiling is.** Classification here is ~90% an entity-resolution problem against world knowledge (which merchant is this?) and ~10% a semantics problem (what kind of thing is a merchant like this?). Offline, world knowledge must be either shipped (dictionary — bounded by bundle budget), accumulated (user corrections — bounded by usage time), or inferred (keywords/priors/ML — bounded by descriptor opacity). Because spending is Zipfian both globally (chains dominate volume) and personally (individuals repeat merchants), the offline stack realistically reaches **~90–95% of transaction *volume* correctly categorized** after a few sessions of use: ~85% from dictionary+rules+normalizer on day one, plus corrections closing the personal tail. The floor that no offline system clears: first-encounter, genuinely opaque local merchants ("VALENTIN RESTAURANT" is guessable from "RESTAURANT"; "TORCHYS 4432" is not) — that residue is 5–10% of volume and is exactly what the optional LLM call, or a 10-second review queue pass, is for.

**Smartest architecture** — a layered resolver, strongest-knowledge-first, every layer local until the last:

```
1. User corrections (localStorage)        conf 1.0   [B]
2. Shipped dictionary + fixed regexes     conf 0.9   [A, F]
3. Generic keyword rules                  conf 0.75  [A]
4. Bank-provided category column          conf 0.6   [D]
5. Amount/cadence/type priors             conf 0.55  [E]
6. (optional) tiny linear model           conf ~0.6  [G1]
7. (optional, BYOK) Claude — misses only  conf 0.85
   → below threshold: Other + review queue → feeds layer 1
```

Cache keyed by `mode|type|normalizedMerchant` (amount removed; keep an explicit amount-banded exception list for the few genuinely amount-sensitive merchants like Amazon Prime vs Amazon). Precomputed dictionary shipped in-bundle as a lazy same-origin chunk: yes. On-device embeddings: no. Hybrid rules+tiny-ML: optional, last.

---

## 4. Buildable plan — ordered PRs

Sizes: S ≲ 1 day · M ≈ 2–4 days · L ≈ 1–2 weeks. Each PR is independently shippable; order chosen so measurement precedes claims and each PR raises a number the previous PR made visible.

**PR-1 (S) — Golden corpus + offline eval harness.** Add `sample-data/labeled/` (~1–2k rows: existing fixtures hand-labeled with gold category + a generated messy-variant set: store numbers, city suffixes, stacked processor prefixes, the §1.4a adversarial probes). Add `src/lib/evaluate.ts` + `evaluate.test.ts` (vitest, follows the `sample-data.test.ts` pattern) reporting per-layer **coverage** and **accuracy** and a confusion matrix, with CI floor assertions. *Acceptance:* `npm test` prints the baseline table (≈81.6% coverage) and fails if a future change drops coverage or accuracy below the recorded floor. This is also the whole answer to "evaluate without a backend": the harness is local, deterministic, and runs in CI on every push.

**PR-2 (M) — `lib/merchant.ts` normalizer + rule fixes + keyword layer.** Implement A; migrate `merchantLookup.ts`, `normalize.ts`, `recurring.ts`, and the cache key (drop amount); fix the ten confirmed false positives; add the generic keyword rules. *Acceptance:* all §1.4a probes classify correctly in `evaluate.test.ts`; fixture coverage ≥ 90%; `normalize.test.ts` proves `normalizeVendorName` and classification agree on merchant identity; cache test proves same-merchant-different-amount is one entry.

**PR-3 (S) — Offline-first classification.** Implement C: rules run in `handleFiles` with no key; button relabeled "Categorize remaining N with Claude". *Acceptance:* Playwright/component test — drop `sample-data/chase-checking.csv` with no API key → Sankey renders with ≥ 80% of transactions categorized and zero network requests (assert via CSP-safe fetch spy).

**PR-4 (S–M) — Correction store.** Implement B: `lib/correctionStore.ts` (localStorage, opt-in toggle, clear button), Layer-1 lookup, "apply to N similar", subcategory in the override UI. *Acceptance:* unit — override "VALENTIN RESTAURANT"→Dining, re-run classification on a fresh parse of the same CSV → Dining with `source: 'user'`, zero API candidates for it; storage contains only merchant+category strings.

**PR-5 (S) — Bank category harvesting.** Implement D in `parser.ts` + alias mapping. *Acceptance:* monzo-uk.csv rows whose merchant is unknown to the dictionary but carry `Category: Groceries` classify as Groceries with `source: 'bank'`; fixture coverage (with PR-2) ≥ 93%.

**PR-6 (M) — Confidence resolver + review queue.** Implement E: `confidence`/`source` on `Transaction`, priors, review list UI feeding the correction store. *Acceptance:* every categorized transaction has a source; eval harness asserts priors fire ("unknown merchant, $12.99 every 30±2 days" → Subscriptions ≥ 0.55); UI test — low-confidence items appear in the queue and correcting one updates all same-merchant rows.

**PR-7 (M) — Generated merchant dictionary.** Implement F: `scripts/build-merchant-dict.ts` (build-time), lazy chunk, dictionary-first lookup. *Acceptance:* bundle-size assertion (chunk ≤ 90 KB gz, initial bundle unchanged); real-world-style eval slice (labeled messy corpus from PR-1) coverage ≥ 85%; dictionary-hit accuracy ≥ 95% on gold.

**PR-8 (L, optional — decide after PR-7's numbers) — Tiny linear classifier.** Implement G1 behind a threshold. *Acceptance:* fires only when layers 1–5 miss; ≥ 75% accuracy on the fired slice of the golden set; ≤ 150 KB gz; 5,000-tx classification ≤ 100 ms in the eval harness.

**Ongoing accuracy telemetry without a backend:** the in-app *override rate* (corrections ÷ classified) computed locally per session is the live proxy for real-world accuracy — display it in a dev panel; it never leaves the browser.

---

## 5. Methodology & verification notes

Measured numbers were produced by bundling the unmodified `src/lib/merchantLookup.ts` with the repo's own esbuild to a temp file outside the repo and running it under Node against `sample-data/*.csv` (naive CSV split — fixture description columns contain no embedded commas) and the §1.4a probe list. No repo file other than this document was created or modified.

**Unverified / assumed:**
- All "expected lift" percentages in §2 except the 81.6%/§1.4a measurements are estimates; PR-1 exists to replace them with numbers.
- Fixture hit rate overstates real-world coverage (synthetic, chain-heavy data); the "~50–60%" comment in `merchantLookup.ts:4` may be closer to truth for messy real statements.
- G1 model size/accuracy figures are extrapolations from standard hashed-linear text-classifier behavior, not a trained prototype; ditto the transformers.js footprint (based on published quantized MiniLM ONNX sizes, not loaded here).
- Dictionary chunk size (50–90 KB gz for ~5k entries) is a linear extrapolation from the measured 537-rule chunk (12.4 KB gz).
- Assumed the founder is comfortable with opt-in localStorage persistence of *normalized merchant names* given the existing sessionStorage precedent that stores full raw descriptions; if not, the hashed-key variant of PR-4 is the fallback.
- Taxonomy additions (Giving, Taxes, Fees…) touch `types.ts:CATEGORIES`, both LLM prompts, `CATEGORY_ALIASES`, the essentials lens grouping, and budget CSV round-tripping — scoped out of the PR list above and flagged as a follow-up decision.
