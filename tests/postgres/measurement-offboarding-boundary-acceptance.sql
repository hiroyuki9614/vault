\set ON_ERROR_STOP on

-- Reuse the synthetic archived Personal Vault created by the preceding
-- personal-vault offboarding acceptance.
reset role;

insert into public.measurement_runs (
  id,
  vault_id,
  parent_run_id,
  kind,
  name,
  task_type,
  provider,
  model,
  prompt_ref,
  skill_ids,
  status,
  started_at,
  finished_at,
  duration_ms,
  input_tokens,
  output_tokens,
  cost_microusd,
  correction_count,
  human_intervention,
  recorded_by
) values (
  '21212121-2121-4212-8212-212121212121',
  '17171717-1717-4171-8171-171717171717',
  null,
  'task',
  'Synthetic retained measurement',
  'offboarding-test',
  null,
  null,
  null,
  '{}'::text[],
  'completed',
  '2026-09-07T00:00:00Z',
  '2026-09-07T00:00:00Z',
  0,
  null,
  null,
  null,
  0,
  false,
  '12121212-1212-4121-8121-121212121212'
);

-- organization_reader must not gain access to Measurement merely because it is
-- a non-null Vault role.
set role authenticated;
select set_config('request.jwt.claim.sub', '14141414-1414-4141-8141-141414141414', false);

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.measurement_runs
  where vault_id = '17171717-1717-4171-8171-171717171717';

  if v_count <> 0 then
    raise exception 'acceptance_organization_reader_measurement_leak';
  end if;
end
$$;

-- Deleting the recorder identity retains historical Measurement evidence.
reset role;
delete from auth.users
where id = '12121212-1212-4121-8121-121212121212';

DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.measurement_runs
  where id = '21212121-2121-4212-8212-212121212121'
    and recorded_by is null;

  if v_count <> 1 then
    raise exception 'acceptance_measurement_retention_after_auth_delete_failed';
  end if;

  select count(*) into v_count
  from public.vaults
  where id = '16161616-1616-4161-8161-161616161616'
    and owner_user_id is null;

  if v_count <> 1 then
    raise exception 'acceptance_organization_vault_retention_after_owner_delete_failed';
  end if;
end
$$;

reset role;
