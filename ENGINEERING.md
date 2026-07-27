<!-- ENGINEERING.md — rendered from hq/standards/engineering v1.0.0 on 2026-07-26. Edit canonical, not this file (header block excepted). -->

# Engineering Standards

```yaml
owner: Cyrus
autonomy: interactive-only
surfaces:
  web-site: /
incident-tier: { web-site: 2 }
license: BUSL-1.1
coverage-deviation: none
```

## Principles

- **Strong typing preferred.** Language tiers: backend Go/Python/TypeScript/Rust; frontend TS/Tailwind/TSX, Swift (Apple), Kotlin (Android). C# only for game-engine work (Unity/Godot). Never Ruby or PHP.
- **Formatters are law.** Zero style debate in review; configs live in this repo. Naming follows language idiom. Cross-cutting: camelCase JSON keys, snake_case DB identifiers, SCREAMING_SNAKE env vars, kebab-case CLI flags.
- **Cheapest infra that meets current needs without blocking scale-up.** Serverless first; portability preserved (see surface sections if applicable).

## Branching & commits

- Trunk-based on `main`; protected (no force-push/deletion, enforced for admins). Linear history — squash or rebase only.
- Branches: `type/kebab-description` (`feat/`, `fix/`, `chore/`).
- Commits: imperative subject, ≤72 chars. **No Co-Authored-By or AI-attribution trailers.**
- Repos with a `staging` branch: unattended agent loops branch off and merge into `staging` only; `staging` → `main` promotion is manual and human-gated.

## Review

- CI green before merge, always.
- `/code-review` default effort medium; higher tiers opt-in per run.
- Priorities: correctness > security > simplicity. No style comments — the formatter owns style.
- Product repos (Building/Live, runtime surface): `/security-review` or Scrutineer security audit required before merge.

## Testing

- Pragmatic pyramid: unit for pure logic, integration at real boundaries, minimal E2E smoke in CI.
- Deterministic: no live network in unit tests, no sleep-based timing, no flaky-retry culture.
- **Diff coverage ≥ 80% on changed lines** (CI-enforced via diff-cover), with surface-specific path exclusions (see surface sections). Escape hatch: `coverage-override` PR label + one-line justification — request exemptions visibly, never write junk assertions to clear the bar. Gate is off for docs/prototype repos (see header).

## Dependencies & supply chain

- Minimize: stdlib first, no micro-deps. Every dependency is a supply-chain liability.
- GitHub Actions pinned to commit SHAs. Lockfiles required and committed.
- **~1-week minimum package age** before adopting a new version (cooling-off for poisoned-release detection).
- Dependabot: weekly review of open alerts/PRs, manual decision per batch; default lean is to take updates.

## Environments & secrets

- Environments: `dev` / `staging` / `prod`. 12-factor: config in environment, never in code.
- **Secrets never in git — gitignore sensitive paths at file creation, not after.** Platform secret stores in cloud; `.env.example` committed, `.env` ignored.
- Secret rotation: on suspected exposure always (see Security). Scheduled rotation deliberately paused portfolio-wide until first Live product with paying consumers.

## Security baseline

- MFA on every account that can affect this repo or its infrastructure.
- Least-privilege IAM per app.
- semgrep in CI on product repos. No DAST requirement at current scale.
- **Threat model before release:** one page — what can go wrong, who'd attack this — required before shipping to real users.
- Any product building an authentication layer must consciously decide whether it needs MFA, recorded as a decision.
- **Security incident = drop everything (Tier 0):** contain first (revoke/rotate the exposed credential), assess blast radius via audit logs, rotate adjacent credentials, check for persistence, document.

## Design review & plans

- **The implementation plan is the design review.** Non-trivial work (multi-day, architectural, or crossing a service boundary) requires a plan before code; plan approval is the review event.
- Agents: enter plan mode / produce an implementation plan for such work — self-enforce this; do not start coding first.
- Plans for architectural work are persisted (committed or in the plans dir) and must state alternatives considered and how to back out.

## Decision records

- `decisions/` directory in this repo; `decision-<kebab-slug>.md` naming.
- Format: frontmatter (`title`, `status`, `date`, `summary`) + Context / Decision / Rationale / Consequences.
- Required for irreversible or expensive choices: architecture, vendor/lock-in, data model, anything you'd want the reasoning for in two years. Cross-portfolio decisions go to HQ instead.

## Documentation

- README (what/why/how-to-run), CLAUDE.md (agent context), session log maintained via `/sessionlog` at session end.
- Incidents: user-visible breakage gets a lightweight postmortem note in the repo within a week (what broke / why / prevention). Mitigate first (rollback = redeploy previous known-good), diagnose after.

## Agent operating rules

- Agents follow this document exactly as humans do.
- Unattended multi-day loops only if this repo's header says `autonomy: staging-eligible`; loops need `max_iterations`.
- Respect the coverage escape hatch and plan-first rules above — visible exemption requests beat gamed metrics.

## License

License is a per-repo decision recorded in the header block above — there is no portfolio default. Check `LICENSE` in this repo before assuming anything about reuse.

## Surface: web-site (/)

- Scope: ``/``
- Stack: TypeScript / Next.js / Tailwind (apps) or static generators (sites). Prettier + ESLint.
- Coverage: 80% diff gate on lib/logic; **excluded:** stories, styles, static content/markup.
- Deploy: GitHub Actions → S3/CloudFront or CF Pages. Preview environments only where free until the product has paying users — then required.
- Observability: external uptime check on Live sites.
- Privacy: collect-nothing default; no third-party analytics; full inventory if accounts/forms exist.
