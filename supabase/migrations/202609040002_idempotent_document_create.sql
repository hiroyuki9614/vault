-- Make create retry-safe without introducing a generic idempotency subsystem.
-- A caller supplies the stable document UUID. Repeating the same create returns
-- the same row only when the requested state is identical.

create or replace function public.put_document(
  p_vault_id uuid,
  p_document_id uuid,
  p_path text,
  p_title text,
  p_content text,
  p_metadata jsonb default '{}'::jsonb,
  p_expected_version bigint default null
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
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.documents%rowtype;
  v_existing public.documents%rowtype;
begin
  if p_document_id is null then
    raise exception 'document_id_required';
  end if;

  if p_path is null or btrim(p_path) = '' then
    raise exception 'invalid_path';
  end if;

  if p_expected_version is null then
    begin
      insert into public.documents (
        id, vault_id, path, title, content, metadata, created_by, updated_by
      ) values (
        p_document_id,
        p_vault_id,
        p_path,
        coalesce(p_title, ''),
        coalesce(p_content, ''),
        coalesce(p_metadata, '{}'::jsonb),
        auth.uid(),
        auth.uid()
      )
      returning * into v_row;
    exception
      when unique_violation then
        select d.*
        into v_existing
        from public.documents d
        where d.vault_id = p_vault_id
          and d.id = p_document_id;

        if found then
          if v_existing.path = p_path
             and v_existing.title = coalesce(p_title, '')
             and v_existing.content = coalesce(p_content, '')
             and v_existing.metadata = coalesce(p_metadata, '{}'::jsonb)
             and v_existing.version = 1 then
            v_row := v_existing;
          else
            raise exception 'idempotency_conflict';
          end if;
        elsif exists (
          select 1
          from public.documents d
          where d.vault_id = p_vault_id
            and d.path = p_path
        ) then
          raise exception 'path_conflict';
        else
          raise exception 'idempotency_conflict';
        end if;
    end;
  else
    update public.documents d
    set path = p_path,
        title = coalesce(p_title, ''),
        content = coalesce(p_content, ''),
        metadata = coalesce(p_metadata, '{}'::jsonb),
        version = d.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
    where d.id = p_document_id
      and d.vault_id = p_vault_id
      and d.version = p_expected_version
    returning d.* into v_row;

    if not found then
      if exists (
        select 1
        from public.documents d
        where d.id = p_document_id
          and d.vault_id = p_vault_id
      ) then
        raise exception 'version_conflict';
      end if;
      raise exception 'document_not_found';
    end if;
  end if;

  return query
  select v_row.id, v_row.vault_id, v_row.path, v_row.title, v_row.content,
         v_row.metadata, v_row.version, v_row.created_at, v_row.updated_at;
end;
$$;

revoke all on function public.put_document(uuid, uuid, text, text, text, jsonb, bigint) from public;
grant execute on function public.put_document(uuid, uuid, text, text, text, jsonb, bigint) to authenticated;
