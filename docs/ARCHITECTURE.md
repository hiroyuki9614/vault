# Architecture

## Purpose

This repository is a public Supabase-first Vault Reference Implementation, not a private/personal Vault instance.

Executable policy is TypeScript and follows a responsibility-first / Functional Core + Effectful Adapter structure.

```text
Caller
  |
  v
provider-free TypeScript public API
  |
  v
pure Functional Core
  |
  v
semantic Port
  |
  v
Effectful Adapter
  |
  v
Supabase Auth + RLS + PostgreSQL
  |
  v
canonical mutable data
```

For an HTTP deployment, Apache HTTP Server and the Node HTTP process are additional effectful boundaries around the same Capability:

```text
HTTPS client
  |
  v
Apache HTTP Server :443
  |
  v
127.0.0.1:3100 Node.js HTTP adapter
  |
  v
DocumentService
  |
  v
bearer-scoped Supabase REST/RPC
  |
  v
Supabase Auth + RLS + PostgreSQL
```

The functional core does not know about Apache, sockets, environment variables, process signals, HTTP headers, or Supabase transport details.

## Repository machine bootstrap

```text
core/machine/main/repository.json
core/machine/indexes/responsibilities.json
```

`repository.json` declares repository role, runtime/toolchain, database boundary, enterprise baseline and growth stoppers.

`responsibilities.json` declares owner, public contract, implementation boundary and forbidden responsibilities for each Capability.

No global orchestrator or fixed giant layer tree is required.

## Capability layout

Representative shape:

```text
<capability>/
  public.ts
  machine/
    contracts/
    core/
    ports/
    adapters/
    runtime/
```

### public.ts

Stable provider-free entry surface for callers. Provider names/types must not leak into this file.

### contracts

Provider-free TypeScript command/result/error contracts.

### core

Pure TypeScript policy:

```text
explicit immutable input
  -> validation
  -> decision
  -> normalized request / verification predicate
```

Core does not directly access network, Supabase/database clients, filesystem, process execution, environment lookup, wall clock, random source or deployment state.

### ports

Semantic external-effect contracts, such as `DocumentStore`.

Port errors are semantic. Provider error objects are not public contracts.

### adapters

Provider-specific effects and response parsing. The Supabase document adapter owns RPC parameter mapping, row validation and provider-to-semantic error mapping.

### runtime

Composition and effect orchestration only. Business decisions remain in core.

## Documents Capability

Current executable Capability:

```text
documents/public.ts
documents/machine/contracts/document.ts
documents/machine/core/document-policy.ts
documents/machine/ports/document-store.ts
documents/machine/adapters/supabase-rpc-document-store.ts
documents/machine/runtime/document-service.ts
```

### Write path

```text
PutDocumentCommand
  -> planPutDocument()                pure
  -> DocumentStore.put()              effect
  -> verifyPutMutation()              pure
  -> DocumentStore.getById()          effect
  -> verifyPutReadBack()              pure
  -> completed
```

Create requires caller-generated stable document identity and returns version `1`. Update returns `expectedVersion + 1`.

Read-back uses immutable document identity, not path.

### Authorization before replay reconciliation

RLS remains authoritative. In addition, database write RPCs explicitly require the semantic vault role to be `owner` or `editor` before mutation or exact-replay reconciliation begins.

```text
owner/editor -> write/reconcile allowed
viewer       -> permission_denied
non-member   -> permission_denied
anon         -> no execute grant
```

This closes a subtle boundary where a read-authorized viewer could otherwise reach the post-update exact-replay check after RLS caused an update to affect zero rows. A matching already-committed state must never be interpreted as authorized write success for a non-writer.

### Retry semantics

The database RPC is designed for ambiguous transport outcomes without adding a generic idempotency service.

```text
create(id=A, state=X)
  first commit           -> A/version 1
  exact replay           -> same A/version 1
  same A/different state -> idempotency_conflict
  same path/different id -> path_conflict

update(id=A, expected=N, state=Y)
  first commit            -> A/version N+1
  exact replay            -> same A/version N+1
  divergent replay        -> version_conflict
```

The runtime/core do not own retry timers. Caller owns retry cadence and delete reconciliation.

### Delete path

```text
DeleteDocumentCommand
  -> planDeleteDocument()             pure
  -> DocumentStore.delete()           effect
  -> returned id must equal plan id
  -> DocumentStore.getById()          effect
  -> verifyDeleteReadBack()           pure
```

