# Repository Governance

## Purpose

This document separates controls that are enforceable from repository source from controls that require GitHub repository administrator settings.

The source repository must remain useful even when copied to another GitHub organization, so organization-specific branch governance is not encoded as a fake runtime mechanism.

## Source-enforced controls

The repository itself enforces or declares:

- pinned GitHub Actions commits
- read-only permissions for normal verification workflows
- bounded workflow execution time
- deterministic `npm ci`
- strict TypeScript / Vitest / architecture checks
- CodeQL analysis for JavaScript/TypeScript and Python
- dependency review for pull-request dependency changes
- Dependabot updates
- CODEOWNERS ownership declarations
- SECURITY.md vulnerability reporting boundary
- versioned Supabase migrations
- same-identity mutation verification
- idempotent document create using caller-generated UUID

## GitHub administrator controls

A production organization should create an **active repository ruleset targeting `main`**.

Recommended minimum:

1. Require pull requests before merging.
2. Require the repository's `architecture` check.
3. Require dependency-review when a pull request changes dependencies.
4. Require CodeQL checks appropriate to the changed languages / organization policy.
5. Block force pushes.
6. Block branch deletion.
7. Require the branch to be up to date before merge when the organization values strict merge-head verification.
8. Restrict bypass to a small break-glass administrator set.
9. Require at least one independent approval for multi-maintainer production use.
10. Require CODEOWNERS review for security-critical paths when there is an independent eligible reviewer.

For a single-maintainer reference repository, rules that require a second human reviewer can make all maintenance impossible. The production organization, not this public reference repository, owns that staffing/policy decision.

## Recommended repository options

For a production fork or internal repository:

- prefer squash merge as the normal history shape
- delete head branches after merge
- enable private vulnerability reporting where available
- enable secret scanning and push protection where available
- enable dependency graph / Dependabot alerts
- disable unused repository features if they create an unmanaged support surface
- require signed commits or vigilant mode when organizational policy requires it

## Current public-reference limitation

Repository rulesets are GitHub-side administrative state. They are not represented by Markdown, TypeScript, Supabase migrations, or Agent Skills and must not be simulated by a custom Control Plane.

The public reference repository should periodically verify that its intended GitHub settings still match this document, but GitHub-side settings remain separately administered state.

## Break-glass principle

Do not weaken ordinary branch rules simply to make emergency changes easier.

If the organization needs break-glass capability:

- define the authorized operators in GitHub administration
- keep bypass membership minimal
- record the reason externally or in the pull request/incident record
- restore normal flow immediately after containment

No runtime Agent or repository Skill grants itself branch-rule bypass authority.
