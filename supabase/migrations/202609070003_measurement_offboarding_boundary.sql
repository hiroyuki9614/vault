-- Keep the narrow organization_reader role scoped to explicitly classified
-- Documents only. Measurement telemetry remains visible only to the existing
-- full Vault reader roles.

drop policy if exists measurement_runs_select_reader on public.measurement_runs;
create policy measurement_runs_select_reader
on public.measurement_runs for select
to authenticated
using (public.current_vault_role(vault_id) in ('owner', 'editor', 'viewer'));

-- Archived Vaults do not accept new normal-runtime telemetry.
drop policy if exists measurement_runs_insert_writer on public.measurement_runs;
create policy measurement_runs_insert_writer
on public.measurement_runs for insert
to authenticated
with check (
  public.current_vault_role(vault_id) in ('owner', 'editor')
  and exists (
    select 1 from public.vaults v
    where v.id = vault_id and v.lifecycle_status = 'active'
  )
  and recorded_by = auth.uid()
);

-- A deleted employee identity must not delete or block retention of historical
-- privacy-minimized measurement evidence.
alter table public.measurement_runs
  drop constraint if exists measurement_runs_recorded_by_fkey;
alter table public.measurement_runs
  alter column recorded_by drop not null;
alter table public.measurement_runs
  add constraint measurement_runs_recorded_by_fkey
    foreign key (recorded_by) references auth.users(id) on delete set null;
