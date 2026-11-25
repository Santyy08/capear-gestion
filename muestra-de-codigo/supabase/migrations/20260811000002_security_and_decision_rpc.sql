begin;

create schema if not exists private;
revoke all on schema private from public;

create function private.has_active_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and active
      and role = any(allowed_roles)
  )
$$;

revoke all on function private.has_active_role(public.app_role[]) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_active_role(public.app_role[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.engines enable row level security;
alter table public.catalog_items enable row level security;
alter table public.catalog_price_history enable row level security;
alter table public.app_settings enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_lines enable row level security;
alter table public.client_decisions enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_processes enable row level security;
alter table public.audit_events enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.clients to authenticated;
grant select, insert, update on public.engines to authenticated;
grant select, insert, update on public.catalog_items to authenticated;
grant select, insert on public.catalog_price_history to authenticated;
grant select, insert, update on public.app_settings to authenticated;
grant select on public.budgets to authenticated;
grant select on public.budget_lines to authenticated;
grant select on public.client_decisions to authenticated;
grant select on public.work_orders to authenticated;
grant select, insert on public.work_processes to authenticated;
grant select on public.audit_events to authenticated;

create policy profiles_select_allowed
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.has_active_role(array['admin'::public.app_role, 'manager'::public.app_role]))
);

create policy profiles_update_admin
on public.profiles
for update
to authenticated
using ((select private.has_active_role(array['admin'::public.app_role])))
with check ((select private.has_active_role(array['admin'::public.app_role])));

create policy clients_select_operational
on public.clients
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role,
  'plant'::public.app_role
])));

create policy clients_insert_commercial
on public.clients
for insert
to authenticated
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy clients_update_commercial
on public.clients
for update
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])))
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy engines_select_operational
on public.engines
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role,
  'plant'::public.app_role
])));

create policy engines_insert_commercial
on public.engines
for insert
to authenticated
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy engines_update_commercial
on public.engines
for update
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])))
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy catalog_items_select_commercial
on public.catalog_items
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy catalog_items_insert_commercial
on public.catalog_items
for insert
to authenticated
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy catalog_items_update_commercial
on public.catalog_items
for update
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])))
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy catalog_price_history_select_commercial
on public.catalog_price_history
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy catalog_price_history_insert_commercial
on public.catalog_price_history
for insert
to authenticated
with check ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy app_settings_select_commercial
on public.app_settings
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy app_settings_write_admin
on public.app_settings
for all
to authenticated
using ((select private.has_active_role(array['admin'::public.app_role])))
with check ((select private.has_active_role(array['admin'::public.app_role])));

create policy budgets_select_commercial
on public.budgets
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy budget_lines_select_commercial
on public.budget_lines
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy client_decisions_select_commercial
on public.client_decisions
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create policy work_orders_select_operational
on public.work_orders
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role,
  'plant'::public.app_role
])));

create policy work_processes_select_operational
on public.work_processes
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role,
  'plant'::public.app_role
])));

create policy work_processes_insert_operational
on public.work_processes
for insert
to authenticated
with check (
  (select private.has_active_role(array[
    'admin'::public.app_role,
    'manager'::public.app_role,
    'plant'::public.app_role
  ]))
  and (
    responsible_user_id = (select auth.uid())
    or (select private.has_active_role(array[
      'admin'::public.app_role,
      'manager'::public.app_role
    ]))
  )
);

create policy audit_events_select_commercial
on public.audit_events
for select
to authenticated
using ((select private.has_active_role(array[
  'admin'::public.app_role,
  'manager'::public.app_role
])));

