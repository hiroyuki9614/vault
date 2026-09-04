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
- explicit owner/editor authorization before document write replay reconciliation
- optimistic concurrency for document writes
- same-document-ID read-back after mutation
- caller-generated document identity for create
- idempotent exact replay for create and update puts
- semantic store error codes instead of provider error objects
- versioned SQL migrations
- executable PostgreSQL migration + RLS/RPC acceptance using synthetic identities
- exact direct development dependency versions
- committed npm lockfile and `npm ci` in CI
- production TypeScript emit plus built-entrypoint startup/shutdown smoke
- loopback-only Node bind by default for Apache deployments
- bounded request body, header, request, upstream and shutdown timeouts
- bearer-scoped Supabase RPC transport using the caller identity
- no Supabase service-role credential in the normal HTTP runtime contract
- Apache reverse-proxy reference configuration
- Apache configuration syntax validation plus live Apache-to-Node CI smoke
- hardened systemd reference unit
- bounded CI execution time
- GitHub Actions pinned to immutable commits
- CodeQL for JavaScript/TypeScript and Python
- OSV-Scanner scan of the committed `package-lock.json`
- dependency vulnerability gate that fails on any known vulnerability reported by OSV
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

### Write authorization before reconciliation

RLS remains authoritative, but write RPCs also perform an explicit semantic role check before mutation or exact-replay reconciliation:

```text
owner/editor -> may enter put/delete mutation + reconciliation
viewer       -> permission_denied
non-member   -> permission_denied
anon         -> no RPC execute authority
```

This prevents a read-authorized viewer from receiving a write-shaped success result when an already-committed row happens to match an exact replay request.

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

At the HTTP surface, semantic authorization is preserved: the database `permission_denied` exception maps through the TypeScript adapter to HTTP 403 rather than becoming a provider-shaped 5xx response.

## Executable database contract

`.github/workflows/database-contract.yml` turns the database contract into executable evidence rather than static SQL-string inspection only.

On the GitHub-hosted Ubuntu 24.04 runner it:

1. starts PostgreSQL;
2. creates an isolated `vault_ci` database;
3. bootstraps a minimal synthetic Supabase Auth compatibility fixture;
4. applies every committed migration in lexical order with `ON_ERROR_STOP`;
5. executes `tests/postgres/document-rls-acceptance.sql`.

The acceptance suite uses only synthetic UUIDs/content and verifies:

- owner document read/write/delete;
- editor document read/write and owner-only membership denial;
- viewer read plus explicit write/delete denial, including an exact-replay-shaped request;
- authenticated non-member tenant isolation and write denial;
- anonymous RPC execution denial;
- caller-generated create identity and version `1`;
- exact create replay without duplicate rows;
- `idempotency_conflict` and `path_conflict`;
- exact update replay without a second mutation;
- divergent stale update `version_conflict`;
- same-ID absence after delete.

This is repository-level PostgreSQL evidence. It is not a substitute for acceptance against a real target Supabase project and its Auth/platform configuration.

## Apache production topology

The reference HTTP production shape is:

```text
Client
  |
  v
Apache HTTP Server :443
  TLS termination
  request size / proxy timeout / header boundary
  |
  v
127.0.0.1:3100
Node.js 24 Vault HTTP runtime
  |
  v
DocumentService
  |
  v
Supabase REST/RPC
  caller Bearer JWT + publishable/anon key
  |
  v
Supabase Auth + RLS + PostgreSQL
```

Apache is the public listener. The Node runtime defaults to `127.0.0.1` and requires an explicit override before it can bind a non-loopback address.

The normal HTTP runtime does not use a service-role credential. `/v1/*` requests require the caller's Supabase Bearer access token; that identity reaches the existing RLS boundary.

The source-controlled reference also provides:

- an Apache vhost with TLS termination placeholders, fixed-host HTTP redirect, `ProxyRequests Off`, explicit Authorization preservation, request body/header limits and proxy timeouts;
- an intentionally empty fallback document root so unrelated paths do not serve application/repository files;
- a systemd unit using a dedicated `vault` account, `NoNewPrivileges`, filesystem/kernel protection and an empty capability bounding set;
- graceful SIGTERM/SIGINT shutdown;
- liveness/readiness endpoints;
- a production build/start smoke in CI;
- `apachectl configtest` plus a live HTTPS reverse-proxy smoke in CI.

The live Apache CI smoke proves that anonymous `/v1/*` remains 401 and that an authenticated synthetic request reaches the Node router rather than having its Authorization header stripped at the Apache boundary.

See `docs/APACHE_DEPLOYMENT.md` for deployment details.

## Repository security automation

Source-controlled checks include:

