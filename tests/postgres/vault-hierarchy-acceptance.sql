\set ON_ERROR_STOP on

-- Synthetic identities only.
insert into auth.users (id) values
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666');

set role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', false);

-- Authenticated callers can inspect the configured hierarchy profile but cannot
-- mutate level definitions through normal runtime credentials.
DO $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from public.vault_levels
  where (key = 'personal' and parent_level_key = 'organization')
     or (key = 'organization' and parent_level_key is null);

  if v_count <> 2 then
    raise exception 'acceptance_starter_hierarchy_profile_failed';
  end if;

  begin
    insert into public.vault_levels (key, display_name, sort_order, parent_level_key)
    values ('forbidden-runtime-level', 'Forbidden runtime level', 999, 'organization');
    raise exception 'acceptance_expected_level_definition_write_denial';
  exception
    when insufficient_privilege then
      null;
  end;
end
$$;

-- Create the organization root Vault for this Supabase project.
insert into public.vaults (
  id, slug, name, owner_user_id, level_key, parent_vault_id
) values (
  '77777777-7777-4777-8777-777777777777',
  'synthetic-organization',
  'Synthetic Organization',
  '55555555-5555-4555-8555-555555555555',
  'organization',
  null
);

-- A root-level Vault cannot be attached beneath another Vault.
DO $$
begin
  begin
    insert into public.vaults (
      id, slug, name, owner_user_id, level_key, parent_vault_id
    ) values (
      '77777777-7777-4777-8777-777777777778',
      'invalid-nested-organization',
      'Invalid nested organization',
      '55555555-5555-4555-8555-555555555555',
      'organization',
      '77777777-7777-4777-8777-777777777777'
    );
    raise exception 'acceptance_expected_root_parent_denial';
  exception
    when others then
      if position('root_level_requires_no_parent' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- Membership remains a separate axis from hierarchy. Give the second user
-- editor access to the organization Vault so the parent is visible under RLS.
insert into public.vault_members (vault_id, user_id, role)
values (
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  'editor'
);

select set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', false);

-- The personal Vault is a child of the organization Vault. The user owns the
-- personal Vault while retaining an independent editor role on the parent.
insert into public.vaults (
  id, slug, name, owner_user_id, level_key, parent_vault_id
) values (
  '88888888-8888-4888-8888-888888888888',
  'synthetic-personal',
  'Synthetic Personal',
  '66666666-6666-4666-8666-666666666666',
  'personal',
  '77777777-7777-4777-8777-777777777777'
);

DO $$
declare
  v_level text;
  v_parent uuid;
begin
  select level_key, parent_vault_id
    into v_level, v_parent
  from public.vaults
  where id = '88888888-8888-4888-8888-888888888888';

  if v_level <> 'personal'
     or v_parent <> '77777777-7777-4777-8777-777777777777'::uuid then
    raise exception 'acceptance_personal_to_organization_link_failed';
  end if;

  if public.current_vault_role('88888888-8888-4888-8888-888888888888') <> 'owner' then
    raise exception 'acceptance_personal_owner_role_failed';
  end if;

  if public.current_vault_role('77777777-7777-4777-8777-777777777777') <> 'editor' then
    raise exception 'acceptance_hierarchy_must_not_replace_rbac';
  end if;
end
$$;

-- A personal Vault requires the configured organization parent.
DO $$
begin
  begin
    insert into public.vaults (
      id, slug, name, owner_user_id, level_key, parent_vault_id
    ) values (
      '88888888-8888-4888-8888-888888888889',
      'invalid-parentless-personal',
      'Invalid parentless personal',
      '66666666-6666-4666-8666-666666666666',
      'personal',
      null
    );
    raise exception 'acceptance_expected_personal_parent_required';
  exception
    when others then
      if position('parent_vault_required' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

-- A personal Vault cannot parent another personal Vault under the current
-- profile because its configured parent level is organization.
DO $$
begin
  begin
    insert into public.vaults (
      id, slug, name, owner_user_id, level_key, parent_vault_id
    ) values (
      '88888888-8888-4888-8888-888888888890',
      'invalid-personal-parent',
      'Invalid personal parent',
      '66666666-6666-4666-8666-666666666666',
      'personal',
      '88888888-8888-4888-8888-888888888888'
    );
    raise exception 'acceptance_expected_parent_level_denial';
  exception
    when others then
      if position('invalid_parent_vault_level' in sqlerrm) = 0 then
        raise;
      end if;
  end;
end
$$;

reset role;
