-- 晧香營運系統 v2 — 初始 schema
-- 執行前請確認目標 Supabase 專案為全新或可覆寫狀態。
-- 依序建立：enum/type → table → index → function → policy

-----------------------------------------------------------------------------
-- 1. 擴充套件
-----------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid

-----------------------------------------------------------------------------
-- 2. Enum
-----------------------------------------------------------------------------
create type employee_role  as enum ('owner', 'manager', 'staff');
create type shift_status   as enum ('open', 'closed');
create type clock_type     as enum ('in', 'out');

-----------------------------------------------------------------------------
-- 3. Tables
-----------------------------------------------------------------------------

-- 3.1 employees
create table public.employees (
  id             uuid primary key default gen_random_uuid(),
  line_user_id   text unique not null,
  display_name   text not null,
  role           employee_role not null default 'staff',
  phone          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 3.2 stores
create table public.stores (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  address            text,
  lat                double precision,
  lng                double precision,
  geofence_radius_m  int  not null default 200,
  timezone           text not null default 'Asia/Taipei',
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 3.3 employee_stores (多對多 + 預設排班店)
create table public.employee_stores (
  employee_id  uuid not null references public.employees(id) on delete cascade,
  store_id     uuid not null references public.stores(id)    on delete cascade,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (employee_id, store_id)
);

-- 3.4 shifts (先建、稍後再加 clock_events 的 FK)
create table public.shifts (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees(id) on delete restrict,
  store_id             uuid not null references public.stores(id)    on delete restrict,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  clock_in_event_id    uuid,
  clock_out_event_id   uuid,
  status               shift_status not null default 'open',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 每位員工同時最多一筆 open shift
create unique index shifts_one_open_per_employee
  on public.shifts (employee_id)
  where status = 'open';

-- 3.5 clock_events
create table public.clock_events (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references public.employees(id) on delete restrict,
  store_id          uuid not null references public.stores(id)    on delete restrict,
  shift_id          uuid references public.shifts(id) on delete set null,
  type              clock_type not null,
  event_at          timestamptz not null default now(),
  lat               double precision,
  lng               double precision,
  distance_m        double precision,
  within_geofence   boolean,
  photo_path        text,
  notes             text,
  created_at        timestamptz not null default now()
);

-- 補 FK：shifts → clock_events
alter table public.shifts
  add constraint shifts_clock_in_event_fk
    foreign key (clock_in_event_id)  references public.clock_events(id) on delete set null,
  add constraint shifts_clock_out_event_fk
    foreign key (clock_out_event_id) references public.clock_events(id) on delete set null;

create index clock_events_employee_event_at on public.clock_events (employee_id, event_at desc);
create index clock_events_store_event_at    on public.clock_events (store_id, event_at desc);

-- 3.6 sales_reports
create table public.sales_reports (
  id               uuid primary key default gen_random_uuid(),
  store_id         uuid not null references public.stores(id) on delete restrict,
  shift_id         uuid references public.shifts(id) on delete set null,
  clock_event_id   uuid references public.clock_events(id) on delete set null,
  reported_by      uuid not null references public.employees(id) on delete restrict,
  reported_at      timestamptz not null default now(),
  amount           numeric(12,2) not null check (amount >= 0),
  notes            text,
  created_at       timestamptz not null default now()
);

create index sales_reports_store_reported_at on public.sales_reports (store_id, reported_at desc);

-----------------------------------------------------------------------------
-- 4. Helper: 以 LINE userId 取當前員工 id
-----------------------------------------------------------------------------
-- Supabase Auth 登入後 JWT 的 sub = line_user_id（走 LINE OIDC 或自訂 claim）
create or replace function public.current_employee_id()
returns uuid
language sql stable
as $$
  select e.id
    from public.employees e
   where e.line_user_id = (auth.jwt() ->> 'sub')
     and e.active
   limit 1;
$$;

-----------------------------------------------------------------------------
-- 5. Business logic: 店家當前開攤週期 + 是否需回報業績
-----------------------------------------------------------------------------

-- 5.1 view: 店家當前 open session 起始時間
-- 定義：該店「最早一個今天還沒對應下班／沒對應 out event」的 in event 時間。
--       若今天沒有任何 open shift/未關 in，則回傳 NULL（視為已關攤 or 尚未開攤）。
create or replace view public.v_store_current_session as
select
  s.id as store_id,
  min(ci.event_at) as opened_at
from public.stores s
left join public.clock_events ci
       on ci.store_id = s.id
      and ci.type = 'in'
      and ci.event_at::date = (now() at time zone s.timezone)::date
      and exists (
        select 1
          from public.shifts sh
         where sh.clock_in_event_id = ci.id
           and sh.status = 'open'
      )
group by s.id;

-- 5.2 fn: 某時間點打卡是否需要回報業績
create or replace function public.store_needs_sales_report(
  p_store_id uuid,
  p_at       timestamptz default now()
) returns boolean
language plpgsql stable
as $$
declare
  v_opened_at timestamptz;
begin
  select opened_at into v_opened_at
    from public.v_store_current_session
   where store_id = p_store_id;

  -- 尚未開攤 → 這次打卡就是開攤，不用回報
  if v_opened_at is null then
    return false;
  end if;

  -- 開攤後 1 小時內免報
  if p_at - v_opened_at < interval '1 hour' then
    return false;
  end if;

  return true;
end;
$$;

-----------------------------------------------------------------------------
-- 6. RPC: clock_in / clock_out (原子化打卡)
-----------------------------------------------------------------------------

-- 6.1 clock_in
create or replace function public.clock_in(
  p_store_id       uuid,
  p_lat            double precision,
  p_lng            double precision,
  p_distance_m     double precision,
  p_within_fence   boolean,
  p_photo_path     text,
  p_sales_amount   numeric default null,
  p_notes          text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp        uuid := public.current_employee_id();
  v_event_id   uuid;
  v_shift_id   uuid;
  v_sales_id   uuid;
begin
  if v_emp is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  if exists (
    select 1 from public.shifts
     where employee_id = v_emp and status = 'open'
  ) then
    raise exception 'already_on_shift' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.employee_stores
     where employee_id = v_emp and store_id = p_store_id
  ) then
    raise exception 'store_not_allowed' using errcode = '42501';
  end if;

  insert into public.clock_events (
    employee_id, store_id, type,
    lat, lng, distance_m, within_geofence, photo_path, notes
  ) values (
    v_emp, p_store_id, 'in',
    p_lat, p_lng, p_distance_m, p_within_fence, p_photo_path, p_notes
  ) returning id into v_event_id;

  insert into public.shifts (
    employee_id, store_id, clock_in_event_id, status
  ) values (v_emp, p_store_id, v_event_id, 'open')
  returning id into v_shift_id;

  update public.clock_events set shift_id = v_shift_id where id = v_event_id;

  if p_sales_amount is not null then
    insert into public.sales_reports (
      store_id, shift_id, clock_event_id, reported_by, amount
    ) values (p_store_id, v_shift_id, v_event_id, v_emp, p_sales_amount)
    returning id into v_sales_id;
  end if;

  return jsonb_build_object(
    'shift_id',       v_shift_id,
    'clock_event_id', v_event_id,
    'sales_report_id', v_sales_id
  );
end;
$$;

-- 6.2 clock_out
create or replace function public.clock_out(
  p_lat            double precision,
  p_lng            double precision,
  p_distance_m     double precision,
  p_within_fence   boolean,
  p_photo_path     text,
  p_sales_amount   numeric default null,
  p_notes          text default null
) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_emp        uuid := public.current_employee_id();
  v_shift_id   uuid;
  v_store_id   uuid;
  v_event_id   uuid;
  v_sales_id   uuid;
begin
  if v_emp is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  select id, store_id into v_shift_id, v_store_id
    from public.shifts
   where employee_id = v_emp and status = 'open'
   limit 1;

  if v_shift_id is null then
    raise exception 'not_on_shift' using errcode = 'P0001';
  end if;

  insert into public.clock_events (
    employee_id, store_id, shift_id, type,
    lat, lng, distance_m, within_geofence, photo_path, notes
  ) values (
    v_emp, v_store_id, v_shift_id, 'out',
    p_lat, p_lng, p_distance_m, p_within_fence, p_photo_path, p_notes
  ) returning id into v_event_id;

  update public.shifts
     set status = 'closed',
         ended_at = now(),
         clock_out_event_id = v_event_id,
         updated_at = now()
   where id = v_shift_id;

  if p_sales_amount is not null then
    insert into public.sales_reports (
      store_id, shift_id, clock_event_id, reported_by, amount
    ) values (v_store_id, v_shift_id, v_event_id, v_emp, p_sales_amount)
    returning id into v_sales_id;
  end if;

  return jsonb_build_object(
    'shift_id',       v_shift_id,
    'clock_event_id', v_event_id,
    'sales_report_id', v_sales_id
  );
end;
$$;

grant execute on function public.clock_in  to authenticated;
grant execute on function public.clock_out to authenticated;
grant execute on function public.store_needs_sales_report(uuid, timestamptz) to authenticated;
grant execute on function public.current_employee_id() to authenticated;

-----------------------------------------------------------------------------
-- 7. RLS
-----------------------------------------------------------------------------
alter table public.employees       enable row level security;
alter table public.stores          enable row level security;
alter table public.employee_stores enable row level security;
alter table public.shifts          enable row level security;
alter table public.clock_events    enable row level security;
alter table public.sales_reports   enable row level security;

-- 讀：本人可讀自己；manager/owner 可讀全部
create policy employees_self_or_manager on public.employees
  for select using (
       id = public.current_employee_id()
    or exists (
         select 1 from public.employees me
          where me.id = public.current_employee_id()
            and me.role in ('owner','manager')
       )
  );

-- 寫：只有 owner
create policy employees_write_owner on public.employees
  for all using (
    exists (select 1 from public.employees me
             where me.id = public.current_employee_id() and me.role = 'owner')
  ) with check (true);

-- stores：登入員工可讀；只有 owner 可寫
create policy stores_read_all on public.stores
  for select using (public.current_employee_id() is not null);

create policy stores_write_owner on public.stores
  for all using (
    exists (select 1 from public.employees me
             where me.id = public.current_employee_id() and me.role = 'owner')
  ) with check (true);

-- employee_stores
create policy employee_stores_self_or_manager on public.employee_stores
  for select using (
       employee_id = public.current_employee_id()
    or exists (select 1 from public.employees me
                where me.id = public.current_employee_id()
                  and me.role in ('owner','manager'))
  );

create policy employee_stores_write_owner on public.employee_stores
  for all using (
    exists (select 1 from public.employees me
             where me.id = public.current_employee_id() and me.role = 'owner')
  ) with check (true);

-- shifts：本人可讀；manager/owner 全可讀；只能透過 RPC 寫入（RPC 走 security definer）
create policy shifts_self_or_manager on public.shifts
  for select using (
       employee_id = public.current_employee_id()
    or exists (select 1 from public.employees me
                where me.id = public.current_employee_id()
                  and me.role in ('owner','manager'))
  );

-- clock_events：同 shifts
create policy clock_events_self_or_manager on public.clock_events
  for select using (
       employee_id = public.current_employee_id()
    or exists (select 1 from public.employees me
                where me.id = public.current_employee_id()
                  and me.role in ('owner','manager'))
  );

-- sales_reports：同上
create policy sales_reports_self_or_manager on public.sales_reports
  for select using (
       reported_by = public.current_employee_id()
    or exists (select 1 from public.employees me
                where me.id = public.current_employee_id()
                  and me.role in ('owner','manager'))
  );

-----------------------------------------------------------------------------
-- 8. Storage bucket (需在 Supabase Dashboard 或下面的 SQL 執行)
-----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('clock-photos', 'clock-photos', false)
on conflict (id) do nothing;

-- storage RLS：只有自己的資料夾能寫；manager/owner 可讀全部
create policy "clock-photos-upload-own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'clock-photos'
    and (storage.foldername(name))[1] = public.current_employee_id()::text
  );

create policy "clock-photos-read-self-or-manager"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'clock-photos'
    and (
         (storage.foldername(name))[1] = public.current_employee_id()::text
      or exists (select 1 from public.employees me
                  where me.id = public.current_employee_id()
                    and me.role in ('owner','manager'))
    )
  );
