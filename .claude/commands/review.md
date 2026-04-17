Review the current branch diff against main.

Focus on:
1. **Correctness** — does the code do what it's supposed to?
2. **Security** — any data leakage (bank data logged, API keys persisted to localStorage, CSP gaps)?
3. **Architecture** — does this fit the patterns in CLAUDE.md (lib/ for logic, components for rendering)?
4. **Edge cases** — weird CSV formats, empty files, huge files, malformed data, missing API key?
5. **Privacy** — does any bank data leave the browser unexpectedly?

Present findings as:
- **P1 (must fix):** blocks merge
- **P2 (should fix):** fix before next release
- **P3 (consider):** non-blocking, improvement opportunity
