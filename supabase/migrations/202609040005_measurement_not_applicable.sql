-- Preserve Skill `not_applicable` as a first-class terminal measurement status.
-- Applied migrations are immutable, so this extends the existing status contract in a new migration.

alter table public.measurement_runs
  drop constraint if exists measurement_runs_status_check;

alter table public.measurement_runs
  add constraint measurement_runs_status_check
  check (status in ('completed', 'not_applicable', 'failed', 'blocked', 'cancelled'));

create or replace function public.record_measurement_run(
  p_run_id uuid,
  p_vault_id uuid,
  p_parent_run_id uuid,
  p_kind text,
  p_name text,
  p_task_type text,
  p_provider text,
  p_model text,
  p_prompt_ref text,
  p_skill_ids text[],
  p_status text,
  p_started_at timestamptz,
  p_finished_at timestamptz,
  p_duration_ms bigint,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cost_microusd bigint,
  p_correction_count bigint,
  p_human_intervention boolean
)
returns table (
  id uuid,
  vault_id uuid,
  parent_run_id uuid,
  kind text,
  name text,
  task_type text,
  provider text,
  model text,
  prompt_ref text,
  skill_ids text[],
  status text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  input_tokens bigint,
  output_tokens bigint,
  cost_microusd bigint,
  correction_count bigint,
  human_intervention boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.measurement_runs%rowtype;
begin
  if coalesce(public.current_vault_role(p_vault_id), '') not in ('owner', 'editor') then
    raise exception 'permission_denied';
  end if;

  if p_run_id is null
     or p_vault_id is null
     or p_kind not in ('agent', 'skill', 'task')
     or p_status not in ('completed', 'not_applicable', 'failed', 'blocked', 'cancelled')
     or p_name is null
     or btrim(p_name) = ''
     or p_started_at is null
     or p_finished_at is null
     or p_finished_at < p_started_at
     or p_duration_ms is null
     or p_duration_ms < 0
     or p_parent_run_id = p_run_id
     or coalesce(cardinality(p_skill_ids), 0) > 32
     or exists (
       select 1 from unnest(coalesce(p_skill_ids, '{}'::text[])) as skill_id
       where btrim(skill_id) = ''
     )
     or coalesce(p_input_tokens, 0) < 0
     or coalesce(p_output_tokens, 0) < 0
     or coalesce(p_cost_microusd, 0) < 0
     or coalesce(p_correction_count, 0) < 0 then
    raise exception 'invalid_measurement_request';
  end if;

  begin
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
      p_run_id,
      p_vault_id,
      p_parent_run_id,
      p_kind,
      p_name,
      p_task_type,
      p_provider,
      p_model,
      p_prompt_ref,
      coalesce(p_skill_ids, '{}'::text[]),
      p_status,
      p_started_at,
      p_finished_at,
      p_duration_ms,
      p_input_tokens,
      p_output_tokens,
      p_cost_microusd,
      p_correction_count,
      p_human_intervention,
      auth.uid()
    )
    returning * into v_row;
  exception
    when unique_violation then
      select * into v_row
      from public.measurement_runs m
      where m.id = p_run_id
        and m.vault_id = p_vault_id;

      if not found
         or v_row.parent_run_id is distinct from p_parent_run_id
         or v_row.kind is distinct from p_kind
         or v_row.name is distinct from p_name
         or v_row.task_type is distinct from p_task_type
         or v_row.provider is distinct from p_provider
         or v_row.model is distinct from p_model
         or v_row.prompt_ref is distinct from p_prompt_ref
         or v_row.skill_ids is distinct from coalesce(p_skill_ids, '{}'::text[])
         or v_row.status is distinct from p_status
         or v_row.started_at is distinct from p_started_at
         or v_row.finished_at is distinct from p_finished_at
         or v_row.duration_ms is distinct from p_duration_ms
         or v_row.input_tokens is distinct from p_input_tokens
         or v_row.output_tokens is distinct from p_output_tokens
         or v_row.cost_microusd is distinct from p_cost_microusd
         or v_row.correction_count is distinct from p_correction_count
         or v_row.human_intervention is distinct from p_human_intervention then
        raise exception 'measurement_conflict';
      end if;
  end;

  return query
  select
    v_row.id,
    v_row.vault_id,
    v_row.parent_run_id,
    v_row.kind,
    v_row.name,
    v_row.task_type,
    v_row.provider,
    v_row.model,
    v_row.prompt_ref,
    v_row.skill_ids,
    v_row.status,
    v_row.started_at,
    v_row.finished_at,
    v_row.duration_ms,
    v_row.input_tokens,
    v_row.output_tokens,
    v_row.cost_microusd,
    v_row.correction_count,
    v_row.human_intervention;
end;
$$;
