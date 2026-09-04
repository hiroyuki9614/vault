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

### Retry semantics

The database RPC is designed for ambiguous transport outcomes without adding a generic idempotency service.

```text
create(id=A, state=X)
  first commit          -> A/version 1
  exact replay          -> same A/version 1
  same A/different state-> idempotency_conflict
  same path/different id-> path_conflict

update(id=A, expected=N, state=Y)
  first commit          -> A/version N+1
  exact replay          -> same A/version N+1
  divergent replay      -> version_conflict
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
- pull-request dependency review
- Dependabot updates
- CODEOWNERS declarations for security-critical boundaries

GitHub-side rulesets remain administrator-managed state; they are not simulated by runtime code.

## Failure boundary

```text
Supabase unavailable
  -> semantic unavailable failure
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
- GitHub Actions referenced by immutable 40-hex commit SHA

Dependabot proposes npm and GitHub Actions updates; updates still pass the same architecture/type/test/security gates.

## Verification

Pure core:

- Vitest unit tests
- no provider/network mocks required for policy
- validation, effect planning and read-back predicates

Adapter:

- RPC name/parameter mapping
- provider response validation
- provider-to-semantic error mapping

Runtime:

- mutation result verification
- same-ID read-back
- mismatch fails closed

Architecture checker:

- TypeScript required paths
- provider/effect fragments forbidden in core
- provider-free public API
- required semantic RPCs across versioned migrations
- caller-generated create identity
- idempotent create/update SQL invariants
- exact direct dependencies / lockfile / `npm ci`
- immutable workflow action pins
- CodeQL / dependency-review / CODEOWNERS presence and minimum invariants

CI runs strict TypeScript typecheck, Vitest and architecture checks. Separate workflows run CodeQL and dependency review.

## Enterprise deployment boundary

Repository-level engineering controls do not replace organization-level operations, compliance, backup, monitoring, incident response or branch administration.

See [`ENTERPRISE_READINESS.md`](ENTERPRISE_READINESS.md), [`REPOSITORY_GOVERNANCE.md`](REPOSITORY_GOVERNANCE.md), and [`../SECURITY.md`](../SECURITY.md).

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
