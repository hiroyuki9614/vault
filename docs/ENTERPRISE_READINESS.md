# Enterprise Readiness Baseline

## Purpose

This document defines what the public Vault reference runtime guarantees at repository level and what a production organization must still provide.

The goal is an enterprise engineering baseline, not a compliance certification or managed-service promise.

## Repository-level controls

The current baseline requires:

- TypeScript as the executable runtime language
- strict compiler checks
- Functional Core / Effectful Adapter separation
- provider-free public capability contracts
- Supabase behind semantic Ports / Adapters
- Supabase Auth + RLS for mutable data authorization
- optimistic concurrency for document writes
- same-document-ID read-back after mutation
- caller-generated document identity for create
- idempotent exact replay for create and update puts
- semantic store error codes instead of provider error objects
- versioned SQL migrations
- exact direct development dependency versions
- committed npm lockfile and `npm ci` in CI
- bounded CI execution time
- GitHub Actions pinned to immutable commits
- CodeQL for JavaScript/TypeScript and Python
- pull-request dependency review
- Dependabot for npm and GitHub Actions
- CODEOWNERS for security-critical paths
- architecture regression checks
- security reporting policy

## Document write completion contract

A document write is not complete merely because the provider reports success.

```text
command
  -> pure validation / effect plan
  -> semantic DocumentStore
  -> Supabase RPC mutation
  -> validate mutation result
  -> read same document identity
  -> verify expected state and version
  -> completed
```

Create requires a caller-generated UUID and must return version `1`. Update must return `expectedVersion + 1`.

A mismatched mutation result or read-back fails closed.

### Ambiguous transport outcomes

The runtime may receive an infrastructure failure after PostgreSQL has already committed a write. To avoid duplicate or accidental second writes:

- exact create replay uses the same caller-generated document UUID and returns the already committed version-1 row;
- exact update replay with the same identity, `expectedVersion`, and desired state returns the already committed `expectedVersion + 1` row;
- same create identity with different state fails as `idempotency_conflict`;
- a path already owned by another identity fails as `path_conflict`;
- delete transport ambiguity is reconciled by same-ID read before deciding whether another delete attempt is needed.

The pure core does not implement sleep/retry loops. Retry/reconciliation cadence remains caller-owned.

Delete completion requires:

```text
delete RPC returns requested document id
  -> get_document_by_id(vault_id, document_id)
  -> no row
```

Path is a mutable locator and is not used as identity evidence.

## Stable failure contract

Provider-specific errors are mapped at the adapter boundary to semantic `DocumentStoreError` codes:

- `not_found`
- `version_conflict`
- `idempotency_conflict`
- `path_conflict`
- `permission_denied`
- `unauthenticated`
- `invalid_request`
- `unavailable`
- `invalid_response`
- `unknown`

`unavailable` identifies a transport/infrastructure condition that may be retried after applying the operation's reconciliation rules. Provider error text is not the application contract.

## Repository security automation

Source-controlled checks include:

- read-only architecture verification workflow
- CodeQL `security-extended` analysis for JavaScript/TypeScript and Python
- dependency review that rejects newly introduced High/Critical vulnerabilities
- immutable commit SHA pinning for third-party GitHub Actions
- Dependabot updates
- CODEOWNERS declarations

These controls do not replace GitHub-side branch rules. See `docs/REPOSITORY_GOVERNANCE.md`.

## Recommended production topology

Use separate environments and credentials.

```text
Developer / CI
      |
      v
application / agent caller
      |
      v
public TypeScript capability contract
      |
      v
Supabase adapter
      |
      v
Supabase project per environment
  Auth + RLS + PostgreSQL
```

Recommended environment separation:

- development
- staging / acceptance
- production

Do not share service-role credentials between environments.

## Organization controls required before production

### Identity and access

- organization SSO / MFA policy where applicable
- least-privilege repository access
- protected production credentials
- controlled Supabase administrator access
- periodic access review

### Data protection

- backup and restore policy
- tested recovery procedure
- retention and deletion policy
- data residency decision
- encryption / key-management requirements beyond platform defaults when required

### Operations

- monitoring and alerting
- application / database error logging with secret redaction
- incident ownership and escalation path
- maintenance windows / change policy when required
- capacity and quota monitoring

### Delivery

- protected `main` branch or active ruleset
- required passing architecture / CodeQL / dependency checks as appropriate
- pull-request review policy appropriate to the organization
- controlled production deployment authority
- migration rollout / rollback procedure

### Security

- dependency update review
- vulnerability triage
- secret scanning / push protection where available
- periodic RLS / authorization verification
- penetration testing when risk or policy requires it

## Recommended acceptance before a production rollout

At minimum, verify with synthetic test users:

1. owner can read/write/delete documents.
2. editor can read/write documents but cannot perform owner-only membership operations.
3. viewer can read but cannot write.
4. unauthenticated access is rejected.
5. stale `expectedVersion` fails without mutation.
6. successful create/update returns and read-backs the same document ID.
7. replaying the exact same create does not create a second document.
8. reusing a create ID with different state fails closed.
9. path collision across identities fails closed.
10. replaying an already committed exact update returns the committed version rather than mutating twice.
11. delete is followed by same-ID absence.
12. Supabase outage does not create a GitHub or local second canonical.
13. runtime logs do not contain secrets.
14. backup restore is demonstrated in the target organization's environment.
15. repository ruleset / branch protection matches the organization's approved governance policy.

## Non-claims

This repository does **not** by itself claim or provide:

- SOC 2 certification
- ISO 27001 certification
- PCI DSS compliance
- HIPAA compliance
- contractual uptime or support SLA
- managed backups or disaster recovery
- production monitoring service
- legal / regulatory suitability for a specific organization

Those require organization-specific controls and evidence.

## Licensing gate for external reuse

A public repository without an explicit license should not be treated as automatically licensed for third-party commercial reuse.

Before presenting this project as an externally reusable enterprise component, the repository owner must deliberately choose and add an appropriate license. This is a legal / business decision and is intentionally not automated by the engineering baseline.
