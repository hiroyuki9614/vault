# Release Tag Governance

## Purpose

Version tags are release authority, not ordinary source labels. A `v*` tag can trigger the attestation path in `.github/workflows/release-integrity.yml`, so the repository separates source-enforced release eligibility from GitHub administrator-enforced tag mutation controls.

The intended GitHub tag ruleset is declared in `config/github-release-tag-ruleset-contract.json`. That declaration is not proof that the GitHub ruleset is active.

## Source-enforced release eligibility

The `attest-tag` job accepts a version tag only when both conditions hold:

1. the tag exactly matches `v<package.json version>`;
2. the tagged commit is already integrated into `main`.

The workflow fetches the current `main` ref and requires:

```bash
git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main
```

This prevents a feature-branch or otherwise unmerged commit from becoming an attested release merely because its package version matches the tag.

## GitHub administrator ruleset

Create an active **tag ruleset** targeting:

```text
v*
```

Recommended public-reference behavior:

```text
Name: enterprise-release-tags
Enforcement: Active
Target tags: v*
Restrict creations: yes
Restrict updates: yes
Restrict deletions: yes
Bypass: release or break-glass administrators only
```

`Restrict creations` limits who can declare a version release. `Restrict updates` prevents an existing release tag from being moved to another commit. `Restrict deletions` prevents ordinary deletion of published release identity.

For a production organization, use a small documented release-administrator group rather than broad repository write access as the bypass set.

## Separation of controls

The source workflow can prove that a tag is version-consistent and points to a commit integrated into `main`. It cannot make a GitHub ref immutable after the workflow has run.

GitHub ruleset state is therefore the enforcement plane for creation/update/deletion restrictions. Do not claim release-tag immutability until the active GitHub ruleset has been read back separately.

## Verification

Before treating release-tag governance as active:

1. verify GitHub Rulesets shows an active tag ruleset targeting `v*`;
2. verify ordinary writers cannot create version tags;
3. verify ordinary writers cannot move an existing version tag;
4. verify ordinary writers cannot delete an existing version tag;
5. verify the bypass set is limited to documented release/break-glass administrators;
6. verify an attested version tag points to a commit integrated into `main` and matches `package.json`.

The repository intentionally does not create a version tag automatically. Creating a release remains an explicit release decision.
