\set ON_ERROR_STOP on

-- Reuses synthetic users/vault created by document-rls-acceptance.sql.

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

-- Owner records terminal telemetry. Raw prompt/input/output bodies are not part of the schema.
DO $$
declare
  v_row record;
  v_count bigint;
begin
  select * into v_row
  from public.record_measurement_run(
    'aaaaaaaa-0000-4000-8000-000000000001',
    '99999999-9999-4999-8999-999999999999',
    null,
    'agent',
    'synthetic-agent',
    'synthetic-task',
    'synthetic-provider',
    'synthetic/model',
    'prompts/synthetic-v1',
    array['test-driven-development'],
    'completed',
    '2026-09-04T12:00:00Z',
    '2026-09-04T12:00:01Z',
    1000,
    10,
    5,
    42,
    0,
    false
  );

  if v_row.id <> 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
     or v_row.duration_ms <> 1000 then
    raise exception 'measurement_owner_record_failed';
  end if;

  -- Exact replay is idempotent.
  perform * from public.record_measurement_run(
    'aaaaaaaa-0000-4000-8000-000000000001',
    '99999999-9999-4999-8999-999999999999',
    null,
    'agent',
    'synthetic-agent',
    'synthetic-task',
    'synthetic-provider',
    'synthetic/model',
    'prompts/synthetic-v1',
    array['test-driven-development'],
    'completed',
    '2026-09-04T12:00:00Z',
    '2026-09-04T12:00:01Z',
    1000,
    10,
    5,
    42,
    0,
    false
  );

  select count(*) into v_count
  from public.measurement_runs
  where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_count <> 1 then
    raise exception 'measurement_exact_replay_duplicated';
  end if;
end
$$;

-- Divergent replay fails closed.
DO $$
begin
  begin
    perform * from public.record_measurement_run(
      'aaaaaaaa-0000-4000-8000-000000000001',
      '99999999-9999-4999-8999-999999999999',
      null,
      'agent',
      'synthetic-agent',
      'synthetic-task',
      'synthetic-provider',
      'synthetic/model',
      'prompts/synthetic-v1',
      array['test-driven-development'],
      'failed',
      '2026-09-04T12:00:00Z',
      '2026-09-04T12:00:01Z',
      1000,
      10,
      5,
      42,
      0,
      false
    );
    raise exception 'measurement_expected_conflict';
  exception
    when others then
      if position('measurement_conflict' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Editor can record a child run, preserving future subagent lineage without orchestrating it.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
select * from public.record_measurement_run(
  'aaaaaaaa-0000-4000-8000-000000000002',
  '99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'skill',
  'requirements-guard',
  null,
  null,
  null,
  null,
  array['requirements-guard'],
  'blocked',
  '2026-09-04T12:01:00Z',
  '2026-09-04T12:01:00Z',
  0,
  null,
  null,
  null,
  null,
  null
);

-- Viewer can inspect telemetry through RLS but cannot write/reconcile it.
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.measurement_runs
  where vault_id = '99999999-9999-4999-8999-999999999999';
  if v_count <> 2 then
    raise exception 'measurement_viewer_read_failed';
  end if;

  begin
    perform * from public.record_measurement_run(
      'aaaaaaaa-0000-4000-8000-000000000003',
      '99999999-9999-4999-8999-999999999999',
      null,
      'task',
      'viewer-write',
      null,
      null,
      null,
      null,
      '{}'::text[],
      'completed',
      '2026-09-04T12:02:00Z',
      '2026-09-04T12:02:00Z',
      0,
      null,
      null,
      null,
      null,
      null
    );
    raise exception 'measurement_expected_viewer_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Authenticated outsider cannot read or write another vault's telemetry.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', false);
DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.measurement_runs
  where vault_id = '99999999-9999-4999-8999-999999999999';
  if v_count <> 0 then
    raise exception 'measurement_cross_tenant_read_leak';
  end if;

  begin
    perform * from public.record_measurement_run(
      'aaaaaaaa-0000-4000-8000-000000000004',
      '99999999-9999-4999-8999-999999999999',
      null,
      'task',
      'outsider-write',
      null,
      null,
      null,
      null,
      '{}'::text[],
      'completed',
      '2026-09-04T12:03:00Z',
      '2026-09-04T12:03:00Z',
      0,
      null,
      null,
      null,
      null,
      null
    );
    raise exception 'measurement_expected_outsider_denial';
  exception
    when others then
      if position('permission_denied' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
DO $$
begin
  begin
    perform * from public.record_measurement_run(
      'aaaaaaaa-0000-4000-8000-000000000005',
      '99999999-9999-4999-8999-999999999999',
      null,
      'task',
      'anon-write',
      null,
      null,
      null,
      null,
      '{}'::text[],
      'completed',
      '2026-09-04T12:04:00Z',
      '2026-09-04T12:04:00Z',
      0,
      null,
      null,
      null,
      null,
      null
    );
    raise exception 'measurement_expected_anon_denial';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

reset role;
