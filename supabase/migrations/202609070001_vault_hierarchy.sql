-- Generic Vault hierarchy foundation.
--
-- Hierarchy level names are data, not TypeScript/runtime branches. The starter
-- profile is personal -> organization, while later deployments may add levels
-- through new immutable migrations without changing the Documents Capability.

create table public.vault_levels (
  key text primary key check (key ~ '^[a-z][a-z0-9_-]{0,62}$'),
  display_name text not null check (char_length(display_name) between 1 and 120),
  sort_order integer not null unique check (sort_order >= 0),
  parent_level_key text null references public.vault_levels(key) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  check (parent_level_key is null or parent_level_key <> key)
);

-- Initial operating profile. These are configurable deployment data, not a
-- closed enum in application code.
insert into public.vault_levels (key, display_name, sort_order, parent_level_key) values
  ('organization', 'Organization', 200, null),
  ('personal', 'Personal', 100, 'organization');

revoke all on table public.vault_levels from anon, authenticated;
grant select on table public.vault_levels to authenticated;

alter table public.vault_levels enable row level security;

create policy vault_levels_select_authenticated
on public.vault_levels for select
to authenticated
using (true);

alter table public.vaults
  add column level_key text null references public.vault_levels(key) on update cascade on delete restrict,
  add column parent_vault_id uuid null references public.vaults(id) on update cascade on delete restrict;

-- Existing standalone Vaults predate hierarchy metadata. Preserve them as root
-- Vaults so applying this migration never invents a parent relationship.
update public.vaults
set level_key = 'organization'
where level_key is null;

alter table public.vaults
  alter column level_key set not null;

create index vaults_parent_vault_id_idx on public.vaults(parent_vault_id);
create index vaults_level_key_idx on public.vaults(level_key);

create or replace function public.enforce_vault_hierarchy()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expected_parent_level text;
  v_actual_parent_level text;
begin
  select l.parent_level_key
    into v_expected_parent_level
  from public.vault_levels l
  where l.key = new.level_key;

  if not found then
    raise exception 'invalid_vault_level';
  end if;

  if new.parent_vault_id = new.id then
    raise exception 'vault_cannot_parent_itself';
  end if;

  if v_expected_parent_level is null then
    if new.parent_vault_id is not null then
      raise exception 'root_level_requires_no_parent';
    end if;
    return new;
  end if;

  if new.parent_vault_id is null then
    raise exception 'parent_vault_required';
  end if;

  select v.level_key
    into v_actual_parent_level
  from public.vaults v
  where v.id = new.parent_vault_id;

  if not found then
    raise exception 'parent_vault_not_found';
  end if;

  if v_actual_parent_level <> v_expected_parent_level then
    raise exception 'invalid_parent_vault_level';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_vault_hierarchy() from public;

create trigger vaults_enforce_hierarchy
before insert or update of level_key, parent_vault_id
on public.vaults
for each row
execute function public.enforce_vault_hierarchy();