`path` remains a locator. It is not identity evidence.

## Apache production boundary

The public HTTP deployment surface is intentionally narrow:

```text
GET  /health/live
GET  /health/ready
POST /v1/documents/get-by-path
POST /v1/documents/get-by-id
POST /v1/documents/put
POST /v1/documents/delete
```

The HTTP adapter is not a generic Supabase RPC proxy.

Apache owns:

- public TLS listener;
- fixed-host HTTP to HTTPS redirect;
- reverse-proxy mapping to the loopback Node listener;
- forward-proxy prohibition with `ProxyRequests Off`;
- request body/header limits;
- reverse-proxy connect/read timeouts;
- trusted forwarding protocol header;
- explicit caller Authorization preservation;
- empty fallback document root for non-proxied paths.

The Node process owns:

- loopback-only bind by default;
- runtime configuration validation;
- bearer-header validation;
- JSON/body-size validation;
- semantic HTTP error mapping;
- upstream Supabase timeout;
- structured request logs without token/key/body content;
- SIGTERM/SIGINT graceful shutdown.

Normal application traffic uses the caller's Supabase access token plus the configured publishable/anon key. A Supabase service-role credential is not part of the normal Node runtime contract.

`/health/ready` proves that configuration was accepted and the Node process is serving requests. It deliberately does not perform a database query on every probe. Supabase availability is surfaced through bounded operation-level failures.

The reference deployment is documented in [`APACHE_DEPLOYMENT.md`](APACHE_DEPLOYMENT.md).

## Canonical ownership

```text
Mutable human/user data
  -> Supabase PostgreSQL only

Executable domain policy
  -> TypeScript */machine/core

Public capability API
  -> TypeScript <capability>/public.ts

Provider-free detailed contracts
  -> TypeScript */machine/contracts and */machine/ports

HTTP / Apache / process lifecycle
  -> effectful deployment boundary

Schema / RLS / RPC definition
  -> versioned Git migration history

Architecture / Agent contract
  -> Git Markdown / JSON

Credentials
  -> deployment secret store only
```

GitHub and Supabase must not become independently mutable canonical stores for the same document.

## Semantic RPC boundary

The Supabase adapter currently maps:

```text
get_document(vault_id, path)
get_document_by_id(vault_id, document_id)
put_document(vault_id, document_id, path, title, content, metadata, expected_version)
delete_document(vault_id, document_id, expected_version)
```

`get_document_by_id` exists specifically so mutation completion can verify the same subject.

## Stable error boundary

Provider failures are normalized by the adapter to `DocumentStoreError`.

Semantic codes:

```text
not_found
version_conflict
idempotency_conflict
path_conflict
permission_denied
unauthenticated
invalid_request
unavailable
invalid_response
unknown
```

Provider-specific error objects/messages do not cross the Port boundary. `unavailable` denotes a transport/infrastructure condition that may be retried after applying operation-specific reconciliation.

The HTTP adapter maps these semantic failures to bounded HTTP status codes and never returns the raw Supabase/PostgreSQL provider message as the application contract.

## Security

Supabase Auth + RLS are mandatory.

- owner: vault/member/document administration
- editor: document read/write
- viewer: document read only
- unauthenticated: no data access

Service-role credentials are administration/migration credentials and are excluded from normal runtime contracts.

Repository security automation includes:

- immutable commit SHA pinning for third-party GitHub Actions
- CodeQL for JavaScript/TypeScript and Python with `security-extended`
- source-enforced OSV-Scanner scan of committed `package-lock.json`
- dependency scan failure on any known vulnerability reported by OSV
- Dependabot updates
- CODEOWNERS declarations for security-critical boundaries, including `server/` and `deploy/`

The dependency gate does not depend on the npm Advisory API. GitHub Dependency Review is an optional graph-backed enhancement that requires Dependency Graph to be enabled in repository administration. GitHub-side rulesets and security-analysis settings remain administrator-managed state; they are not simulated by runtime code.

## Failure boundary

```text
Supabase unavailable
  -> semantic unavailable failure
  -> HTTP 503 at the Apache/Node surface
  -> no GitHub fallback write
  -> no local second canonical
```

Mutation transport success alone is not completion. Mutation result and same-ID read-back must match the planned state.

## Build reproducibility

The runtime toolchain is pinned at repository level:

