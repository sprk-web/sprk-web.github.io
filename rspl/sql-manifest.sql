-- RSPL Attendance: workforce and payroll schema
-- Run in Supabase SQL Editor as project owner.
-- SECURITY NOTE: worker-media is PRIVATE because government ID documents must not be public.
-- Never use the service_role key in a browser. RLS is enabled on every business table.

create extension if not exists pgcrypto;

do $$ begin create type public.user_role as enum ('chairman','admin','worker'); exception when duplicate_object then null; end $$;
do $$ begin create type public.attendance_status as enum ('present','absent','half_day','overtime'); exception when duplicate_object then null; end $$;
do $$ begin create type public.trade_type as enum ('mason','carpenter','electrician','plumber','welder','painter','helper','operator','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_entry_type as enum ('wage','advance','adjustment'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_status as enum ('paid','pending','cancelled'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text,
  role public.user_role not null default 'worker',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 140),
  project_code text unique,
  location text,
  status text not null default 'active' check (status in ('active','paused','completed')),
  start_date date,
  end_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null check (char_length(full_name) between 1 and 120),
  phone text,
  govt_id_number text,
  emergency_contact text,
  trade_type public.trade_type not null default 'helper',
  daily_wage_rate numeric(12,2) not null default 0 check (daily_wage_rate >= 0),
  status text not null default 'active' check (status in ('active','inactive','on_leave')),
  avatar_path text,
  id_proof_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_assignments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  notes text,
  check (unassigned_at is null or unassigned_at >= assigned_at),
  unique(worker_id, project_id, assigned_at)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  work_date date not null,
  status public.attendance_status not null,
  overtime_hours numeric(5,2) not null default 0 check (overtime_hours between 0 and 24),
  wage_amount numeric(12,2) not null default 0 check (wage_amount >= 0),
  notes text,
  marked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(worker_id, work_date, project_id)
);

create table if not exists public.payments_ledger (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  entry_type public.ledger_entry_type not null,
  amount numeric(12,2) not null check (amount > 0),
  transaction_date date not null default current_date,
  status public.ledger_status not null default 'pending',
  receipt_reference text,
  description text,
  period_start date,
  period_end date,
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists workers_profile_id_idx on public.workers(profile_id);
create index if not exists workers_status_idx on public.workers(status);
create index if not exists workers_trade_idx on public.workers(trade_type);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists site_assignments_worker_idx on public.site_assignments(worker_id);
create index if not exists site_assignments_project_idx on public.site_assignments(project_id);
create index if not exists attendance_date_project_idx on public.attendance(work_date, project_id);
create index if not exists attendance_worker_date_idx on public.attendance(worker_id, work_date desc);
create index if not exists payments_worker_date_idx on public.payments_ledger(worker_id, transaction_date desc);
create index if not exists payments_status_type_idx on public.payments_ledger(status, entry_type);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists workers_set_updated_at on public.workers;
create trigger workers_set_updated_at before update on public.workers for each row execute function public.set_updated_at();
drop trigger if exists attendance_set_updated_at on public.attendance;
create trigger attendance_set_updated_at before update on public.attendance for each row execute function public.set_updated_at();
drop trigger if exists payments_set_updated_at on public.payments_ledger;
create trigger payments_set_updated_at before update on public.payments_ledger for each row execute function public.set_updated_at();

create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_chairman()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'chairman', false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in ('chairman','admin'), false)
$$;

create or replace function public.can_access_worker(target_worker uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.workers w where w.id = target_worker and w.profile_id = auth.uid()
  )
$$;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.workers enable row level security;
alter table public.attendance enable row level security;
alter table public.payments_ledger enable row level security;
alter table public.site_assignments enable row level security;

-- Profiles: users can read their own profile; Chairman manages all roles.
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_chairman());
drop policy if exists "profiles_chairman_all" on public.profiles;
create policy "profiles_chairman_all" on public.profiles for all to authenticated using (public.is_chairman()) with check (public.is_chairman());
drop policy if exists "profiles_self_update_limited" on public.profiles;
create policy "profiles_self_update_limited" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = public.current_role());

