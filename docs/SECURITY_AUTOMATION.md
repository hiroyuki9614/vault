# Security Automation

Repository security automation is intentionally narrow and source-controlled.

## Pull requests

- `architecture`: reproducible install, strict TypeScript, Vitest, architecture invariants.
- `dependency-audit`: installs from the committed lockfile and runs `npm audit --audit-level=high`.
- `codeql`: analyzes JavaScript/TypeScript and Python with `security-extended` queries.

## Main and scheduled analysis

CodeQL and dependency audit run on `main` pushes and weekly. Dependabot proposes npm and GitHub Actions updates weekly.

## GitHub graph-backed enhancement

GitHub Dependency Review requires Dependency Graph to be enabled in repository administration. Once enabled, production repositories should add Dependency Review and require it in the main ruleset. It is an additional graph-backed control; the source-enforced `dependency-audit` remains independently runnable.

## Supply-chain boundary

All external GitHub Actions in source-controlled workflows must use immutable 40-character commit SHAs. The architecture checker verifies actual YAML `- uses:` syntax, and regression tests prove that tag-based refs such as `action@v4` are rejected.

## Non-guarantees

Automation reduces risk; it does not prove the absence of vulnerabilities. Authorization/RLS acceptance, secret handling, incident response, backup/restore, and organization-specific compliance remain separate controls.
