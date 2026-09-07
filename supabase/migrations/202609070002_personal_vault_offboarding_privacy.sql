-- Personal Vault offboarding and organization-readable work information.
--
-- Safety defaults:
-- - deleting an Auth user must not delete their Vault or documents;
-- - existing/unspecified Personal documents are private by default;
-- - organization access is explicit and read-only;
-- - hierarchy does not imply permission inheritance.

alter table public.vaults
  add column lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'archived')),
  add column archived_at timestamptz null;

alter table public.vaults
  add constraint vaults_archive_state_check check (
    (lifecycle_status = 'active' and archived_at is null)
    or (lifecycle_status = 'archived' and archived_at is not null)
  );

-- Preserve Vaults when an Auth identity is physically removed. An archived
-- Personal Vault may therefore become ownerless without losing its content.
alter table public.vaults
  drop constraint if exists vaults_owner_user_id_fkey;
alter table public.vaults
  alter column owner_user_id drop not null;
alter table public.vaults
  add constraint vaults_owner_user_id_fkey
    foreign key (owner_user_id) references auth.users(id) on delete set null;

-- Preserve document content and provenance structure when an author identity is
-- removed. The identity field becomes null instead of cascading through Vaults.
alter table public.documents
  drop constraint if exists documents_created_by_fkey,
  drop constraint if exists documents_updated_by_fkey;
alter table public.documents
  alter column created_by drop not null,
  alter column updated_by drop not null;
alter table public.documents
  add constraint documents_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  add constraint documents_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;

-- `metadata.visibility_scope = "organization"` is an explicit opt-in. Missing,
-- misspelled, or any other value fails closed to Vault-private.
alter table public.documents
  add column organization_readable boolean
  generated always as (
    coalesce((metadata ->> 'visibility_scope') = 'organization', false)
  ) stored;

-- Add a deliberately narrow read-only role. It is not an editor/viewer alias:
-- it can read only documents explicitly classified organization-readable.
alter table public.vault_members
  drop constraint if exists vault_members_role_check;
alter table public.vault_members
  add constraint vault_members_role_check
    check (role in ('viewer', 'editor', 'organization_reader'));

create or replace function public.enforce_vault_member_role_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_level text;
  v_parent_vault_id uuid;
begin
  if new.role <> 'organization_reader' then
    return new;
  end if;

  select v.level_key, v.parent_vault_id
    into v_level, v_parent_vault_id
  from public.vaults v
  where v.id = new.vault_id;

  if not found or v_level <> 'personal' or v_parent_vault_id is null then
    raise exception 'organization_reader_requires_personal_vault';
  end if;

  if not exists (
      select 1
      from public.vaults parent
      where parent.id = v_parent_vault_id
        and parent.owner_user_id = new.user_id
    )
    and not exists (
      select 1
      from public.vault_members parent_member
      where parent_member.vault_id = v_parent_vault_id
        and parent_member.user_id = new.user_id
    ) then
    raise exception 'organization_reader_requires_parent_membership';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_vault_member_role_scope() from public;

create trigger vault_members_enforce_role_scope
before insert or update of vault_id, user_id, role
on public.vault_members
for each row
execute function public.enforce_vault_member_role_scope();

-- organization_reader is intentionally not allowed to enumerate Vault metadata
-- or membership identities. Its only data surface is filtered document reads.
drop policy if exists vaults_select_member on public.vaults;
create policy vaults_select_member
on public.vaults for select
to authenticated
using (public.current_vault_role(id) in ('owner', 'editor', 'viewer'));

drop policy if exists vault_members_select_member on public.vault_members;
create policy vault_members_select_member
on public.vault_members for select
to authenticated
using (public.current_vault_role(vault_id) in ('owner', 'editor', 'viewer'));

drop policy if exists documents_select_reader on public.documents;
create policy documents_select_reader
on public.documents for select
to authenticated
using (
  public.current_vault_role(vault_id) in ('owner', 'editor', 'viewer')
  or (
    public.current_vault_role(vault_id) = 'organization_reader'
    and organization_readable is true
  )
);

-- Archived Vaults are read-only for normal authenticated users. Database
-- administration remains a separate privileged retention boundary.
drop policy if exists vaults_insert_owner on public.vaults;
create policy vaults_insert_owner
on public.vaults for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and lifecycle_status = 'active'
  and archived_at is null
);

drop policy if exists vaults_update_owner on public.vaults;
create policy vaults_update_owner
on public.vaults for update
to authenticated
using (
  public.current_vault_role(id) = 'owner'
  and lifecycle_status = 'active'
)
with check (
  owner_user_id = auth.uid()
  and lifecycle_status = 'active'
  and archived_at is null
);

drop policy if exists vaults_delete_owner on public.vaults;
create policy vaults_delete_owner
on public.vaults for delete
to authenticated
using (
  public.current_vault_role(id) = 'owner'
  and lifecycle_status = 'active'
);

drop policy if exists documents_insert_writer on public.documents;
create policy documents_insert_writer
on public.documents for insert
to authenticated
with check (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
  and created_by = auth.uid()
  and updated_by = auth.uid()
);

drop policy if exists documents_update_writer on public.documents;
create policy documents_update_writer
on public.documents for update
to authenticated
using (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
)
with check (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
  and updated_by = auth.uid()
);

drop policy if exists documents_delete_writer on public.documents;
create policy documents_delete_writer
on public.documents for delete
to authenticated
using (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
);

