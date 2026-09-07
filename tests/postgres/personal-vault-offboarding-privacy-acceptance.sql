\set ON_ERROR_STOP on

-- Synthetic identities only.
insert into auth.users (id) values
  ('55555555-5555-4555-8555-555555555555'), -- Organization owner
  ('66666666-6666-4666-8666-666666666666'), -- Personal owner / employee
  ('77777777-7777-4777-8777-777777777777'), -- Authorized organization reader
  ('88888888-8888-4888-8888-888888888888'); -- Organization outsider

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);

insert into public.vaults (id, slug, name, owner_user_id, level_key, parent_vault_id)
values (
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'offboarding-org',
  'Synthetic Offboarding Organization',
  '55555555-5555-4555-8555-555555555555',
  'organization',
  null
);

insert into public.vault_members (vault_id, user_id, role) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '66666666-6666-4666-8666-666666666666', 'editor'),
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777', 'viewer');

-- Employee creates their Personal Vault as a child of the Organization.
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);

insert into public.vaults (id, slug, name, owner_user_id, level_key, parent_vault_id)
values (
  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  'employee-personal',
  'Synthetic Personal Vault',
  '66666666-6666-4666-8666-666666666666',
  'personal',
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
);

-- Missing visibility_scope fails closed to Personal/private.
select * from public.put_document(
  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  'cccccccc-3333-4333-8333-cccccccccccc',
  'private/personal-notes.md',
  'Private notes',
  'Synthetic private content',
  '{"source":"synthetic-offboarding-test"}'::jsonb,
  null
);

-- Explicit organization visibility marks a work document as readable through
-- the narrow organization_reader grant.
select * from public.put_document(
  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  'dddddddd-4444-4444-8444-dddddddddddd',
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
    where id = 'cccccccc-3333-4333-8333-cccccccccccc'
      and organization_readable is false
  ) then
    raise exception 'acceptance_private_default_failed';
  end if;

  if not exists (
    select 1 from public.documents
    where id = 'dddddddd-4444-4444-8444-dddddddddddd'
      and organization_readable is true
  ) then
    raise exception 'acceptance_organization_visibility_failed';
  end if;
end
$$;

-- Hierarchy alone never gives the parent Organization owner child access.
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'dddddddd-4444-4444-8444-dddddddddddd'
  );
  if v_count <> 0 then
    raise exception 'acceptance_hierarchy_implied_access_leak';
  end if;
end
$$;

-- Only the parent Organization owner may assign the narrow reader role, and
-- only to a member of that Organization.
select public.grant_personal_vault_organization_reader(
  'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
  '77777777-7777-4777-8777-777777777777'
);

DO $$
begin
  begin
    perform public.grant_personal_vault_organization_reader(
      'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      '88888888-8888-4888-8888-888888888888'
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
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);

DO $$
declare
  v_count bigint;
begin
  if public.current_vault_role('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb') <> 'organization_reader' then
    raise exception 'acceptance_organization_reader_role_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'dddddddd-4444-4444-8444-dddddddddddd'
  );
  if v_count <> 1 then
    raise exception 'acceptance_organization_reader_work_read_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'cccccccc-3333-4333-8333-cccccccccccc'
  );
  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_private_leak';
  end if;

  -- Reader cannot enumerate Vault owner/member identity rows.
  select count(*) into v_count
  from public.vaults
  where id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_vault_metadata_leak';
  end if;

  select count(*) into v_count
  from public.vault_members
  where vault_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_membership_leak';
  end if;

  begin
    perform * from public.put_document(
      'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      'eeeeeeee-5555-4555-8555-eeeeeeeeeeee',
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

-- Parent Organization owner archives the employee Personal Vault during
-- offboarding. Archive is durable and normal user mutation stops.
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);
select public.archive_personal_vault('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb');

reset role;
DO $$
begin
  if not exists (
    select 1 from public.vaults
    where id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
      and lifecycle_status = 'archived'
      and archived_at is not null
  ) then
    raise exception 'acceptance_personal_archive_failed';
  end if;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);

-- Archived owner retains read access while the identity still exists, but
-- cannot mutate archived content.
DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'cccccccc-3333-4333-8333-cccccccccccc'
  );
  if v_count <> 1 then
    raise exception 'acceptance_archived_owner_read_failed';
  end if;

  begin
    perform * from public.put_document(
      'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
      'cccccccc-3333-4333-8333-cccccccccccc',
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
where id = '66666666-6666-4666-8666-666666666666';

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.vaults
  where id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
    and lifecycle_status = 'archived'
    and owner_user_id is null;
  if v_count <> 1 then
    raise exception 'acceptance_vault_survival_after_auth_delete_failed';
  end if;

  select count(*) into v_count
  from public.documents
  where vault_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
  if v_count <> 2 then
    raise exception 'acceptance_document_survival_after_auth_delete_failed';
  end if;

  if exists (
    select 1 from public.documents
    where vault_id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
      and (created_by is not null or updated_by is not null)
  ) then
    raise exception 'acceptance_deleted_author_fk_not_cleared';
  end if;
end
$$;

-- The explicit organization reader grant survives employee departure and still
-- exposes only the work-classified document.
set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'dddddddd-4444-4444-8444-dddddddddddd'
  );
  if v_count <> 1 then
    raise exception 'acceptance_post_offboarding_work_read_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    'cccccccc-3333-4333-8333-cccccccccccc'
  );
  if v_count <> 0 then
    raise exception 'acceptance_post_offboarding_private_leak';
  end if;
end
$$;

reset role;
