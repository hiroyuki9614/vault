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
- semantic store error codes instead of provider error objects
- versioned SQL migrations
- exact direct development dependency versions
- committed npm lockfile and `npm ci` in CI
- bounded CI execution time
- dependency update automation for npm and GitHub Actions
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

Create must return version `1`. Update must return `expectedVersion + 1`.

A mismatched mutation result or read-back fails closed.

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
- `permission_denied`
- `unauthenticated`
- `invalid_request`
- `unavailable`
- `invalid_response`
- `unknown`

Only `unavailable` is retryable by default. Retry policy remains caller-owned; the core does not sleep, retry, or inspect provider-specific errors.

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

A production organization should explicitly provide and verify:

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

- protected `main` branch
- required passing CI checks
- pull-request review policy appropriate to the organization
- controlled production deployment authority
- migration rollout / rollback procedure

### Security

- dependency update review
- vulnerability triage
- secret scanning / repository security features appropriate to the GitHub plan
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
7. delete is followed by same-ID absence.
8. Supabase outage does not create a GitHub or local second canonical.
9. runtime logs do not contain secrets.
10. backup restore is demonstrated in the target organization's environment.

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
