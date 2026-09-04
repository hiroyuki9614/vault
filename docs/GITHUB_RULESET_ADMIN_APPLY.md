# GitHub Ruleset Administrator Apply

## Purpose

The repository declares its intended `main` and `v*` governance in source, but GitHub repository rulesets are administrator-managed state. This procedure turns the source contracts into GitHub REST payloads without hand-copying rule names, status contexts, or tag restrictions.

The renderer is intentionally **non-mutating**. It writes JSON payloads and can print the `gh api` commands an administrator may choose to run. It never creates, updates, or deletes a GitHub ruleset by itself.

## Prerequisites

- GitHub CLI (`gh`) authenticated as a repository administrator, or an equivalent fine-grained token.
- Repository `Administration` permission with write access for ruleset creation/update.
- Run from a trusted checkout of the intended `main` commit.
- Confirm the source checks are green before activating governance.

GitHub REST API version used by the helper documentation: `2026-03-10`.

## 1. Render payloads

From repository root:

```bash
python tooling/github_ruleset_admin_helper.py \
  --output-dir .ruleset-payloads \
  --print-apply-commands
```

Expected files:

```text
.ruleset-payloads/enterprise-main.json
.ruleset-payloads/enterprise-release-tags.json
```

The renderer reads:

```text
config/github-main-ruleset-contract.json
config/github-release-tag-ruleset-contract.json
```

and fails closed if required source invariants have been weakened.

## 2. Inspect before mutation

Review both JSON files before using them. The public-reference payloads intentionally use only the GitHub built-in **Admin repository role** as a bypass actor:

```json
{
  "actor_id": 5,
  "actor_type": "RepositoryRole",
  "bypass_mode": "always"
}
```

This is the break-glass boundary for the single-maintainer public reference repository. A production organization should replace or further constrain bypass actors according to its own release/operator model before activation.

The main payload must include:

- target: `branch`
- active enforcement
- default branch condition
- pull-request requirement
- required status checks
- strict up-to-date status-check policy
- deletion restriction
- non-fast-forward restriction

The release-tag payload must include:

- target: `tag`
- active enforcement
- `refs/tags/v*`
- creation restriction
- update restriction
- deletion restriction

## 3. Read current administrator state

Before creating anything:

```bash
gh api \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/hiroyuki9614/vault/rulesets
```

If a ruleset with the intended name already exists, inspect it instead of creating a duplicate. Repository rulesets are administrator state; source generation does not make repeated POST requests idempotent.

## 4. Create missing rulesets

Only after inspection, an administrator may run the commands printed by the renderer. Equivalent explicit commands are:

```bash
gh api --method POST \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/hiroyuki9614/vault/rulesets \
  --input .ruleset-payloads/enterprise-main.json

gh api --method POST \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/hiroyuki9614/vault/rulesets \
  --input .ruleset-payloads/enterprise-release-tags.json
```

Do not use these POST commands when a same-purpose ruleset already exists. Update the existing ruleset through the GitHub UI or the repository ruleset update endpoint after comparing it with the source contract.

## 5. Read back actual state

After administrator mutation:

```bash
gh api \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/hiroyuki9614/vault/rulesets
```

Then inspect each returned ruleset ID:

```bash
gh api \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/hiroyuki9614/vault/rulesets/RULESET_ID
```

Confirm the effective state, not merely the source file:

### `enterprise-main`

- enforcement is active
- target is branch/default branch
- pull requests are required
- required checks are exactly:
  - `check`
  - `bundle`
  - `postgres-contract`
  - `scan`
  - `CodeQL (javascript-typescript)`
  - `CodeQL (python)`
- strict/up-to-date required checks are enabled
- deletion is blocked for ordinary writers
- force pushes are blocked for ordinary writers

### `enterprise-release-tags`

- enforcement is active
- target is `refs/tags/v*`
- ordinary writers cannot create matching tags
- ordinary writers cannot update/move matching tags
- ordinary writers cannot delete matching tags
- bypass is limited to the documented administrator boundary

## 6. Behavioral acceptance

Do not close the governance issue based only on JSON shape. Exercise the rules with synthetic/non-production operations where practical:

1. Open a synthetic PR and confirm the six required contexts gate merge.
2. Confirm a stale branch must be updated before merge.
3. Confirm ordinary direct push/force-push/deletion paths to `main` are rejected.
4. Confirm an ordinary writer cannot create, move, or delete a synthetic matching `v*` tag.
5. Confirm the documented break-glass administrator can perform only the intended exceptional action.

Do not use a real production release tag merely to test ruleset behavior.

## Safety boundary

The helper does not:

- obtain or store administrator credentials;
- mutate GitHub;
- create a version tag;
- create a GitHub Release;
- bypass repository rules;
- claim the GitHub rulesets are active before read-back.

Source contract, rendered payload, administrator state, and behavioral acceptance are separate evidence layers.
