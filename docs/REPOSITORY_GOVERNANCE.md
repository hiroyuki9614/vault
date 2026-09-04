# Repository Governance

## Purpose

This document separates controls enforceable from repository source from controls that require GitHub repository administrator settings.

The source repository must remain useful when copied to another GitHub organization, so organization-specific governance is not encoded as a fake runtime mechanism.

The intended `main` ruleset is declared in [`config/github-main-ruleset-contract.json`](../config/github-main-ruleset-contract.json). Release-tag governance is declared in [`config/github-release-tag-ruleset-contract.json`](../config/github-release-tag-ruleset-contract.json). These files are source-controlled governance contracts, **not** proof that GitHub administrator settings are active.

Administrator application is documented in [`docs/GITHUB_RULESET_ADMIN_APPLY.md`](GITHUB_RULESET_ADMIN_APPLY.md). `tooling/github_ruleset_admin_helper.py` deterministically renders GitHub REST payloads from the two contracts, but deliberately performs no GitHub mutation itself.

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
- release tags must match `package.json` and point to a commit integrated into `main` before attestation
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
- machine-readable intended `main` and `v*` release-tag ruleset contracts
- a governance checker that fails when required workflow contexts or release-tag governance drift from those contracts
- a non-mutating administrator payload renderer covered by CI regressions

## GitHub administrator controls: main

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

### Applying the public-reference main ruleset

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

The exact REST payload can be rendered from source with:

```bash
python tooling/github_ruleset_admin_helper.py \
  --output-dir .ruleset-payloads \
  --print-apply-commands
```

For an organization production fork, change approvals to at least `1`, require CODEOWNERS review when an eligible independent reviewer exists, and keep bypass actors limited to documented break-glass administrators.

## GitHub administrator controls: release tags

Version tags are release authority because `v*` can enter the attestation path. Create a second active **tag ruleset targeting `v*`** using the contract in `config/github-release-tag-ruleset-contract.json`.

Recommended behavior:

```text
Name: enterprise-release-tags
Enforcement: Active
Target tags: v*
Restrict creations: yes
Restrict updates: yes
Restrict deletions: yes
Bypass: release or break-glass administrators only
```

This limits who can declare a release, prevents ordinary writers from moving an existing version tag to a different commit, and prevents ordinary deletion of published release identity. See `docs/RELEASE_TAG_GOVERNANCE.md` for the source/runtime split and verification procedure. The same administrator helper renders the corresponding tag-ruleset REST payload.

After applying either ruleset, verify the repository ruleset API or GitHub UI shows the intended active state. Source files and rendered payloads must never be treated as proof that the administrator state is active; read-back and behavioral acceptance remain separate evidence.

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

Only version-tag jobs receive OIDC/attestation write authority. They require the tagged commit to be integrated into `main`, require `v<package.json version>`, rebuild the tagged commit, upload the release materials as a GitHub Actions artifact, and create GitHub provenance plus SBOM attestations. See `docs/RELEASE_INTEGRITY.md`.

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

`config/github-main-ruleset-contract.json` and `config/github-release-tag-ruleset-contract.json` express intended state only. `tooling/github_governance_check.py` verifies that the declarations still correspond to source-controlled workflow and release contracts. `tooling/github_ruleset_admin_helper.py` converts those declarations into reviewable REST payloads. Neither tool pretends to verify or mutate GitHub administrator state.

## Break-glass principle

Do not weaken ordinary branch or release-tag rules simply to make emergency changes easier.

If the organization needs break-glass capability:

- define authorized operators in GitHub administration
- keep bypass membership minimal
- record the reason externally or in the pull request/incident record
- restore normal flow immediately after containment

No runtime Agent or repository Skill grants itself branch-rule or release-tag bypass authority.