- Node.js 24 major line
- npm 11 major line
- exact direct dev dependency versions
- committed `package-lock.json`
- CI installs with `npm ci`
- production emit via `tsconfig.build.json`
- CI starts the emitted `dist/server/main.js`, verifies loopback health, sends SIGTERM, and requires clean shutdown
- CI validates the checked-in Apache vhost with `apachectl configtest`
- CI starts Apache and proves HTTPS health plus Bearer pass-through semantics to the Node boundary
- GitHub Actions referenced by immutable 40-hex commit SHA

Dependabot proposes npm and GitHub Actions updates; updates still pass the same architecture/type/test/security gates.

## Executable database verification

Static inspection of SQL is not sufficient for the enterprise baseline. `.github/workflows/database-contract.yml` runs the checked-in migration set on PostgreSQL using synthetic fixtures only.

```text
GitHub Ubuntu 24.04 runner
  -> start PostgreSQL
  -> create isolated vault_ci database
  -> bootstrap synthetic auth.users/auth.uid()
  -> apply supabase/migrations/*.sql in lexical order
     with ON_ERROR_STOP
  -> execute document RLS/RPC acceptance SQL
```

The acceptance contract verifies owner/editor/viewer/authenticated-outsider/anon behavior plus create/update replay, semantic conflicts, owner-only membership administration, and same-ID delete read-back.

The bootstrap is deliberately a small compatibility fixture, not an alternate Auth implementation and not a second production runtime.

## Verification

Pure core:

- Vitest unit tests
- no provider/network mocks required for policy
- validation, effect planning and read-back predicates

Adapter:

- RPC name/parameter mapping
- provider response validation
- provider-to-semantic error mapping, including database `permission_denied`

Runtime / HTTP:

- mutation result verification
- same-ID read-back
- loopback-default configuration
- bearer propagation to named Supabase RPC
- body/content-type/auth boundaries
- production TypeScript emit
- built entrypoint health + graceful-shutdown smoke
- mismatch fails closed

Apache reverse proxy:

- checked-in vhost passes `apachectl configtest`
- `ProxyRequests Off`
- loopback-only backend mapping
- caller Authorization survives the reverse-proxy boundary
- anonymous `/v1/*` remains 401
- authenticated unknown `/v1/*` reaches Node and returns 404
- fixed-host HTTPS redirect and request-size/header limits remain in the checked-in contract

Database contract:

- every migration is executable in order
- psql fails immediately on SQL errors
- owner/editor/viewer/non-member/anon authorization boundaries
- write authorization before replay reconciliation
- idempotency/path/version conflict semantics
- delete read-back

Architecture checker:

- TypeScript required paths
- provider/effect fragments forbidden in core
- provider-free public API
- required semantic RPCs across versioned migrations
- caller-generated create identity
- idempotent create/update SQL invariants
- explicit document writer guards
- executable database workflow + acceptance fixture presence/invariants
- Apache loopback/Authorization/body/header/timeout/forward-proxy boundary
- Apache configtest + live proxy smoke presence
- systemd hardening baseline
- production build/start boundary
- exact direct dependencies / lockfile / `npm ci`
- immutable workflow action pins
- exact OSV scanner action pin
- committed npm lockfile scan argument
- npm-audit fallback rejection
- CodeQL / OSV dependency vulnerability scan / CODEOWNERS presence and minimum invariants

CI runs strict TypeScript typecheck, Vitest, production build/start smoke, Apache config/live-proxy validation, architecture checks, executable database acceptance, CodeQL and the OSV dependency vulnerability scan.

## Enterprise deployment boundary

Repository-level engineering controls do not replace organization-level operations, compliance, backup, monitoring, incident response, real-Supabase acceptance, DNS/TLS/firewall administration, or branch administration.

See [`ENTERPRISE_READINESS.md`](ENTERPRISE_READINESS.md), [`APACHE_DEPLOYMENT.md`](APACHE_DEPLOYMENT.md), [`REPOSITORY_GOVERNANCE.md`](REPOSITORY_GOVERNANCE.md), [`SECURITY_AUTOMATION.md`](SECURITY_AUTOMATION.md), and [`../SECURITY.md`](../SECURITY.md).

## Growth stoppers

Do not add without a Capability-specific need:

- generic Work Context
- universal ExecutionRunner
- moving-main reconciliation stack
- privileged VPS gateway
- scheduler runtime
- notification runtime
- recovery broker
- mandatory review-of-review stack