- read-only architecture verification workflow
- production build/start/shutdown smoke
- Apache configuration validation and live reverse-proxy smoke
- executable database contract workflow
- CodeQL `security-extended` analysis for JavaScript/TypeScript and Python
- OSV-Scanner lockfile vulnerability scan
- failure on any known vulnerability reported for the committed npm lockfile
- immutable commit SHA pinning for third-party GitHub Actions
- Dependabot updates
- CODEOWNERS declarations

The dependency gate does not rely on the npm Advisory API. GitHub Dependency Review is an additional graph-backed control that requires Dependency Graph to be enabled in repository administration. Production organizations should enable and require it when available. See `docs/REPOSITORY_GOVERNANCE.md`.

## Recommended environment separation

Use separate environments and credentials:

- development
- staging / acceptance
- production

Do not share service-role credentials between environments. Normal application runtime does not need a service-role credential at all.

## Organization controls required before production

### Identity and access

- organization SSO / MFA policy where applicable
- least-privilege repository access
- protected production credentials
- controlled Supabase administrator access
- periodic access review

### Host and edge

- production DNS ownership and change control
- TLS certificate issuance and renewal
- firewall policy that keeps Node port `3100` non-public
- OS security updates
- Apache package/module lifecycle and configuration ownership
- dedicated service account creation and permissions
- global Apache directives, such as organization-approved `ServerTokens`, owned at server configuration scope rather than copied into the vhost

### Data protection

- backup and restore policy
- tested recovery procedure
- retention and deletion policy
- data residency decision
- encryption / key-management requirements beyond platform defaults when required

### Operations

- monitoring and alerting
- Apache / application / database error logging with secret redaction
- centralized log retention/aggregation when required
- incident ownership and escalation path
- maintenance windows / change policy when required
- capacity and quota monitoring

### Delivery

- protected `main` branch or active ruleset
- required passing `architecture`, `database-contract`, CodeQL, and `dependency-vulnerability-scan` checks
- GitHub Dependency Review required once Dependency Graph is enabled
- pull-request review policy appropriate to the organization
- controlled production deployment authority
- migration rollout / rollback procedure

### Security

- dependency update review
- vulnerability triage
- secret scanning / push protection where available
- periodic RLS / authorization verification in the target Supabase environment
- penetration testing when risk or policy requires it

## Recommended acceptance before a production rollout

At minimum, verify with synthetic test users in the target environment:

1. `npm run check` and `npm run build` pass for the exact release.
2. built `dist/server/main.js` starts and handles SIGTERM cleanly.
3. Node binds `127.0.0.1:3100`, not a public interface.
4. host firewall does not expose port `3100` externally.
5. `apachectl configtest` returns `Syntax OK` before reload.
6. Apache has `ProxyRequests Off` and only the intended reverse-proxy mappings.
7. HTTPS liveness/readiness through Apache succeeds.
8. anonymous `/v1/*` requests return 401.
9. a synthetic Bearer request reaches the Node HTTP router through Apache.
10. non-JSON authenticated POST returns 415.
11. owner can read/write/delete documents.
12. editor can read/write documents but cannot perform owner-only membership operations.
13. viewer can read but cannot write, including exact-replay-shaped write attempts.
14. authenticated non-members cannot read or write another vault.
15. stale `expectedVersion` fails without mutation.
16. successful create/update returns and read-backs the same document ID.
17. replaying the exact same create does not create a second document.
18. reusing a create ID with different state fails closed.
19. path collision across identities fails closed.
20. replaying an already committed exact update returns the committed version rather than mutating twice.
21. delete is followed by same-ID absence.
22. Supabase outage returns a bounded 503 and does not create a GitHub or local second canonical.
23. Apache/Node logs contain request correlation data but not Authorization values, access tokens, Supabase keys, captured Authorization environment values, or request bodies.
24. the Apache fallback document root is empty and does not contain repository/application files.
25. backup restore is demonstrated in the target organization's environment.
26. repository ruleset / branch protection matches the organization's approved governance policy.
27. OSV dependency vulnerability scan is green for the exact committed lockfile being released.
28. repository `database-contract` is green for the exact migration set being released.

## Non-claims

This repository does **not** by itself claim or provide:

- SOC 2 certification
- ISO 27001 certification
- PCI DSS compliance
- HIPAA compliance
- contractual uptime or support SLA
- managed backups or disaster recovery
- production monitoring service
- DNS or certificate management service
- host firewall/OS management
- legal / regulatory suitability for a specific organization

Those require organization-specific controls and evidence.

## Licensing gate for external reuse

A public repository without an explicit license should not be treated as automatically licensed for third-party commercial reuse.

Before presenting this project as an externally reusable enterprise component, the repository owner must deliberately choose and add an appropriate license. This is a legal / business decision and is intentionally not automated by the engineering baseline.
