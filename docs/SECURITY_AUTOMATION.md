# Security Automation

Repository security automation is intentionally narrow and source-controlled.

## Pull requests

- `architecture`: reproducible install, strict TypeScript, Vitest, architecture invariants.
- `dependency-review`: rejects newly introduced High/Critical dependency vulnerabilities.
- `codeql`: analyzes JavaScript/TypeScript and Python with `security-extended` queries.

## Main and scheduled analysis

CodeQL also runs on `main` pushes and weekly. Dependabot proposes npm and GitHub Actions updates weekly.

## Supply-chain boundary

All external GitHub Actions in source-controlled workflows must use immutable 40-character commit SHAs. The architecture checker verifies this syntax and regression tests prove that `- uses: action@tag` is rejected.

## Non-guarantees

Automation reduces risk; it does not prove the absence of vulnerabilities. Authorization/RLS acceptance, secret handling, incident response, backup/restore, and organization-specific compliance remain separate controls.
