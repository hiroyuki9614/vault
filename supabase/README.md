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

`public.put_document(vault_id, null, path, title, content, metadata, null)`

A successful create returns version `1`.

### Update

Use the `id` and `version` from the current snapshot:

`public.put_document(vault_id, id, path, title, content, metadata, version)`

A stale version fails with `version_conflict` and does not mutate the document.

### Delete

`public.delete_document(vault_id, id, version)`

Delete also rejects a stale version.

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

Production acceptance should verify these roles with synthetic users in the target environment.
