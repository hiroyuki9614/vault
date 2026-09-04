# Security Automation

Repository security automation is intentionally narrow and source-controlled.

## Pull requests

- `architecture`: reproducible install, strict TypeScript, Vitest, architecture invariants.
- `dependency-vulnerability-scan`: scans the committed `package-lock.json` with OSV-Scanner and fails when a known vulnerability is found.
- `codeql`: analyzes JavaScript/TypeScript and Python with `security-extended` queries.

## Main and scheduled analysis

CodeQL and the OSV dependency vulnerability scan run on `main` pushes and weekly. Dependabot proposes npm and GitHub Actions updates weekly.

## Dependency vulnerability boundary

The source-controlled dependency gate uses OSV-Scanner against the committed npm lockfile. The scanner action is pinned to an immutable commit and the job is bounded by a timeout.

The previous npm Advisory API gate was deliberately removed after its advisory endpoint timed out in CI. A single provider-specific advisory endpoint must not define the repository's dependency-security contract.

The OSV gate fails on any known vulnerability reported for the locked dependency graph; it is intentionally stricter than the previous High/Critical-only npm audit threshold.

## GitHub graph-backed enhancement

GitHub Dependency Review requires Dependency Graph to be enabled in repository administration. Once enabled, production repositories should add Dependency Review and require it in the main ruleset. It is an additional graph-backed control; the source-enforced OSV scan remains independently runnable.

## Supply-chain boundary

All external GitHub Actions in source-controlled workflows must use immutable 40-character commit SHAs. The architecture checker verifies actual YAML `- uses:` syntax, and regression tests prove that tag-based refs such as `action@v4` are rejected.

## Non-guarantees

Automation reduces risk; it does not prove the absence of vulnerabilities. Authorization/RLS acceptance, secret handling, incident response, backup/restore, and organization-specific compliance remain separate controls.
