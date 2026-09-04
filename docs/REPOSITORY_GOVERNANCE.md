# Repository Governance

## Purpose

This document separates controls enforceable from repository source from controls that require GitHub repository administrator settings.

The source repository must remain useful when copied to another GitHub organization, so organization-specific branch governance is not encoded as a fake runtime mechanism.

The intended `main` ruleset is declared in [`config/github-main-ruleset-contract.json`](../config/github-main-ruleset-contract.json). That file is a source-controlled governance contract, **not** proof that GitHub administrator settings are active.

## Source-enforced controls

The repository itself enforces or declares:

- pinned GitHub Actions commits
- read-only permissions for normal verification workflows
- bounded workflow execution time
- deterministic `npm ci`
- strict TypeScript / Vitest / architecture checks
- deterministic runtime release bundle + internal SHA-256 manifest
- CycloneDX runtime SBOM + `SHA256SUMS`
- tag-only GitHub provenance/SBOM attestations
- executable PostgreSQL migration + RLS/RPC acceptance with synthetic identities
- CodeQL analysis for JavaScript/TypeScript and Python
- OSV-Scanner against the committed `package-lock.json`, failing on any known vulnerability
- Dependabot updates
- CODEOWNERS ownership declarations
- SECURITY.md vulnerability reporting boundary
- versioned Supabase migrations
- same-identity mutation verification
- caller-generated document identity and idempotent exact put replay
- explicit owner/editor authorization before document write replay reconciliation
- a machine-readable intended `main` ruleset contract
- a governance checker that fails when required workflow job contexts drift from that contract

## GitHub administrator controls

A production organization should create an **active repository ruleset targeting `main`**.

The required status contexts are derived from jobs that have actually completed successfully on `main`, not from workflow display names:

- `check` from workflow `architecture`
- `bundle` from workflow `release-integrity`
- `postgres-contract` from workflow `database-contract`
- `scan` from workflow `dependency-vulnerability-scan`
- `CodeQL (javascript-typescript)` from workflow `codeql`
- `CodeQL (python)` from workflow `codeql`

Recommended minimum ruleset behavior:

1. Require pull requests before merging.
2. Require all six status contexts above.
3. Require the branch to be up to date before merge.
4. Block force pushes.
5. Block branch deletion.
6. Restrict bypass to a small break-glass administrator set.

For this single-maintainer public reference repository, the declarative baseline keeps required approvals at `0` so the repository does not become impossible to maintain. For a multi-maintainer production fork, require at least one independent approval and enable CODEOWNERS review for security-critical paths.

## Applying the public-reference ruleset

In GitHub repository administration, create a branch ruleset with these values:

```text
Name: enterprise-main
Enforcement: Active
Target: default branch / main
Require pull request: yes
Required approvals: 0 for this single-maintainer public reference
Require status checks: yes
Require branch up to date: yes
Block force pushes: yes
Block deletion: yes
Required contexts:
  check
  bundle
  postgres-contract
  scan
  CodeQL (javascript-typescript)
  CodeQL (python)
```

For an organization production fork, change approvals to at least `1`, require CODEOWNERS review when an eligible independent reviewer exists, and keep bypass actors limited to documented break-glass administrators.

After applying the setting, verify the repository ruleset API or GitHub UI shows an active ruleset targeting `main`. Source files must never claim the administrator state is active unless it has been separately read back.

## GitHub security settings

GitHub-side features are separately administered state. Recommended production settings include:

- enable Dependency Graph;
- enable Dependabot alerts/security updates as appropriate;
- enable GitHub Dependency Review once Dependency Graph is available, then require it in the main ruleset;
- enable secret scanning and push protection where available;
- enable private vulnerability reporting where available;
- require signed commits or vigilant mode when organizational policy requires it.

The current public reference repository enforces an OSV lockfile scan entirely from source even when Dependency Graph is not enabled. GitHub Dependency Review is an additional graph-backed control, not a substitute for the source-enforced OSV scan.

## Release integrity boundary

`release-integrity` is a required source check. On pull requests and `main` it builds the production runtime, constructs the release tarball twice, requires byte-for-byte equality, verifies the archive's internal `RELEASE-MANIFEST.json`, generates a CycloneDX runtime SBOM, and verifies SHA-256 checksums.

Only version-tag jobs receive OIDC/attestation write authority. They require `v<package.json version>`, rebuild the tagged commit, upload the release materials as a GitHub Actions artifact, and create GitHub provenance plus SBOM attestations. See `docs/RELEASE_INTEGRITY.md`.

## Database contract boundary

`database-contract` is source-controlled and uses only synthetic identities/content. It starts PostgreSQL on the GitHub-hosted Ubuntu 24.04 runner, bootstraps the minimum Auth compatibility surface required by the migrations, applies every migration in order with `ON_ERROR_STOP`, and executes the document authorization/RPC acceptance suite.

This proves the checked-in SQL works on PostgreSQL and that the modeled owner/editor/viewer/outsider/anon boundaries behave as expected. It does **not** replace acceptance against the organization's real Supabase project, Auth configuration, quotas, network policy, backup configuration, or platform-specific settings.

## Recommended repository options

For a production fork or internal repository:

- prefer squash merge as the normal history shape
- delete head branches after merge
- disable unused repository features if they create an unmanaged support surface
- periodically review repository permissions and bypass actors

## Current public-reference limitation

Repository rulesets and GitHub security-analysis settings are administrative state. They are not represented by Markdown, TypeScript, Supabase migrations, or Agent Skills and must not be simulated by a custom Control Plane.

`config/github-main-ruleset-contract.json` expresses intended state only. `tooling/github_governance_check.py` verifies that the declared contexts still correspond to source-controlled workflow jobs; it deliberately does not pretend to verify GitHub administrator state.

## Break-glass principle

Do not weaken ordinary branch rules simply to make emergency changes easier.

If the organization needs break-glass capability:

- define authorized operators in GitHub administration
- keep bypass membership minimal
- record the reason externally or in the pull request/incident record
- restore normal flow immediately after containment

No runtime Agent or repository Skill grants itself branch-rule bypass authority.
