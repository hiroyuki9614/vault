\set ON_ERROR_STOP on

-- All identities and content below are synthetic CI fixtures.

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333'),
  ('44444444-4444-4444-8444-444444444444');

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

insert into public.vaults (id, slug, name, owner_user_id)
values (
  '99999999-9999-4999-8999-999999999999',
  'enterprise-ci',
  'Synthetic Enterprise CI',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.vault_members (vault_id, user_id, role) values
  ('99999999-9999-4999-8999-999999999999', '22222222-2222-4222-8222-222222222222', 'editor'),
  ('99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', 'viewer');

DO $$
begin
  if public.current_vault_role('99999999-9999-4999-8999-999999999999') <> 'owner' then
    raise exception 'acceptance_owner_role_failed';
  end if;
end
$$;

-- Owner creates a document with caller-generated stable identity.
DO $$
declare
  v_row record;
begin
  select * into v_row
  from public.put_document(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'docs/synthetic.md',
    'Synthetic title',
    'version one',
    '{"source":"synthetic-ci"}'::jsonb,
    null
  );

  if v_row.id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
     or v_row.version <> 1 then
    raise exception 'acceptance_create_identity_or_version_failed';
  end if;
end
$$;

-- Exact create replay must not create or version a second row.
DO $$
declare
  v_row record;
  v_count bigint;
begin
  select * into v_row
  from public.put_document(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'docs/synthetic.md',
    'Synthetic title',
    'version one',
    '{"source":"synthetic-ci"}'::jsonb,
    null
  );

  select count(*) into v_count
  from public.documents
  where vault_id = '99999999-9999-4999-8999-999999999999';

  if v_row.version <> 1 or v_count <> 1 then
    raise exception 'acceptance_create_replay_not_idempotent';
  end if;
end
$$;

-- Same identity with divergent state fails closed.
DO $$
begin
  begin
    perform * from public.put_document(
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'docs/synthetic.md',
      'Synthetic title',
      'divergent create replay',
      '{"source":"synthetic-ci"}'::jsonb,
      null
    );
    raise exception 'acceptance_expected_idempotency_conflict';
  exception
    when others then
      if position('idempotency_conflict' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Same path cannot be claimed by another identity.
DO $$
begin
  begin
    perform * from public.put_document(
      '99999999-9999-4999-8999-999999999999',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'docs/synthetic.md',
      'Another identity',
      'collision',
      '{}'::jsonb,
      null
    );
    raise exception 'acceptance_expected_path_conflict';
  exception
    when others then
      if position('path_conflict' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Editor can read and update.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);

DO $$
declare
  v_count bigint;
  v_row record;
begin
  if public.current_vault_role('99999999-9999-4999-8999-999999999999') <> 'editor' then
    raise exception 'acceptance_editor_role_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_count <> 1 then
    raise exception 'acceptance_editor_read_failed';
  end if;

  select * into v_row
  from public.put_document(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'docs/synthetic.md',
    'Editor title',
    'version two',
    '{"source":"synthetic-ci","writer":"editor"}'::jsonb,
    1
  );
  if v_row.version <> 2 then
    raise exception 'acceptance_editor_update_failed';
  end if;
end
$$;

-- Exact update replay returns the already committed version instead of mutating twice.
DO $$
declare
  v_row record;
begin
  select * into v_row
  from public.put_document(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'docs/synthetic.md',
    'Editor title',
    'version two',
    '{"source":"synthetic-ci","writer":"editor"}'::jsonb,
    1
  );

  if v_row.version <> 2 then
    raise exception 'acceptance_update_replay_not_idempotent';
  end if;
end
$$;

-- Divergent stale update fails with the stable conflict signal.
DO $$
begin
  begin
    perform * from public.put_document(
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'docs/synthetic.md',
      'Divergent title',
      'stale divergent update',
      '{}'::jsonb,
      1
    );
    raise exception 'acceptance_expected_version_conflict';
  exception
    when others then
      if position('version_conflict' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Editor cannot perform owner-only membership administration.
DO $$
begin
  begin
    insert into public.vault_members (vault_id, user_id, role)
    values (
      '99999999-9999-4999-8999-999999999999',
      '44444444-4444-4444-8444-444444444444',
      'viewer'
    );
    raise exception 'acceptance_expected_membership_permission_denied';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

-- Viewer can read but cannot use exact-replay semantics to obtain write success.
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);

DO $$
declare
  v_count bigint;
begin
  if public.current_vault_role('99999999-9999-4999-8999-999999999999') <> 'viewer' then
    raise exception 'acceptance_viewer_role_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_count <> 1 then
    raise exception 'acceptance_viewer_read_failed';
  end if;

  begin
    perform * from public.put_document(
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'docs/synthetic.md',
      'Editor title',
      'version two',
      '{"source":"synthetic-ci","writer":"editor"}'::jsonb,
      1
    );
    raise exception 'acceptance_expected_viewer_write_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;

  begin
    perform public.delete_document(
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      2
    );
    raise exception 'acceptance_expected_viewer_delete_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Authenticated outsider cannot see the tenant and cannot write it.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.get_document_by_id(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_count <> 0 then
    raise exception 'acceptance_cross_tenant_read_leak';
  end if;

  begin
    perform * from public.put_document(
      '99999999-9999-4999-8999-999999999999',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'docs/outsider.md',
      'Outsider',
      'must not write',
      '{}'::jsonb,
      null
    );
    raise exception 'acceptance_expected_outsider_write_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Anonymous role has no semantic RPC execution authority.
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);

DO $$
begin
  begin
    perform * from public.get_document_by_id(
      '99999999-9999-4999-8999-999999999999',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'acceptance_expected_anon_denial';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

-- Owner can delete and same-ID read-back observes absence.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

DO $$
declare
  v_deleted uuid;
  v_count bigint;
begin
  v_deleted := public.delete_document(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    2
  );

  if v_deleted <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid then
    raise exception 'acceptance_delete_identity_failed';
  end if;

  select count(*) into v_count
  from public.get_document_by_id(
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );
  if v_count <> 0 then
    raise exception 'acceptance_delete_readback_failed';
  end if;
end
$$;

reset role;
