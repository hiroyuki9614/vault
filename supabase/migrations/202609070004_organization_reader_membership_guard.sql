-- Keep organization_reader authority live-bound to current parent Organization
-- membership. A stale child grant must not survive Organization removal and later
-- reactivate silently.

create or replace function public.is_current_organization_reader_authorized(
  p_personal_vault_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vaults personal
    join public.vault_members child_grant
      on child_grant.vault_id = personal.id
     and child_grant.user_id = auth.uid()
     and child_grant.role = 'organization_reader'
    where personal.id = p_personal_vault_id
      and personal.level_key = 'personal'
      and personal.parent_vault_id is not null
      and (
        exists (
          select 1
          from public.vaults parent
          where parent.id = personal.parent_vault_id
            and parent.owner_user_id = auth.uid()
        )
        or exists (
          select 1
          from public.vault_members parent_member
          where parent_member.vault_id = personal.parent_vault_id
            and parent_member.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.is_current_organization_reader_authorized(uuid) from public;
grant execute on function public.is_current_organization_reader_authorized(uuid) to authenticated;

-- Document is the only Capability widened by organization_reader.
drop policy if exists documents_select_reader on public.documents;
create policy documents_select_reader
on public.documents for select
to authenticated
using (
  public.current_vault_role(vault_id) in ('owner', 'editor', 'viewer')
  or (
    public.is_current_organization_reader_authorized(vault_id)
    and organization_readable is true
  )
);

-- Normal Personal Vault membership administration remains owner-only, but the
-- narrow organization_reader role is managed only by its dedicated parent-
-- Organization RPC. Archived Vaults do not accept ordinary membership changes.
drop policy if exists vault_members_insert_owner on public.vault_members;
create policy vault_members_insert_owner
on public.vault_members for insert
to authenticated
with check (
  public.current_vault_role(vault_id) = 'owner'
  and role in ('viewer', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
);

drop policy if exists vault_members_update_owner on public.vault_members;
create policy vault_members_update_owner
on public.vault_members for update
to authenticated
using (
  public.current_vault_role(vault_id) = 'owner'
  and role in ('viewer', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
)
with check (
  public.current_vault_role(vault_id) = 'owner'
  and role in ('viewer', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
);

drop policy if exists vault_members_delete_owner on public.vault_members;
create policy vault_members_delete_owner
on public.vault_members for delete
to authenticated
using (
  public.current_vault_role(vault_id) = 'owner'
  and role in ('viewer', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
);

-- Removing a member from a parent Organization also removes all of that user's
-- narrow reader grants on direct child Personal Vaults. This avoids stale grants
-- becoming active again if the user later rejoins the Organization.
create or replace function public.revoke_child_organization_readers_on_parent_departure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.vault_members child_grant
  using public.vaults child_vault
  where child_vault.parent_vault_id = old.vault_id
    and child_vault.level_key = 'personal'
    and child_grant.vault_id = child_vault.id
    and child_grant.user_id = old.user_id
    and child_grant.role = 'organization_reader';

  return old;
end;
$$;

revoke all on function public.revoke_child_organization_readers_on_parent_departure() from public;

create trigger vault_members_revoke_child_organization_readers
before delete
on public.vault_members
for each row
execute function public.revoke_child_organization_readers_on_parent_departure();