-- Projects: Chairman full control; admins and workers can read sites linked to their assignment.
drop policy if exists "projects_chairman_all" on public.projects;
create policy "projects_chairman_all" on public.projects for all to authenticated using (public.is_chairman()) with check (public.is_chairman());
drop policy if exists "projects_admin_read" on public.projects;
create policy "projects_admin_read" on public.projects for select to authenticated using (public.is_admin());
drop policy if exists "projects_worker_assigned_read" on public.projects;
create policy "projects_worker_assigned_read" on public.projects for select to authenticated using (
  exists (select 1 from public.site_assignments sa join public.workers w on w.id=sa.worker_id
          where sa.project_id=projects.id and w.profile_id=auth.uid() and sa.unassigned_at is null)
);

-- Workers: admin/Chairman can manage workforce. Workers can read only their linked profile.
drop policy if exists "workers_admin_all" on public.workers;
create policy "workers_admin_all" on public.workers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "workers_self_read" on public.workers;
create policy "workers_self_read" on public.workers for select to authenticated using (profile_id = auth.uid());

-- Assignments: admins can manage; workers see only their own assignments.
drop policy if exists "assignments_admin_all" on public.site_assignments;
create policy "assignments_admin_all" on public.site_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "assignments_worker_read" on public.site_assignments;
create policy "assignments_worker_read" on public.site_assignments for select to authenticated using (
  exists (select 1 from public.workers w where w.id=site_assignments.worker_id and w.profile_id=auth.uid())
);

-- Attendance: admins can manage; workers can read their own.
drop policy if exists "attendance_admin_all" on public.attendance;
create policy "attendance_admin_all" on public.attendance for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "attendance_worker_read" on public.attendance;
create policy "attendance_worker_read" on public.attendance for select to authenticated using (public.can_access_worker(worker_id) and not public.is_admin());

-- Ledger: admins can manage; workers can read their own.
drop policy if exists "ledger_admin_all" on public.payments_ledger;
create policy "ledger_admin_all" on public.payments_ledger for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "ledger_worker_read" on public.payments_ledger;
create policy "ledger_worker_read" on public.payments_ledger for select to authenticated using (public.can_access_worker(worker_id) and not public.is_admin());

-- Storage bucket: private, so Aadhaar/ID proof files are never world-readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worker-media','worker-media',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=8388608,
  allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'];

drop policy if exists "worker_media_admin_read" on storage.objects;
create policy "worker_media_admin_read" on storage.objects for select to authenticated
using (bucket_id='worker-media' and public.is_admin());
drop policy if exists "worker_media_worker_own_read" on storage.objects;
create policy "worker_media_worker_own_read" on storage.objects for select to authenticated
using (bucket_id='worker-media' and exists (
  select 1 from public.workers w where w.profile_id=auth.uid()
  and (storage.objects.name like w.id::text || '/%')
));
drop policy if exists "worker_media_admin_insert" on storage.objects;
create policy "worker_media_admin_insert" on storage.objects for insert to authenticated
with check (bucket_id='worker-media' and public.is_admin());
drop policy if exists "worker_media_admin_update" on storage.objects;
create policy "worker_media_admin_update" on storage.objects for update to authenticated
using (bucket_id='worker-media' and public.is_admin())
with check (bucket_id='worker-media' and public.is_admin());
drop policy if exists "worker_media_admin_delete" on storage.objects;
create policy "worker_media_admin_delete" on storage.objects for delete to authenticated
using (bucket_id='worker-media' and public.is_admin());

-- Optional: bootstrap profile rows for new Auth users. Role is always worker by default;
-- provision Chairman/Admin roles manually in SQL as project owner.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), 'worker')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Bootstrap a Chairman after creating that user through Supabase Auth:
-- update public.profiles set role='chairman' where id='AUTH_USER_UUID';
-- Provision admins similarly:
-- update public.profiles set role='admin' where id='AUTH_USER_UUID';

-- NOTE: app-side wage policy currently assumes 1 day for Present/Overtime, 0.5 for Half-day,
-- 0 for Absent; overtime hours beyond 8 are paid at 1.5x hourly base. Confirm this policy
-- with your payroll rules before production use.
