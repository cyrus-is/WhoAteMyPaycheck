Review and triage all GitHub issues labeled `untriaged`.

For each untriaged issue:

1. **Read the report** — understand the description and context
2. **Research the root cause** — read relevant source files, trace the code path
3. **Assess severity:**
   - **P1** — feature broken, data loss, crash, or blocks core workflow
   - **P2** — degraded experience, workaround exists, or affects secondary features
   - **P3** — cosmetic, edge case, or minor annoyance
4. **Add labels** — set priority (P1/P2/P3) and component labels. Remove `untriaged`.
5. **Comment the diagnosis** on the issue:
   - Root cause (file + line if possible)
   - Proposed fix
   - Risk/blast radius
   - Estimated effort (small/medium/large)

Component labels: `csv-parsing`, `categorization`, `sankey-viz`, `budget`, `ui`, `claude-api`

After triaging all issues, present a summary table and wait for the user to pick what to work on.

---

## If there are no untriaged issues

Fall back to sprint planning:

### Step 1: Gather context

```bash
gh issue list --state open --json number,title,labels,body --limit 100
gh issue list --state closed --json number,title,labels,closedAt --limit 20
```

### Step 2: Show recent activity

Present issues closed in the last 7 days.

### Step 3: Group open issues by theme

Group into: **CSV Pipeline**, **Categorization**, **Visualization**, **Budget**, **UI/UX**, **Infra**

Sort by priority within each group, present as tables. Recommend which theme to tackle next.
