\set ON_ERROR_STOP on

-- Synthetic identities only. IDs are intentionally disjoint from every other
-- database acceptance fixture in this workflow.
insert into auth.users (id) values
  ('12121212-1212-4121-8121-121212121212'), -- Organization owner
  ('13131313-1313-4131-8131-131313131313'), -- Personal owner / employee
  ('14141414-1414-4141-8141-141414141414'), -- Authorized organization reader
  ('15151515-1515-4151-8151-151515151515'); -- Organization outsider

set role authenticated;
select set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);

insert into public.vaults (id, slug, name, owner_user_id, level_key, parent_vault_id)
values (
  '16161616-1616-4161-8161-161616161616',
  'offboarding-org',
  'Synthetic Offboarding Organization',
  '12121212-1212-4121-8121-121212121212',
  'organization',
  null
);

insert into public.vault_members (vault_id, user_id, role) values
  ('16161616-1616-4161-8161-161616161616', '13131313-1313-4131-8131-131313131313', 'editor'),
  ('16161616-1616-4161-8161-161616161616', '14141414-1414-4141-8141-141414141414', 'viewer');

-- Employee creates their Personal Vault as a child of the Organization.
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', false);

insert into public.vaults (id, slug, name, owner_user_id, level_key, parent_vault_id)
values (
  '17171717-1717-4171-8171-171717171717',
  'employee-personal',
  'Synthetic Personal Vault',
  '13131313-1313-4131-8131-131313131313',
  'personal',
  '16161616-1616-4161-8161-161616161616'
);

-- Missing visibility_scope fails closed to Personal/private.
select * from public.put_document(
  '17171717-1717-4171-8171-171717171717',
  '18181818-1818-4181-8181-181818181818',
  'private/personal-notes.md',
  'Private notes',
  'Synthetic private content',
  '{"source":"synthetic-offboarding-test"}'::jsonb,
  null
);

-- Explicit organization visibility marks a work document as readable through
-- the narrow organization_reader grant.
select * from public.put_document(
  '17171717-1717-4171-8171-171717171717',
  '19191919-1919-4191-8191-191919191919',
  'work/reusable-pattern.md',
  'Reusable work pattern',
  'Synthetic organization-readable content',
  '{"source":"synthetic-offboarding-test","visibility_scope":"organization"}'::jsonb,
  null
);

DO $$
begin
  if not exists (
    select 1 from public.documents
    where id = '18181818-1818-4181-8181-181818181818'
      and organization_readable is false
  ) then
    raise exception 'acceptance_private_default_failed';
  end if;

  if not exists (
    select 1 from public.documents
    where id = '19191919-1919-4191-8191-191919191919'
      and organization_readable is true
  ) then
    raise exception 'acceptance_organization_visibility_failed';
  end if;
end
$$;

-- Personal owner cannot mint the special Organization-controlled role through
-- ordinary membership administration.
DO $$
begin
  begin
    insert into public.vault_members (vault_id, user_id, role)
    values (
      '17171717-1717-4171-8171-171717171717',
      '14141414-1414-4141-8141-141414141414',
      'organization_reader'
    );
    raise exception 'acceptance_expected_direct_organization_reader_grant_denial';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

-- Hierarchy alone never gives the parent Organization owner child access.
select set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '19191919-1919-4191-8191-191919191919'
  );
  if v_count <> 0 then
    raise exception 'acceptance_hierarchy_implied_access_leak';
  end if;
end
$$;

-- Only the parent Organization owner may assign the narrow reader role, and
-- only to a member of that Organization.
select public.grant_personal_vault_organization_reader(
  '17171717-1717-4171-8171-171717171717',
  '14141414-1414-4141-8141-141414141414'
);

DO $$
begin
  begin
    perform public.grant_personal_vault_organization_reader(
      '17171717-1717-4171-8171-171717171717',
      '15151515-1515-4151-8151-151515151515'
    );
    raise exception 'acceptance_expected_nonmember_grant_denial';
  exception
    when others then
      if position('target_not_organization_member' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- The authorized organization reader sees only organization-readable content.
select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);

DO $$
declare
  v_count bigint;