create function public.record_initial_budget_decision(
  p_budget_id uuid,
  p_result public.decision_result,
  p_decided_at timestamptz,
  p_channel public.decision_channel,
  p_confirmed_by_person text,
  p_notes text default null
)
returns table (
  decision_id uuid,
  work_order_id uuid,
  work_order_number text,
  budget_status public.budget_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_budget public.budgets%rowtype;
  v_decision public.client_decisions%rowtype;
  v_work_order_id uuid;
  v_work_order_number text;
  v_final_budget_status public.budget_status;
begin
  if v_actor_id is null
    or not private.has_active_role(array[
      'admin'::public.app_role,
      'manager'::public.app_role
    ]) then
    raise exception using errcode = '42501', message = 'CAPEAR_FORBIDDEN';
  end if;

  if nullif(btrim(p_confirmed_by_person), '') is null then
    raise exception using errcode = '22023', message = 'CAPEAR_DECISION_PERSON_REQUIRED';
  end if;

  select b.*
  into v_budget
  from public.budgets b
  where b.id = p_budget_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CAPEAR_BUDGET_NOT_FOUND';
  end if;

  if v_budget.kind <> 'initial' then
    raise exception using errcode = '22023', message = 'CAPEAR_INITIAL_BUDGET_REQUIRED';
  end if;

  select d.*
  into v_decision
  from public.client_decisions d
  where d.budget_id = p_budget_id;

  if found then
    if v_decision.result is distinct from p_result
      or v_decision.decided_at is distinct from p_decided_at
      or v_decision.channel is distinct from p_channel
      or v_decision.confirmed_by_person is distinct from btrim(p_confirmed_by_person)
      or v_decision.notes is distinct from p_notes then
      raise exception using errcode = 'P0001', message = 'CAPEAR_DECISION_CONFLICT';
    end if;

    if v_decision.result = 'accepted' then
      select wo.id, wo.number
      into v_work_order_id, v_work_order_number
      from public.work_orders wo
      where wo.initial_budget_id = p_budget_id;

      if v_work_order_id is null then
        raise exception using errcode = 'P0001', message = 'CAPEAR_DECISION_INCOMPLETE';
      end if;
    end if;

    return query
    select v_decision.id, v_work_order_id, v_work_order_number, v_budget.status;
    return;
  end if;

  if v_budget.status not in ('issued', 'pending_response') then
    raise exception using errcode = 'P0001', message = 'CAPEAR_BUDGET_NOT_DECIDABLE';
  end if;

  insert into public.client_decisions (
    budget_id,
    result,
    decided_at,
    channel,
    confirmed_by_person,
    notes,
    recorded_by_user_id
  ) values (
    p_budget_id,
    p_result,
    p_decided_at,
    p_channel,
    btrim(p_confirmed_by_person),
    p_notes,
    v_actor_id
  )
  returning * into v_decision;

  if p_result = 'accepted' then
    insert into public.work_orders (
      number,
      client_id,
      engine_id,
      initial_budget_id,
      status,
      next_action
    ) values (
      public.next_work_order_number(),
      v_budget.client_id,
      v_budget.engine_id,
      v_budget.id,
      'created',
      'Registrar ingreso'
    )
    on conflict (initial_budget_id) do nothing
    returning id, number into v_work_order_id, v_work_order_number;

    if v_work_order_id is null then
      select wo.id, wo.number
      into v_work_order_id, v_work_order_number
      from public.work_orders wo
      where wo.initial_budget_id = p_budget_id;
    end if;

    update public.budgets
    set status = 'accepted',
        work_order_id = v_work_order_id,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_budget_id;

    v_final_budget_status := 'accepted';
  else
    update public.budgets
    set status = 'rejected',
        work_order_id = null,
        updated_by = v_actor_id,
        updated_at = now()
    where id = p_budget_id;

    v_final_budget_status := 'rejected';
  end if;

  insert into public.audit_events (
    entity_type,
    entity_id,
    action,
    actor_user_id,
    metadata
  ) values (
    'budget',
    p_budget_id,
    case
      when p_result = 'accepted' then 'budget.initial.accepted'
      else 'budget.initial.rejected'
    end,
    v_actor_id,
    jsonb_build_object(
      'decision_id', v_decision.id,
      'channel', p_channel,
      'work_order_id', v_work_order_id
    )
  );

  return query
  select v_decision.id, v_work_order_id, v_work_order_number, v_final_budget_status;
end;
$$;

revoke all on function public.record_initial_budget_decision(
  uuid,
  public.decision_result,
  timestamptz,
  public.decision_channel,
  text,
  text
) from public;

grant execute on function public.record_initial_budget_decision(
  uuid,
  public.decision_result,
  timestamptz,
  public.decision_channel,
  text,
  text
) to authenticated;

commit;
