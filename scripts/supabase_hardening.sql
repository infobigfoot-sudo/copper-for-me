begin;

create schema if not exists private;

do $$
declare
  tbl text;
  copper_tables text[] := array[
    'copper_tatene_daily',
    'copper_tatene_monthly',
    'copper_fx_monthly',
    'copper_nakane_daily',
    'copper_lme_daily',
    'copper_wb_pink_sheet_monthly',
    'copper_refining_japan_monthly',
    'copper_trade_world_monthly',
    'copper_trade_japan_monthly',
    'copper_trade_japan_mof_monthly',
    'copper_trade_all'
  ];
begin
  foreach tbl in array copper_tables loop
    execute format('alter table if exists public.%I enable row level security', tbl);
    execute format('revoke all on table public.%I from anon', tbl);
    execute format('revoke all on table public.%I from authenticated', tbl);
  end loop;
end
$$;

do $$
declare
  tbl text;
  django_tables text[] := array[
    'django_migrations',
    'django_content_type',
    'auth_permission',
    'auth_group',
    'auth_group_permissions',
    'auth_user_groups',
    'auth_user_user_permissions',
    'django_admin_log',
    'auth_user',
    'django_session'
  ];
begin
  foreach tbl in array django_tables loop
    execute format('revoke all on table public.%I from anon', tbl);
    execute format('revoke all on table public.%I from authenticated', tbl);
    execute format('alter table if exists public.%I enable row level security', tbl);
    execute format('alter table if exists public.%I set schema private', tbl);
  end loop;
end
$$;

commit;
