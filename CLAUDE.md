# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**WhoAteMyPaycheck** — drag-drop your bank CSVs, see where your money goes.

A client-side web app. Users drag-and-drop CSV exports from any bank or credit card. Claude auto-detects the format (column mapping, date parsing, amount sign conventions) and categorizes each transaction. Renders an interactive Sankey diagram: income sources on the left, spending categories on the right, flow width proportional to dollar amount. Users can generate a budget from actual spending, compare it month-to-month, and export for a CPA.

No backend. No account creation. No bank login. Bank data never leaves the browser (except merchant names + amounts sent to the Claude API for categorization).

Licensed under BSL 1.1 — open source for personal use and self-hosting; public hosted services require the licensor's permission. Converts to MIT on 2030-04-17.

## Repository Structure

```
WhoAteMyPaycheck/
├── CLAUDE.md
├── README.md
├── LICENSE                     # BSL 1.1
├── index.html                  # Vite entry point
├── sample-data/                # CSV fixtures used by integration tests
│   ├── chase-checking.csv
│   ├── bofa-credit-card.csv
│   ├── credit-union-checking.csv
│   ├── amex-gold.csv
│   ├── monzo-uk.csv
│   └── README.md
├── src/
│   ├── App.tsx                 # Root component — layout and top-level state
│   ├── main.tsx
│   ├── components/             # React components (rendering only)
│   ├── hooks/                  # Custom hooks (useCategorization, useTaxLens, useBudget)
│   ├── lib/                    # Core logic — pure functions, no React
│   └── styles/
│       └── global.css          # Single global stylesheet (~2,000 lines)
├── public/
│   ├── images/                 # Screenshots used in HowItWorksModal carousel
│   └── samples/                # Demo dataset for first-time users
├── .claude/
│   └── commands/               # Claude Code slash commands
├── .github/
│   └── workflows/
│       └── ci.yml              # lint → test → build on every push
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | React 19 + TypeScript (strict mode) |
| Build | Vite |
| Visualization | D3.js (d3-sankey) — named imports only, no wildcard |
| AI | Claude API via @anthropic-ai/sdk — lazy-loaded, BYOK |
| Styling | Plain CSS — single global stylesheet, dark theme |
| Testing | Vitest — 17 test files, 364+ tests |
| Hosting | Static (no backend required) |

## Commands

```bash
npm install       # Setup
npm run dev       # Dev server
npm run build     # Production build (tsc + vite)
npm test          # Run test suite
npm run lint      # ESLint (--max-warnings 0)
```

## Architecture

### Data flow

```
CSV File
  → readCsv.ts (PapaParse)
  → parser.ts (detectFormat, parseTransactions)
  → useCategorization hook (App state: LoadedFile[])
  → categorize.ts (Claude API, lazy-loaded, cached in sessionStorage)
  → App state: categorized transactions
  → sankey.ts (buildSankeyData) → SankeyChart.tsx (D3)
  → budget.ts (generateBudget) → BudgetPanel / BudgetTable
  → lenses/tax-us.ts (taxCategorize, cached) → TaxFlagPanel
```

### State management

State is lifted into `App.tsx` and three custom hooks:
- **`useCategorization`** — file loading, CSV parsing, Claude categorization, progress, overrides
- **`useTaxLens`** — tax lens API calls, tax overrides, progress
- **`useBudget`** — budget generate/import/export, comparison, localStorage persistence

What lives where:
- Budget → `localStorage` (survives page refresh)
- Categorization cache → `sessionStorage` (keyed by description+amount+type+mode)
- Tax cache → `sessionStorage` (keyed by description+amount)
- API key → `sessionStorage`
- Hidden categories → `localStorage`
- How-it-works seen flag → `localStorage`

### Lenses

The app supports multiple views ("lenses") over the same transaction data:
- **spending** — default Sankey, income → expense categories
- **essentials** — groups categories into Needs / Wants / Savings
- **tax-us** — maps transactions to IRS schedules (A, C, SE, 2441, HSA)

Lenses live in `src/lib/lenses/`. Each lens remaps category strings for the Sankey; the budget overlay is orthogonal to lenses and only active on the spending lens.

## Key Decisions

1. **Client-side only.** No backend, no database. The only network call is the Claude API for categorization. The Anthropic SDK is lazy-loaded — it doesn't ship in the initial bundle.
2. **Privacy-first.** Bank data never touches a server we control. The Claude API call sends merchant descriptions, amounts, and debit/credit type only — no account numbers, balances, or PII. API key is in sessionStorage, never localStorage.
3. **CSV-first, not bank-API.** Users export CSVs manually. Avoids Plaid/credentials complexity. Every bank supports CSV export.
4. **Budget from reality.** The budget generator uses actual spending patterns (median monthly for discretionary, last-observed for fixed recurring, CV thresholds to classify). No prescriptive targets.
5. **BSL over fully permissive.** Open for personal use and self-hosting; public competing services require permission. Converts to MIT in 2030.

## Coding Standards

### General
- Clarity over cleverness
- Explicit over implicit
- Fail fast, fail loudly
- Don't add features, error handling, or abstractions beyond what the task requires

### TypeScript
- `strict: true` — no exceptions
- No `any` — use proper types or `unknown` with type guards
- `interface` for object shapes, `type` for unions/intersections
- Named exports only, no default exports
- Barrel files (`index.ts`) only at feature boundaries

### React
- Functional components only
- Props interfaces named `{Component}Props`
- No prop drilling beyond 2 levels — use context or composition
- `useCallback`/`useMemo` only when profiling shows a need
- Keep components under ~150 lines — extract when they have distinct responsibilities

### File organization
- One component per file, filename matches component name
- Co-locate tests: `Foo.tsx` + `Foo.test.tsx`
- Core logic lives in `lib/` — pure functions, no React imports
- Hooks in `hooks/` — stateful React wrappers around lib functions
- Components in `components/` — rendering only, no business logic

### Data flow rules
- CSV parsing: `lib/parser.ts`
- Categorization: `lib/categorize.ts` (Claude API) + `lib/merchantLookup.ts` (offline pre-classification)
- Budget: `lib/budget.ts` (generation) + `lib/budget-csv.ts` (export/import) + `lib/budgetStorage.ts` (persistence)
- Sankey: `lib/sankey.ts`
- Normalization: `lib/normalize.ts` (shared between sankey, budget, recurring detection)

### Testing
- Unit tests required for all `lib/` modules
- `sample-data.test.ts` runs the full parser against every CSV in `sample-data/` — keep it passing
- Test files live alongside source: `foo.ts` → `foo.test.ts`
- No mocking the parser or categorization cache in unit tests — they're fast enough to run real

### Security
- Never log or persist raw bank data (raw CSV rows, account numbers, balances)
- `console.debug` calls in `categorize.ts` are DEV-only (`import.meta.env.DEV` guard)
- Claude API key: sessionStorage only, never localStorage
- CSP is set in `index.html` — don't weaken it
- CSV exports sanitize formula injection prefixes (`=`, `+`, `-`, `@`)
- No telemetry, no analytics, no tracking

### CSS
- Single global stylesheet: `src/styles/global.css`
- Dark theme only (light mode is a tracked issue)
- Hardcoded hex values throughout — CSS custom properties are a tracked issue, don't add more raw hex in the meantime
- No CSS Modules, no Tailwind