begin
  if public.current_vault_role('17171717-1717-4171-8171-171717171717') <> 'organization_reader' then
    raise exception 'acceptance_organization_reader_role_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '19191919-1919-4191-8191-191919191919'
  );
  if v_count <> 1 then
    raise exception 'acceptance_organization_reader_work_read_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '18181818-1818-4181-8181-181818181818'
  );
  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_private_leak';
  end if;

  -- Reader cannot enumerate Vault owner/member identity rows.
  select count(*) into v_count
  from public.vaults
  where id = '17171717-1717-4171-8171-171717171717';
  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_vault_metadata_leak';
  end if;

  select count(*) into v_count
  from public.vault_members
  where vault_id = '17171717-1717-4171-8171-171717171717';
  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_membership_leak';
  end if;

  begin
    perform * from public.put_document(
      '17171717-1717-4171-8171-171717171717',
      '20202020-2020-4202-8202-202020202020',
      'work/reader-write.md',
      'Must fail',
      'Reader is read only',
      '{"visibility_scope":"organization"}'::jsonb,
      null
    );
    raise exception 'acceptance_expected_organization_reader_write_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Removing the reader from the parent Organization revokes the child grant.
select set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
delete from public.vault_members
where vault_id = '16161616-1616-4161-8161-161616161616'
  and user_id = '14141414-1414-4141-8141-141414141414';

select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);

DO $$
declare
  v_count bigint;
begin
  if public.current_vault_role('17171717-1717-4171-8171-171717171717') is not null then
    raise exception 'acceptance_stale_organization_reader_role_survived_parent_removal';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '19191919-1919-4191-8191-191919191919'
  );
  if v_count <> 0 then
    raise exception 'acceptance_parent_membership_removal_access_leak';
  end if;
end
$$;

-- Rejoining the Organization does not silently restore the old child grant;
-- explicit re-grant is required.
select set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
insert into public.vault_members (vault_id, user_id, role)
values (
  '16161616-1616-4161-8161-161616161616',
  '14141414-1414-4141-8141-141414141414',
  'viewer'
);

select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);
DO $$
begin
  if public.current_vault_role('17171717-1717-4171-8171-171717171717') is not null then
    raise exception 'acceptance_reader_reactivated_without_regrant';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '12121212-1212-4121-8121-121212121212', false);
select public.grant_personal_vault_organization_reader(
  '17171717-1717-4171-8171-171717171717',
  '14141414-1414-4141-8141-141414141414'
);

-- Parent Organization owner archives the employee Personal Vault during
-- offboarding. Archive is durable and normal user mutation stops.
select public.archive_personal_vault('17171717-1717-4171-8171-171717171717');

reset role;
DO $$
begin
  if not exists (
    select 1 from public.vaults
    where id = '17171717-1717-4171-8171-171717171717'
      and lifecycle_status = 'archived'
      and archived_at is not null
  ) then
    raise exception 'acceptance_personal_archive_failed';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '13131313-1313-4131-8131-131313131313', false);

-- Archived owner retains read access while the identity still exists, but
-- cannot mutate archived content.
DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '18181818-1818-4181-8181-181818181818'
  );
  if v_count <> 1 then
    raise exception 'acceptance_archived_owner_read_failed';
  end if;

  begin
    perform * from public.put_document(
      '17171717-1717-4171-8171-171717171717',
      '18181818-1818-4181-8181-181818181818',
      'private/personal-notes.md',
      'Private notes',
      'Attempted archived mutation',
      '{"source":"synthetic-offboarding-test"}'::jsonb,
      1
    );
    raise exception 'acceptance_expected_archived_write_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Simulate administrator deleting the retired employee Auth identity.
-- Vault and documents must survive; identity FKs become null.
reset role;
delete from auth.users
where id = '13131313-1313-4131-8131-131313131313';

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.vaults
  where id = '17171717-1717-4171-8171-171717171717'
    and lifecycle_status = 'archived'
    and owner_user_id is null;
  if v_count <> 1 then
    raise exception 'acceptance_vault_survival_after_auth_delete_failed';
  end if;

  select count(*) into v_count
  from public.documents
  where vault_id = '17171717-1717-4171-8171-171717171717';
  if v_count <> 2 then
    raise exception 'acceptance_document_survival_after_auth_delete_failed';
  end if;

  if exists (
    select 1 from public.documents
    where vault_id = '17171717-1717-4171-8171-171717171717'
      and (created_by is not null or updated_by is not null)
  ) then
    raise exception 'acceptance_deleted_author_fk_not_cleared';
  end if;
end
$$;

-- The explicit organization reader grant survives employee departure and still
-- exposes only the work-classified document.
set role authenticated;
select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '19191919-1919-4191-8191-191919191919'
  );
  if v_count <> 1 then
    raise exception 'acceptance_post_offboarding_work_read_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '17171717-1717-4171-8171-171717171717',
    '18181818-1818-4181-8181-181818181818'
  );
  if v_count <> 0 then
    raise exception 'acceptance_post_offboarding_private_leak';
  end if;
end
$$;

reset role;
