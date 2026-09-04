# Supabase

Supabase is the required data platform for this Vault reference runtime.

## Required services

- Supabase Auth
- PostgreSQL
- Row Level Security
- SQL RPC

Storage / Realtime / Edge Functions are not required by the current baseline.

## Apply migrations

Apply all versioned migrations in order. With Supabase CLI:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Do not store the project ref access token or service-role key in this repository.

Application runtime receives deployment configuration such as:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
```

The service-role key is not part of the normal client / Agent contract.

## First vault

An authenticated user creates a `vaults` row as owner. The owner may then add editor/viewer members through the authorized data boundary.

## Document RPC API

Normal document operations use semantic RPCs.

### Read by path

`public.get_document(vault_id, path)`

Path is a mutable locator.

### Read by identity

`public.get_document_by_id(vault_id, document_id)`

Identity reads are used for mutation completion/read-back because document `id` is stable even if path changes.

### Create

The caller generates a stable document UUID before the first write:

`public.put_document(vault_id, document_id, path, title, content, metadata, null)`

A successful create returns version `1`.

Retrying the exact same create with the same `document_id` returns the already committed version-1 row. Conflicting re-use of the same ID fails with `idempotency_conflict`. Attempting the same path with a different identity fails with `path_conflict`.

### Update

Use the `id` and `version` from the current snapshot:

`public.put_document(vault_id, id, path, title, content, metadata, version)`

A stale version fails with `version_conflict` and does not mutate the document. If the first update committed but its response was lost, replaying the exact same requested state with the same `expectedVersion` returns the already committed `expectedVersion + 1` row. A different state remains a conflict.

### Delete

`public.delete_document(vault_id, id, version)`

Delete rejects a stale version. After an ambiguous transport failure, callers should reconcile with `get_document_by_id` before deciding whether another delete attempt is needed.

## Same-identity read-back

Transport success is not the completion contract.

Create/update:

```text
put_document
  -> validate returned document snapshot
  -> get_document_by_id(vault_id, returned_id)
  -> same id / expected state / expected version
```

Delete:

```text
delete_document
  -> returned id must equal requested id
  -> get_document_by_id(vault_id, requested_id)
  -> no row
```

This avoids treating a mutable path as identity evidence.

## Authorization boundary

All document RPCs use `SECURITY INVOKER`; RLS remains authoritative.

- owner/editor: document write
- owner/editor/viewer: document read
- unauthenticated: no data access

`put_document` and `delete_document` also check the semantic vault role before mutation/replay reconciliation. A non-writer receives `permission_denied` before exact-replay logic is evaluated. This prevents a viewer who can read the current row from receiving a write-shaped success result merely because an already-committed state happens to match a replay request.

The authorization guard complements RLS; it does not replace it.

## Executable database contract

The repository CI runs `.github/workflows/database-contract.yml` on PostgreSQL with synthetic identities only. The workflow:

1. bootstraps the minimal `auth.users` / `auth.uid()` compatibility surface needed by the migrations;
2. applies every file in `supabase/migrations/*.sql` in order with `ON_ERROR_STOP`;
3. executes `tests/postgres/document-rls-acceptance.sql`.

The acceptance suite covers owner/editor/viewer/authenticated-outsider/anon access, create/update replay behavior, version/path/idempotency conflicts, owner-only membership administration, and delete read-back.

Production acceptance must still verify the same contract against the target organization's real Supabase Auth/project configuration.
