# Product Review & Improvement Plan — WhoAteMyPaycheck

**Status:** review · **Author:** Claude (Fable 5) · **Date:** 2026-07-12
**Scope:** overall product review + improvement plan, holding the hard constraint: **100% client-side, no backend, ever.** Grounded in the code as of `main` (v1.0.1). Companion doc: [classification-improvement-fable.md](classification-improvement-fable.md) covers categorization *accuracy* in depth; this doc covers the *product* and cross-references rather than repeats it.

---

## TL;DR

The pipeline underneath this app is genuinely strong — format auto-detection (`parser.ts`), transfer de-duplication (`transfers.ts`), a three-layer categorization waterfall (`merchantLookup.ts` → `categorizationCache.ts` → `categorize.ts`), lenses, budget-from-reality, anomaly detection. The product wrapped around it is a **one-shot demo gated behind an Anthropic API key**. Nothing about the user's transactions survives a refresh, a brand-new user sees nothing until they paste an `sk-ant-` key, and the demo dataset that could sell the app in one click (`public/samples/`) is not wired to any button. The two highest-leverage moves are (1) **a key-free first Sankey** — the offline merchant layer can already categorize most transactions but never runs without a key — and (2) **IndexedDB persistence**, which converts a tool you try once into a ledger you return to monthly. Both are small-to-medium PRs. Retention features (trends, recurring-subscriptions panel), PWA/offline, and OFX import stack on top.

---

## 1. Product read

### 1.1 The core loop as built

```
DropZone.tsx (.csv only)
  → readCsv.ts (PapaParse) → parser.ts detectFormat/parseTransactions
  → useCategorization.handleFiles → transfers.ts detectTransfers   [no key needed]
  → ApiKeyEntry.tsx  ←—— HARD GATE: showCategorizeBtn requires !!apiKey
  → "Categorize with Claude" → categorize.ts
       Layer 1: merchantLookup.ts (~537 static regexes, no network)
       Layer 2: categorizationCache.ts (sessionStorage, exact-match)
       Layer 3: Claude API (batches of 50, concurrency 5, BYOK)
  → sankey.ts buildSankeyData → SankeyChart.tsx (D3, hover top-5 vendors, merge slider)
  → lenses: spending / essentials / tax-us (LensSwitcher.tsx, lib/lenses/)
  → AnomalyInsights.tsx (anomaly.ts: ≥15% deviation vs ≥2-month history)
  → BudgetPanel.tsx (budget.ts generate, budget-csv.ts export/import, localStorage)
  → TransactionTable.tsx (per-row category overrides, React state only)
```

### 1.2 What's strong

- **Import robustness is real.** `detectFormat` handles single signed-amount columns, split debit/credit columns, Amex parenthetical negatives, majority-negative sign sniffing, and DD/MM vs MM/DD date-order detection from actual values (`parser.ts:52-131`). Five bank fixtures in `sample-data/` are exercised by `sample-data.test.ts` on every push. Rows that fail date parsing are counted and surfaced in a warn banner (`App.tsx:246-254`) instead of silently dropped. This is better import UX than most funded competitors.
- **The privacy claim is *verifiable*, not aspirational.** The CSP in `index.html` pins `connect-src` to `'self'` and `api.anthropic.com` — a user (or auditor) can confirm the browser *cannot* exfiltrate data anywhere else. No telemetry, no analytics. This is the moat; almost nothing else in personal finance can make this claim.
- **Transfer detection** (`transfers.ts`) — keyword patterns plus cross-file debit/credit pairing — prevents the classic "my income is double-counted" failure that makes naive CSV tools useless for multi-account households.
- **The insight layer goes beyond a chart.** Lenses (spending / essentials / tax-us) re-frame the same data for different questions. The tax lens with the CPA CSV export (`lenses/export.ts`, "Export for CPA" in `App.tsx:413-425`) is a genuinely differentiated feature — a concrete artifact with dollar value attached. Budget generation from actual spending (`budget.ts`: median for discretionary, last-observed for fixed, CV thresholds via `recurring.ts`) is the honest version of budgeting.
- **Engineering hygiene**: 364+ tests, strict TS, CI on push, the Anthropic SDK lazy-loaded out of the initial bundle (`useCategorization.ts:151`).

