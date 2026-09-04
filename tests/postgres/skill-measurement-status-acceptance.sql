\set ON_ERROR_STOP on

-- Reuses the synthetic users/vault created by the earlier acceptance scripts.
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

DO $$
declare
  v_row record;
begin
  select * into v_row
  from public.record_measurement_run(
    'aaaaaaaa-0000-4000-8000-000000000006',
    '99999999-9999-4999-8999-999999999999',
    null,
    'skill',
    'requirements-guard@1.0.0',
    'requirements-check',
    null,
    null,
    null,
    array['requirements-guard'],
    'not_applicable',
    '2026-09-04T13:10:00Z',
    '2026-09-04T13:10:00Z',
    0,
    null,
    null,
    null,
    null,
    false
  );

  if v_row.status <> 'not_applicable'
     or v_row.kind <> 'skill'
     or v_row.name <> 'requirements-guard@1.0.0' then
    raise exception 'skill_measurement_not_applicable_failed';
  end if;
end
$$;

reset role;
