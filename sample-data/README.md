# Sample Data

Test CSVs covering the main parsing edge cases. Drop any of these into the app to verify parsing without needing a real bank export.

| File | Bank | Date format | Amount format | Notes |
|------|------|-------------|---------------|-------|
| `chase-checking.csv` | Chase Checking | MM/DD/YYYY | Single `Amount` column, negative = credit | Full year Jan–Dec 2024; rent, payroll, transfers, year-end bonus |
| `bofa-credit-card.csv` | BofA Credit Card | MM/DD/YYYY | Single `Amount`, positive = charge, negative = payment/refund | Full year Jan–Dec 2024; extra columns (`Reference Number`, `Address`) |
| `credit-union-checking.csv` | Generic Credit Union | YYYY-MM-DD (ISO) | Separate `Debit` / `Credit` columns | Full year Jan–Dec 2024; interest income, side job deposits |
| `amex-gold.csv` | American Express | MM/DD/YYYY | `(NNN.NN)` parenthetical = charge, positive = payment | Full year Jan–Dec 2024; travel, dining, refunds; extra columns |
| `monzo-uk.csv` | Monzo (UK) | DD/MM/YYYY | Separate `Paid out` / `Paid in` columns | Full year Jan–Dec 2024; DD/MM auto-detection; GBP; 196 transactions |

## What each file exercises

- **chase-checking** — baseline US format; `Payment` type rows are credits; transfer detection (Online Transfer, Zelle)
- **bofa-credit-card** — `Posted Date` (not `Date`) header; `Payee` (not `Description`); no credits column
- **credit-union** — ISO dates; debit/credit split; `INTEREST EARNED` credit row; side job income alongside payroll
- **amex-gold** — parenthetical negative amounts `(NNN)` = expense; positive = payment; `AUTOPAY PAYMENT` should be detected as transfer
- **monzo-uk** — DD/MM/YYYY dates trigger auto-detection; `Name` column for description; `Paid out (GBP)` / `Paid in (GBP)` for amounts; lots of irrelevant columns

## Multi-file test

Load `chase-checking.csv` + `credit-union-checking.csv` together. The `TRANSFER TO SAVINGS` (Chase) and `TRANSFER TO SAVINGS` (credit union) entries on the same dates with $500 should be matched as cross-file transfers by the amount-matching heuristic.