### 1.3 Friction and gaps

Ordered by how much each one costs the product:

1. **The API-key wall kills onboarding.** `showCategorizeBtn` requires `!!apiKey` (`useCategorization.ts:65-66`), and the Sankey renders only when `hasCategorized` is true (`App.tsx:158-159` — which requires a categorization run to set subcategories). So a new user without an Anthropic developer account sees: a key form, a drop zone, and a raw table. The offline merchant layer that could categorize the majority of transactions with zero network (measured 81.6% on the repo's fixtures — see companion doc §5) *never runs without a key*. Mainstream users do not have Anthropic API keys; this gate filters the audience down to developers.
2. **Nothing persists. The product has no memory.** Transactions live in `useCategorization`'s `files` React state; refresh = gone. The categorization cache is `sessionStorage` (dies with the tab); user overrides are plain React state (`useCategorization.ts:42`); only the budget (`budgetStorage.ts`, localStorage), hidden categories, and the how-it-works flag survive. There is **no IndexedDB anywhere in the codebase**. Consequence: every visit restarts from CSV export, and the features that depend on history (anomalies need ≥2 months, budget accuracy wants ≥3 — `useBudget.ts:45-48`) only work if the user re-imports their full history every single time. This is the difference between a *tool* and a *ledger*; today it's a tool.
3. **The demo is orphaned.** `public/samples/sfbay-mid-career-tech-couple/` is a carefully built 3-month persona dataset (224-row checking.csv with a README) that no code references — a user would have to find the file in the repo and drop it manually. `LandingPreview.tsx` (a five-card feature showcase) is dead code, imported nowhere. First-run experience is a screenshot carousel modal (`HowItWorksModal.tsx`) whose second section is *instructions for creating an Anthropic API key* — the onboarding literally routes new users to console.anthropic.com before showing them value.
4. **The insight payoff is a snapshot, not a story.** The Sankey shows one period. There is no month-over-month trend view, no "biggest movers," no time axis anywhere in the UI. `AnomalyInsights` is the only longitudinal feature and it renders as a small text list below the chart. `recurring.ts` detects subscriptions with cadence and drift data but feeds *only* budget generation — "you pay $118/mo across 9 subscriptions" is computed and never shown.
5. **CSV-only import.** `DropZone.tsx:18-20` filters to `.csv`/`text/csv`; other files dropped are silently ignored (no "we can't read .ofx yet" message). Many banks default to OFX/QFX, and QIF/XLSX are common; every non-CSV user bounces with no feedback.
6. **No shareable output of the headline visual.** The Sankey — the screenshot-able, post-able artifact — has no export (checked `SankeyChart.tsx`; only budget CSV and tax CSV exports exist). Users who want to show a partner/adviser must OS-screenshot.
7. **No PWA.** No manifest, no service worker (checked `index.html`, `vite.config.ts`, `public/`). For an app whose pitch is "everything happens on your device," not working offline and not being installable is an ironic gap — and installability is free retention.
8. **Trust-copy drift.** `HowItWorksModal.tsx:112` and `README.md:69` both promise the API key lives in sessionStorage and "disappears when you close the tab" — but `ApiKeyEntry.tsx` offers "Remember my key," which stores it in **localStorage** (`apiKey.ts:12-15`). Project `CLAUDE.md` still says "sessionStorage only, never localStorage." For a product whose entire brand is precise privacy claims, saying one thing and doing another is disproportionately expensive. Either remove "remember" or update every claim.
9. **Corrections evaporate.** Category overrides aren't persisted or learned from (companion doc covers the fix: a local merchant→category dictionary that outranks all other layers).

---

## 2. Improvement plan — 100% client-side, ranked by user-value ÷ build-cost

| # | Change | Value | Cost | Notes |
|---|--------|-------|------|-------|
| 1 | **Key-free first insight** — run `merchantLookup` + `transfers` at drop time; render the Sankey immediately with an "N% categorized on-device — add a Claude key to finish the rest" banner | Very high | S–M | Removes the single biggest funnel cliff. All code exists; the change is un-gating it (`useCategorization.ts:65-66`) and letting `buildSankeyData` render partially-categorized data with an "Uncategorized" node. |
| 2 | **"Try the demo" button** — fetch `public/samples/sfbay-mid-career-tech-couple/checking.csv` into the normal pipeline | Very high | S | One click to the aha moment, zero files, zero key (with #1). Resurrect or delete `LandingPreview.tsx` while there. |
| 3 | **IndexedDB persistence** — persist parsed transactions, categorization results, and overrides; restore on load; prominent "Wipe my data" control | Very high | M | Converts one-shot → returning ledger; makes anomalies/budget-comparison work across visits; each month the user only imports the *new* CSV. Framing matters: "stays on this device, delete anytime." Default-on with first-run notice. |
| 4 | **Recurring-subscriptions panel** — surface `detectRecurring` output: monthly total, per-merchant cadence, last-vs-average drift | High | S–M | The single most emotionally resonant insight in personal finance ("what am I bleeding monthly?"), and the detection code is already written and tested. |
| 5 | **Trends view** — month-over-month per-category bars + "biggest movers vs last month" | High | M | The comeback hook. Works today for a single 12-month import; compounds with #3. New lens or a tab beside the Sankey. |
| 6 | **Sankey export + monthly summary** — PNG/SVG download (serialize the existing SVG to canvas) and a copyable text/markdown summary | Medium-high | S | The share loop for a no-server app *is* the exported artifact. Zero network. |
| 7 | **PWA** — manifest + service-worker precache (`vite-plugin-pwa`) | Medium | S | Installable icon = retention; offline = the privacy story made tangible ("turn on airplane mode — it still works"). Offline categorization degrades gracefully to the on-device layer from #1. |
| 8 | **OFX/QFX import** — client-side parser (OFX is SGML-ish; small hand-rolled parser, no heavy dep) feeding the same `Transaction` shape; also *tell* users when a dropped file type is unsupported | Medium | M | Broadens bank coverage materially. Add fixtures to `sample-data/` and extend `sample-data.test.ts`. XLSX via lazy-loaded SheetJS is an optional follow-on. |
| 9 | **Workspace file** — export/import full app state (transactions + overrides + budget) as one passphrase-encrypted file (WebCrypto AES-GCM) | Medium | M | This is backup *and* cross-device sync without a server (§3). |
| 10 | **Screenshot/PDF-statement import via Claude vision (BYOK)** | Medium | L | Genuinely magical import ergonomics, but screenshots contain balances/account numbers — it breaks the current "only merchant names + amounts leave the browser" promise. If built: explicit opt-in with its own consent copy, and client-side crop/redaction first. Flagged, not recommended yet. |

Not recommended: URL-fragment data sharing for transactions (bank data in URLs leaks via history/logs/shoulder-surfing), and on-device embedding models for categorization (25–30 MB for marginal gain — already rejected in the companion doc).

---

## 3. The in-browser opportunity + the ceiling

### Where "no backend" is a superpower

- **A falsifiable privacy claim.** Everyone says "we take privacy seriously"; this app can say "open DevTools — the CSP physically prevents your data from going anywhere but Anthropic, and that only when you click the button." No competitor with a server can say it.
- **$0 marginal cost.** Static hosting; a viral spike costs nothing. The BSL self-hosting story (`README.md` §Self-hosting) works *because* there's no backend to operate.
- **Instant, no signup.** Time-to-value is bounded only by the funnel problems in §1.3 — all fixable in-browser.
- **No breach surface, no subpoena target, no dataset to sell.** The trust argument compounds over time as incumbents have incidents.

### Where it caps the product

| Cap | Consequence | Best client-side stretch |
|-----|-------------|--------------------------|
| No cross-device sync | Phone and laptop are separate worlds | **Workspace file** (#9): encrypted export/import; File System Access API can auto-save it into the user's own iCloud/Drive/Dropbox *folder*, so the user's existing cloud does transport — the app never touches a network. (FSA API is Chromium-only; fallback = manual download/import. Budget-sized payloads could also move device-to-device via QR.) |
| No bank feeds (Plaid et al. need server-held secrets) | Import stays manual, monthly | Make manual import excellent: OFX (#8), per-bank "how to export" cheatsheet, dedupe-on-reimport so overlapping exports are safe, and persistence (#3) so it's 12 imports/year, not 12 re-imports/visit |
| No server aggregation → no "people like you spend $X" benchmarks | Weaker social/comparative insight | Ship static public benchmark data (e.g., BLS Consumer Expenditure tables) *with the app* — comparison without collection. Honest and on-brand. |
| No push/email nudges | Retention relies on the user remembering | PWA install (#7) + calendar-file (.ics) "import next statement" reminder the user adds themselves |
| Categorization quality/cost tied to BYOK | Key wall (§1.3 #1) | On-device layers first (#1), key optional for the remainder; the local learned-dictionary from the companion doc keeps improving without any API |
| No collaboration (shared household view) | Couples share by exporting | Workspace file covers "same household, sequential"; true concurrent sharing is past the ceiling — accept it |

The honest ceiling: **automatic ingestion and multi-device concurrency are permanently out.** Everything else — persistence, trends, sync-via-user's-own-storage, benchmarks, offline — is reachable client-side.

### 3.a A note on "optional user-provided storage"

Browser-only OAuth to Dropbox/Drive APIs is technically possible (PKCE), but it widens `connect-src`, adds token-in-browser risk, and muddies the one-sentence privacy claim. The file-based approach (user saves the encrypted workspace file wherever they like) achieves 90% of the value with 0% of the claim-dilution. Recommend file-first; revisit API-based storage only if users demonstrably demand it.

---

## 4. Monetization (light) — and the tension

The BSL 1.1 license already encodes the natural business model: **free for individuals and self-hosters; public hosted services require a commercial license.** That is the revenue line that respects the ethos — charge companies who want to *operate* it, never users for their own privacy.

Options that fit, in order of fit:

1. **BSL commercial licensing** — passive; a `COMMERCIAL.md` + contact link costs nothing and is already implied by the license.
2. **Donations/sponsorship** (GitHub Sponsors, one-time "buy me a coffee" link in the app footer) — zero tension, zero infra.
3. **One-time honor-ware unlock** for advanced lenses/report packs, validated fully offline (signed license string checked client-side). It's trivially bypassable in an OSS repo — accept that; it's a tip jar with a receipt. Any license check that phones home breaks the CSP claim; don't.
4. **Paid desktop wrapper** (Tauri/Electron on the app stores) — same code, a real payment rail, and "an app that never goes online" is a *stronger* pitch on desktop. Medium effort; only if distribution there looks real.

The tension to flag honestly: this app's distribution advantage *is* being free, open, and privacy-absolute. Every paywall inside the browser app subtracts from the trust story that makes it spread. If visibility/portfolio value is the actual goal, options 1+2 are the whole plan — and that's a legitimate answer.

---

## 5. Buildable plan — ordered PRs

Sizes: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks. Order respects dependencies and value density.

**PR-1 (S) — Fix the trust-copy drift.**
Align `HowItWorksModal.tsx`, `README.md` privacy section, and project `CLAUDE.md` with the actual `apiKey.ts` behavior (or remove "Remember my key"). *AC:* every user-facing claim about key storage matches the code; a checked "remember" state is visibly disclosed next to the key-status pill.

**PR-2 (S–M) — Key-free categorization + partial Sankey.**
Run `classifyByMerchant` (and transfer detection, already key-free) during `handleFiles`; un-gate rendering; add an "Uncategorized" sink node; banner: "82% categorized on-device. Add a Claude API key to categorize the rest."
*AC:* dropping `sample-data/*.csv` with no key renders a Sankey; percent-categorized shown; "Categorize with Claude" appears only for the remainder; all existing tests pass.

**PR-3 (S) — Demo mode.**
"Try with sample data" button on the empty state; fetches the `public/samples/` dataset through the normal pipeline. Delete or mount `LandingPreview.tsx`.
*AC:* fresh browser, zero files, zero key → one click → populated Sankey + table; demo state clearly labeled and dismissible.

**PR-4 (M) — IndexedDB persistence.**
Persist `LoadedFile[]` (parsed transactions incl. categories/subcategories), overrides, and lens/tax results; restore on load; "Wipe my data" button; first-run notice ("stored only on this device").
*AC:* import + categorize → hard refresh → identical state without re-import; wipe clears IndexedDB + localStorage + sessionStorage; re-importing an overlapping CSV doesn't duplicate transactions (dedupe by date+amount+description).

**PR-5 (S–M) — Recurring subscriptions panel.**
New component consuming `detectRecurring(allTransactions)`: monthly recurring total, merchant list with cadence, average vs last amount (drift highlighted).
*AC:* fixture data shows known recurring merchants (Netflix-style entries in `sample-data/`); drift >5% visually flagged; panel hidden when nothing recurring.

**PR-6 (M) — Trends view.**
Month-over-month per-category chart + "biggest movers" list, driven by the same normalized data as `anomaly.ts`.
*AC:* 12-month import renders monthly series per category; movers list matches `detectAnomalies` math; respects date filter, overrides, and hidden categories.

**PR-7 (S) — Sankey export + copyable summary.**
Serialize the chart SVG to PNG/SVG download; "Copy summary" produces a markdown month digest.
*AC:* exported PNG visually matches on-screen chart (dark background included); zero network requests during export.

**PR-8 (S–M) — PWA.**
`vite-plugin-pwa`: manifest, icons, precache of app shell + samples.
*AC:* Lighthouse "installable" passes; airplane-mode reload works fully for the on-device pipeline; API-dependent buttons show a clear offline state; CSP unweakened.

**PR-9 (M) — OFX/QFX import.**
Client-side OFX parser → existing `Transaction` shape; DropZone accepts `.ofx/.qfx` and *says so*; unsupported file types get an explanatory toast instead of silence.
*AC:* ≥2 OFX fixtures added to `sample-data/` and passing in `sample-data.test.ts`; mixed CSV+OFX drop merges with transfer detection intact.

**PR-10 (M) — Encrypted workspace file.**
Export/import full state as a passphrase-encrypted (WebCrypto AES-GCM) `.wamp` file; optional File System Access API auto-save where supported.
*AC:* export on machine A → import on machine B reproduces state bit-for-bit; wrong passphrase fails loudly; file is unreadable plaintext.

**Deliberately deferred:** screenshot/PDF import via Claude vision (L — privacy-promise redesign required, §2 #10); XLSX import (S follow-on to PR-9 if requested); benchmark-data lens (M — nice-to-have after trends proves engagement).

---

## Appendix: unverified / assumed

- **No live-deployment inspection.** Reviewed code only; did not run the app or test real-device mobile rendering. `SankeyChart` uses fixed 900/1200px widths with 160px side margins — mobile experience is presumed poor but unverified (`global.css` ~1,977 lines not audited).
- **"81.6% offline hit rate"** is quoted from the companion classification doc's methodology, not re-measured here.
- **Hosting/traffic unknown.** Assumed live at some static host with nonzero but small traffic; no analytics exist to check (by design).
- **OFX demand** is inferred from bank-industry norms, not from user requests in this repo's issues.
- **File System Access API** support matrix assumed Chromium-only from knowledge cutoff; re-verify Safari/Firefox status before building PR-10's auto-save.
