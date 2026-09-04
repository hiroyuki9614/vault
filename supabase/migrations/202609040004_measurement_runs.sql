-- Optional execution measurement capability.
-- Stores privacy-minimized terminal telemetry only: no raw prompt/input/output bodies.

create table public.measurement_runs (
  id uuid primary key,
  vault_id uuid not null references public.vaults(id) on delete cascade,
  parent_run_id uuid,
  kind text not null check (kind in ('agent', 'skill', 'task')),
  name text not null check (char_length(name) between 1 and 120),
  task_type text check (task_type is null or char_length(task_type) between 1 and 120),
  provider text check (provider is null or char_length(provider) between 1 and 120),
  model text check (model is null or char_length(model) between 1 and 200),
  prompt_ref text check (prompt_ref is null or char_length(prompt_ref) between 1 and 256),
  skill_ids text[] not null default '{}'::text[] check (cardinality(skill_ids) <= 32),
  status text not null check (status in ('completed', 'failed', 'blocked', 'cancelled')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms bigint not null check (duration_ms >= 0),
  input_tokens bigint check (input_tokens is null or input_tokens >= 0),
  output_tokens bigint check (output_tokens is null or output_tokens >= 0),
  cost_microusd bigint check (cost_microusd is null or cost_microusd >= 0),
  correction_count bigint check (correction_count is null or correction_count >= 0),
  human_intervention boolean,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (finished_at >= started_at),
  check (
    duration_ms = floor(extract(epoch from (finished_at - started_at)) * 1000)::bigint
  ),
  check (parent_run_id is null or parent_run_id <> id)
);

create index measurement_runs_vault_started_idx
  on public.measurement_runs(vault_id, started_at desc);
create index measurement_runs_parent_idx
  on public.measurement_runs(parent_run_id)
  where parent_run_id is not null;

revoke all on table public.measurement_runs from anon;
grant select, insert on table public.measurement_runs to authenticated;

alter table public.measurement_runs enable row level security;

create policy measurement_runs_select_reader
on public.measurement_runs for select
to authenticated
using (public.current_vault_role(vault_id) is not null);

create policy measurement_runs_insert_writer
on public.measurement_runs for insert
to authenticated
with check (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and recorded_by = auth.uid()
);

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
     or p_status not in ('completed', 'failed', 'blocked', 'cancelled')
     or p_name is null
     or btrim(p_name) = ''
     or p_started_at is null
     or p_finished_at is null
     or p_finished_at < p_started_at
     or p_duration_ms is null
     or p_duration_ms < 0
     or p_duration_ms <> floor(extract(epoch from (p_finished_at - p_started_at)) * 1000)::bigint
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

revoke all on function public.record_measurement_run(
  uuid, uuid, uuid, text, text, text, text, text, text, text[], text,
  timestamptz, timestamptz, bigint, bigint, bigint, bigint, bigint, boolean
) from public;
grant execute on function public.record_measurement_run(
  uuid, uuid, uuid, text, text, text, text, text, text, text[], text,
  timestamptz, timestamptz, bigint, bigint, bigint, bigint, bigint, boolean
) to authenticated;