-- Parent Organization owners can explicitly grant a narrow read role to a
-- member of that same Organization. This does not grant access to private data.
create or replace function public.grant_personal_vault_organization_reader(
  p_personal_vault_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_vault_id uuid;
  v_existing_role text;
begin
  select v.parent_vault_id
    into v_parent_vault_id
  from public.vaults v
  where v.id = p_personal_vault_id
    and v.level_key = 'personal';

  if not found or v_parent_vault_id is null then
    raise exception 'invalid_personal_vault';
  end if;

  if coalesce(public.current_vault_role(v_parent_vault_id), '') <> 'owner' then
    raise exception 'permission_denied';
  end if;

  if not exists (
      select 1
      from public.vaults parent
      where parent.id = v_parent_vault_id
        and parent.owner_user_id = p_user_id
    )
    and not exists (
      select 1
      from public.vault_members parent_member
      where parent_member.vault_id = v_parent_vault_id
        and parent_member.user_id = p_user_id
    ) then
    raise exception 'target_not_organization_member';
  end if;

  select vm.role
    into v_existing_role
  from public.vault_members vm
  where vm.vault_id = p_personal_vault_id
    and vm.user_id = p_user_id;

  if found then
    if v_existing_role = 'organization_reader' then
      return;
    end if;
    raise exception 'existing_personal_membership_conflict';
  end if;

  insert into public.vault_members (vault_id, user_id, role)
  values (p_personal_vault_id, p_user_id, 'organization_reader');
end;
$$;

revoke all on function public.grant_personal_vault_organization_reader(uuid, uuid) from public;
grant execute on function public.grant_personal_vault_organization_reader(uuid, uuid) to authenticated;

create or replace function public.revoke_personal_vault_organization_reader(
  p_personal_vault_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_vault_id uuid;
begin
  select v.parent_vault_id
    into v_parent_vault_id
  from public.vaults v
  where v.id = p_personal_vault_id
    and v.level_key = 'personal';

  if not found or v_parent_vault_id is null then
    raise exception 'invalid_personal_vault';
  end if;

  if coalesce(public.current_vault_role(v_parent_vault_id), '') <> 'owner' then
    raise exception 'permission_denied';
  end if;

  delete from public.vault_members vm
  where vm.vault_id = p_personal_vault_id
    and vm.user_id = p_user_id
    and vm.role = 'organization_reader';
end;
$$;

revoke all on function public.revoke_personal_vault_organization_reader(uuid, uuid) from public;
grant execute on function public.revoke_personal_vault_organization_reader(uuid, uuid) to authenticated;

-- Offboarding archives a Personal Vault instead of deleting it. Either the
-- Personal owner or the parent Organization owner may archive it.
create or replace function public.archive_personal_vault(p_personal_vault_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_vault_id uuid;
begin
  select v.parent_vault_id
    into v_parent_vault_id
  from public.vaults v
  where v.id = p_personal_vault_id
    and v.level_key = 'personal';

  if not found or v_parent_vault_id is null then
    raise exception 'invalid_personal_vault';
  end if;

  if coalesce(public.current_vault_role(p_personal_vault_id), '') <> 'owner'
     and coalesce(public.current_vault_role(v_parent_vault_id), '') <> 'owner' then
    raise exception 'permission_denied';
  end if;

  update public.vaults v
  set lifecycle_status = 'archived',
      archived_at = coalesce(v.archived_at, now()),
      updated_at = now()
  where v.id = p_personal_vault_id;

  return p_personal_vault_id;
end;
$$;

revoke all on function public.archive_personal_vault(uuid) from public;
grant execute on function public.archive_personal_vault(uuid) to authenticated;

-- Preserve the existing idempotent write contract while denying mutations to
-- archived Vaults before mutation or replay reconciliation starts.
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
  if coalesce(public.current_vault_role(p_vault_id), '') not in ('owner', 'editor') then
    raise exception 'permission_denied';
  end if;

  if not exists (
    select 1 from public.vaults v
    where v.id = p_vault_id and v.lifecycle_status = 'active'
  ) then
    raise exception 'permission_denied';
  end if;

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
        select d.* into v_existing
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
          select 1 from public.documents d
          where d.vault_id = p_vault_id and d.path = p_path
        ) then
          raise exception 'path_conflict';
        else
          raise exception 'idempotency_conflict';
        end if;
    end;
  else
    begin
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
    exception
      when unique_violation then
        raise exception 'path_conflict';
    end;

    if not found then
      select d.* into v_existing
      from public.documents d
      where d.id = p_document_id
        and d.vault_id = p_vault_id;

      if found then
        if v_existing.version = p_expected_version + 1
           and v_existing.path = p_path
           and v_existing.title = coalesce(p_title, '')
           and v_existing.content = coalesce(p_content, '')
           and v_existing.metadata = coalesce(p_metadata, '{}'::jsonb) then
          v_row := v_existing;
        else
          raise exception 'version_conflict';
        end if;
      else
        raise exception 'document_not_found';
      end if;
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
  if coalesce(public.current_vault_role(p_vault_id), '') not in ('owner', 'editor') then
    raise exception 'permission_denied';
  end if;

  if not exists (
    select 1 from public.vaults v
    where v.id = p_vault_id and v.lifecycle_status = 'active'
  ) then
    raise exception 'permission_denied';
  end if;

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
