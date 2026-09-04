# Architecture

## Purpose

この repository は private/personal Vault の実体ではなく、Supabase-first Vault を構築するための公開 Reference Implementation です。

Executable policy は TypeScript で実装し、v3 と同じ responsibility-first / Functional Core + Effectful Adapter 境界を使います。

```text
Caller
  |
  v
provider-free TypeScript contract
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

`repository.json` は repository role / runtime language / database boundary / growth stopper を宣言します。

`responsibilities.json` は各 Capability の owner、public contract、implementation boundary、禁止責務を宣言します。

固定された巨大layer treeやglobal orchestratorを前提にしません。必要な責務だけを追加します。

## Capability layout

代表形:

```text
<capability>/machine/
  contracts/
  core/
  ports/
  adapters/
  runtime/
```

### contracts

Provider-free な public TypeScript contract。

- command
- snapshot/result
- semantic request
- discriminated union

Supabase SDK type、table row type、HTTP response typeを公開contractにしません。

### core

Pure TypeScript policy。

```text
explicit immutable input
  -> validation
  -> decision
  -> normalized result / effect plan
```

原則として直接扱わないもの:

- network
- Supabase / database client
- filesystem
- process execution
- environment lookup
- wall clock
- random source
- deployment state

### ports

Capabilityが必要とする外部effectを意味で表します。

Provider implementation detailではなく、`DocumentStore`のようなsemantic contractにします。

### adapters

Provider固有effectを所有します。

Public Vaultのdocuments CapabilityではSupabase RPC adapterが:

- `get_document`
- `put_document`
- `delete_document`

を呼び、RPC parameter / row shape / provider errorをcoreから隔離します。

### runtime

Core / Port / Adapterをcompositionし、effect executionとread-backを行います。

Business decisionをruntimeへ戻さず、runtimeはeffect orchestrationに留めます。

## Documents capability

現在の最初の executable Capability。

```text
documents/machine/contracts/document.ts
documents/machine/core/document-policy.ts
documents/machine/ports/document-store.ts
documents/machine/adapters/supabase-rpc-document-store.ts
documents/machine/runtime/document-service.ts
```

Coreはcreate/update/deleteをpureなplanへ変換します。

```text
PutDocumentCommand
  -> planPutDocument()
  -> PutDocumentRequest
  -> DocumentStore.put()
  -> getByPath() read-back
  -> verifyPutReadBack()
```

Deleteもmutation後にknown pathを同じsubjectとしてread-backし、absenceを確認します。

## Canonical ownership

```text
Mutable human/user data
  -> Supabase PostgreSQL only

Executable domain policy
  -> TypeScript */machine/core

Public capability contract
  -> TypeScript */machine/contracts

Schema / RLS / RPC definition
  -> Git migration history

Architecture / Agent contract
  -> Git Markdown / JSON

Credentials
  -> deployment secret store only
```

GitHub と Supabase に同じ mutable document を独立更新可能な状態で持たせません。

## Data model

最小 model:

```text
auth.users
    |
    +---- vaults(owner_user_id)
    |         |
    |         +---- vault_members
    |         |
    |         +---- documents
    |
    +---- authenticated identity
```

### `documents`

- `id`: stable UUID identity
- `path`: mutable locator
- `content`: Markdown/text body
- `metadata`: JSONB
- `version`: optimistic concurrency token

`path` を変更しても `id` は変えません。

## Semantic RPC boundary

Supabaseは必須 data platform ですが、domain/public TypeScript contractはSupabaseを知りません。

Adapterだけが次を知ります。

```text
get_document(vault_id, path)
put_document(vault_id, document_id, path, title, content, metadata, expected_version)
delete_document(vault_id, document_id, expected_version)
```

update の stale version は mutation せず `version_conflict` になります。

## Security

Supabase Auth + RLS を必須とします。

- owner: vault / member / document 管理
- editor: document read/write
- viewer: document read only
- unauthenticated: data access不可

service-role key は migration/administration専用で、通常 runtime contractから除外します。

## Failure boundary

Supabase unavailable:

```text
data operation unavailable
  -> fail / surface unavailable
  -> GitHubへfallback writeしない
  -> second canonicalを作らない
```

Provider error objectをcore contractへ返しません。Adapter境界でprovider-specific errorとして隔離し、consumerが必要な意味へmappingします。

## Verification

Pure core:

- Vitest unit test
- network mock不要
- decision / validation / read-back predicateを確認

Adapter:

- RPC name / parameter mapping
- provider row mapping
- provider error boundary

Runtime:

- mutation後read-back
- mismatch時fail closed

Architecture checker:

- TS runtime required paths
- coreへのprovider/effect fragment混入防止
- Supabase-first / RLS / RPC invariants

CIはTypeScript typecheck + Vitest + Python architecture checkを実行します。

## Growth stopper

この repository に次を追加しません。

- generic Work Context
- universal ExecutionRunner
- moving-main reconciliation stack
- privileged VPS gateway
- scheduler runtime
- notification runtime
- recovery broker
- mandatory review-of-review stack

Capability固有の必要性がない抽象化は追加しません。
