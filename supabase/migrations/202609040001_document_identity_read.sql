-- Identity-based read for same-subject verification.
-- RLS remains authoritative because this function is SECURITY INVOKER.

create or replace function public.get_document_by_id(
  p_vault_id uuid,
  p_document_id uuid
)
returns table (
  id uuid,
  vault_id uuid,
  path text,
  title text,
  content text,
  metadata jsonb,
  version bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select d.id, d.vault_id, d.path, d.title, d.content, d.metadata,
         d.version, d.created_at, d.updated_at
  from public.documents d
  where d.vault_id = p_vault_id
    and d.id = p_document_id;
$$;

revoke all on function public.get_document_by_id(uuid, uuid) from public;
grant execute on function public.get_document_by_id(uuid, uuid) to authenticated;
