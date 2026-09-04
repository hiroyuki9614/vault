# Repository Governance

## Purpose

This document separates controls enforceable from repository source from controls that require GitHub repository administrator settings.

The source repository must remain useful when copied to another GitHub organization, so organization-specific branch governance is not encoded as a fake runtime mechanism.

## Source-enforced controls

The repository itself enforces or declares:

- pinned GitHub Actions commits
- read-only permissions for normal verification workflows
- bounded workflow execution time
- deterministic `npm ci`
- strict TypeScript / Vitest / architecture checks
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

## GitHub administrator controls

A production organization should create an **active repository ruleset targeting `main`**.

Recommended minimum:

1. Require pull requests before merging.
2. Require the repository's `architecture` check.
3. Require the `database-contract` check for all changes that can affect migrations/RLS/RPC behavior; requiring it for every PR is the simpler safe default.
4. Require the `dependency-vulnerability-scan` check.
5. Require CodeQL checks appropriate to the changed languages / organization policy.
6. Block force pushes.
7. Block branch deletion.
8. Require the branch to be up to date before merge when strict merge-head verification is desired.
9. Restrict bypass to a small break-glass administrator set.
10. Require at least one independent approval for multi-maintainer production use.
11. Require CODEOWNERS review for security-critical paths when there is an independent eligible reviewer.

For a single-maintainer reference repository, rules that require a second human reviewer can make all maintenance impossible. The production organization, not this public reference repository, owns that staffing/policy decision.

## GitHub security settings

GitHub-side features are separately administered state. Recommended production settings include:

- enable Dependency Graph;
- enable Dependabot alerts/security updates as appropriate;
- enable GitHub Dependency Review once Dependency Graph is available, then require it in the main ruleset;
- enable secret scanning and push protection where available;
- enable private vulnerability reporting where available;
- require signed commits or vigilant mode when organizational policy requires it.

The current public reference repository enforces an OSV lockfile scan entirely from source even when Dependency Graph is not enabled. GitHub Dependency Review is an additional graph-backed control, not a substitute for the source-enforced OSV scan.

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

The public reference repository should periodically verify that intended GitHub settings still match this document, while GitHub-side settings remain separately administered state.

## Break-glass principle

Do not weaken ordinary branch rules simply to make emergency changes easier.

If the organization needs break-glass capability:

- define authorized operators in GitHub administration
- keep bypass membership minimal
- record the reason externally or in the pull request/incident record
- restore normal flow immediately after containment

No runtime Agent or repository Skill grants itself branch-rule bypass authority.
