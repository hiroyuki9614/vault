---
public_artifact_id: 2862b22a-f337-4293-bcec-7ff7bf01b755
document_type: policy
status: public_reference
---

# Information Architecture

## Purpose

This document defines stable identity and canonical-boundary rules for durable repository artifacts in the public Vault Reference Implementation.

It intentionally separates two identity domains:

```text
mutable Vault document data
  -> public.documents.id

Git-managed durable public artifact
  -> public_artifact_id in YAML frontmatter
```

These identities are not interchangeable and must not be synchronized into one global ID space.

## Mutable Vault document identity

Documents stored as Vault data use the database document `id` as stable identity. Their `path` is a mutable locator.

The existing Documents Capability owns creation, mutation, optimistic concurrency and same-ID read-back for this domain. Repository artifact metadata must not replace or shadow `public.documents.id`.

## Durable repository artifact identity

A Git-managed Markdown artifact that needs identity independent of file path uses:

```yaml
---
public_artifact_id: <machine-generated UUID>
document_type: <semantic type>
status: <lifecycle status>
---
```

`public_artifact_id` is stable identity. The repository path is a locator.

### When an ID is required

Use `public_artifact_id` when at least one of these is true:

- the artifact is a canonical or durable architecture, governance, policy, requirements, runbook, Prompt, Template, Skill or routing/index contract;
- other artifacts or tools may need to refer to the same artifact after rename or move;
- lifecycle promotion or replacement must distinguish "same artifact changed" from "new artifact created";
- the artifact is intended as a reusable public reference rather than transient prose.

Do not require an ID merely because a file is Markdown.

Typical exclusions include transient notes, generated output, changelog entries, migration files, examples that are not canonical contracts, and simple landing-page prose whose path is intentionally its only locator.

If an excluded artifact later becomes durable or identity-bearing, assign an ID at that transition.

## Identity lifecycle

For the same semantic artifact:

```text
rename            -> keep public_artifact_id
move              -> keep public_artifact_id
ordinary edit     -> keep public_artifact_id
major revision    -> keep public_artifact_id when it is still the same canonical artifact
lifecycle status  -> keep public_artifact_id
```

Create a fresh `public_artifact_id` when creating a semantically independent artifact, fork, copy intended to evolve independently, or replacement whose identity must be distinct from the predecessor.

Do not reuse an ID from a deleted or superseded independent artifact for unrelated content.

## Uniqueness

Within this public repository, one `public_artifact_id` identifies one semantic artifact.

Two independently current files must not share the same ID. Temporary duplication during a deliberate migration must not become a steady-state second canonical.

IDs should be machine-generated UUIDs rather than semantic names. Meaning belongs in `document_type`, `status`, title and content, not in the identifier itself.

## Public publication boundary

This public repository is not a mirror of private or shared Vaults.

When a private/shared artifact is deliberately distilled or published here as an independent public artifact:

```text
private/shared identity
  -X-> do not copy as public identity

public artifact
  -> issue fresh public_artifact_id
```

The public artifact may record non-sensitive provenance when useful, but its public identity remains independent.

## Template and generated-document boundary

A reusable Template may have its own stable `public_artifact_id`.

A durable artifact generated from that Template receives a fresh `public_artifact_id`; the Template ID is provenance, not the generated artifact's identity. Do not clone the Template identity into generated documents.

## Backfill rule

Existing durable repository artifacts that predate this policy are not invalid solely because they lack `public_artifact_id`.

Backfill identity when one of these occurs:

- the artifact is materially updated;
- it is promoted into a durable/canonical public contract;
- stable cross-path reference becomes necessary;
- identity ambiguity is discovered.

Do not create a repository-wide rewrite merely to add UUIDs to every Markdown file.

## Minimal metadata rule

Do not expand frontmatter into a second content model. The minimum durable identity metadata is:

```text
public_artifact_id
document_type
status
```

Additional metadata is added only when a concrete consumer or governance rule needs it.

## Read-back rule

After creating, moving or materially updating an identity-bearing repository artifact, verify the artifact by the same `public_artifact_id` and confirm that no unintended duplicate current artifact was created.

Path-only verification is insufficient when identity continuity is material.

## Relationship to design-document work

`technical-design-document` and other artifact-producing Skills must preserve an existing `public_artifact_id` for the same artifact and issue a fresh ID only when they create a new independent durable artifact.

This identity rule must not be used as a reason to create unnecessary documents, registries, workflow layers or a repository-wide document database.
