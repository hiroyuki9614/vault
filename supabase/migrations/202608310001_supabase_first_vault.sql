-- Supabase-first public Vault foundation.
-- Mutable user data is canonical in PostgreSQL, protected by Auth + RLS.

create table public.vaults (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  name text not null check (char_length(name) between 1 and 120),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vault_members (
  vault_id uuid not null references public.vaults(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'editor')),
  created_at timestamptz not null default now(),
  primary key (vault_id, user_id)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references public.vaults(id) on delete cascade,
  path text not null check (char_length(path) between 1 and 512),
  title text not null default '',
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vault_id, path)
);

create index documents_vault_id_idx on public.documents(vault_id);
create index vault_members_user_id_idx on public.vault_members(user_id);

revoke all on table public.vaults, public.vault_members, public.documents from anon;
grant select, insert, update, delete on table public.vaults, public.vault_members, public.documents to authenticated;

alter table public.vaults enable row level security;
alter table public.vault_members enable row level security;
alter table public.documents enable row level security;

create or replace function public.current_vault_role(p_vault_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
      from public.vaults v
      where v.id = p_vault_id
        and v.owner_user_id = auth.uid()
    ) then 'owner'
    else (
      select vm.role
      from public.vault_members vm
      where vm.vault_id = p_vault_id
        and vm.user_id = auth.uid()
      limit 1
    )
  end;
$$;

revoke all on function public.current_vault_role(uuid) from public;
grant execute on function public.current_vault_role(uuid) to authenticated;

create policy vaults_select_member
on public.vaults for select
to authenticated
using (public.current_vault_role(id) is not null);

create policy vaults_insert_owner
on public.vaults for insert
to authenticated
with check (owner_user_id = auth.uid());

create policy vaults_update_owner
on public.vaults for update
to authenticated
using (public.current_vault_role(id) = 'owner')
with check (owner_user_id = auth.uid());

create policy vaults_delete_owner
on public.vaults for delete
to authenticated
using (public.current_vault_role(id) = 'owner');

create policy vault_members_select_member
on public.vault_members for select
to authenticated
using (public.current_vault_role(vault_id) is not null);

create policy vault_members_insert_owner
on public.vault_members for insert
to authenticated
with check (public.current_vault_role(vault_id) = 'owner');

create policy vault_members_update_owner
on public.vault_members for update
to authenticated
using (public.current_vault_role(vault_id) = 'owner')
with check (public.current_vault_role(vault_id) = 'owner');

create policy vault_members_delete_owner
on public.vault_members for delete
to authenticated
using (public.current_vault_role(vault_id) = 'owner');

create policy documents_select_reader
on public.documents for select
to authenticated
using (public.current_vault_role(vault_id) is not null);

create policy documents_insert_writer
on public.documents for insert
to authenticated
with check (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

create policy documents_update_writer
on public.documents for update
to authenticated
using (public.current_vault_role(vault_id) in ('owner', 'editor'))
with check (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and updated_by = auth.uid()
);

create policy documents_delete_writer
on public.documents for delete
to authenticated
using (public.current_vault_role(vault_id) in ('owner', 'editor'));

create or replace function public.get_document(
  p_vault_id uuid,
  p_path text
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
    and d.path = p_path;
$$;

revoke all on function public.get_document(uuid, text) from public;
grant execute on function public.get_document(uuid, text) to authenticated;

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
begin
  if p_path is null or btrim(p_path) = '' then
    raise exception 'invalid_path';
  end if;

  if p_document_id is null then
    if p_expected_version is not null then
      raise exception 'expected_version_must_be_null_on_create';
    end if;

    insert into public.documents (
      vault_id, path, title, content, metadata, created_by, updated_by
    ) values (
      p_vault_id,
      p_path,
      coalesce(p_title, ''),
      coalesce(p_content, ''),
      coalesce(p_metadata, '{}'::jsonb),
      auth.uid(),
      auth.uid()
    )
    returning * into v_row;
  else
    if p_expected_version is null then
      raise exception 'expected_version_required';
    end if;

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
        select 1 from public.documents d
        where d.id = p_document_id and d.vault_id = p_vault_id
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

create or replace function public.delete_document(
  p_vault_id uuid,
  p_document_id uuid,
  p_expected_version bigint
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_deleted_id uuid;
begin
  if p_expected_version is null then
    raise exception 'expected_version_required';
  end if;

  delete from public.documents d
  where d.id = p_document_id
    and d.vault_id = p_vault_id
    and d.version = p_expected_version
  returning d.id into v_deleted_id;

  if v_deleted_id is null then
    if exists (
      select 1 from public.documents d
      where d.id = p_document_id and d.vault_id = p_vault_id
    ) then
      raise exception 'version_conflict';
    end if;
    raise exception 'document_not_found';
  end if;

  return v_deleted_id;
end;
$$;

revoke all on function public.delete_document(uuid, uuid, bigint) from public;
grant execute on function public.delete_document(uuid, uuid, bigint) to authenticated;
