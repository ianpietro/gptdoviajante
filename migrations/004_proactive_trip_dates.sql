-- Prompt 11 foundation: canonical dates for deterministic proactive insights.
-- Safe to run more than once.
alter table public.trips add column if not exists start_date date;
alter table public.trips add column if not exists end_date date;
alter table public.trips add column if not exists timezone text not null default 'America/Sao_Paulo';
alter table public.trips add column if not exists status text not null default 'planning';

update public.trips
set start_date = target_date::date
where start_date is null and target_date is not null;

alter table public.trips drop constraint if exists trips_status_check;
update public.trips
set status = 'planning'
where status is null or status not in ('planning', 'upcoming', 'active', 'completed', 'archived');
alter table public.trips
  add constraint trips_status_check
  check (status in ('planning', 'upcoming', 'active', 'completed', 'archived'));

create index if not exists idx_trips_user_start_date
  on public.trips (user_id, start_date);

comment on column public.trips.start_date is 'Canonical local calendar start date for trip lifecycle rules.';
comment on column public.trips.end_date is 'Canonical local calendar end date for trip lifecycle rules.';
comment on column public.trips.timezone is 'IANA timezone used for deterministic date boundaries.';

-- Only preference metadata is synchronized. Insight copy and private trip data
-- are never stored here.
create table if not exists public.proactive_insight_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  insight_id text not null,
  status text not null check (status in ('dismissed', 'snoozed')),
  snoozed_until timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  primary key (user_id, trip_id, insight_id)
);

alter table public.proactive_insight_preferences enable row level security;
alter table public.proactive_insight_preferences force row level security;

drop policy if exists "Owners read proactive preferences" on public.proactive_insight_preferences;
create policy "Owners read proactive preferences"
  on public.proactive_insight_preferences for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Owners create proactive preferences" on public.proactive_insight_preferences;
create policy "Owners create proactive preferences"
  on public.proactive_insight_preferences for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips
      where trips.id = trip_id and trips.user_id = auth.uid()
    )
  );

drop policy if exists "Owners update proactive preferences" on public.proactive_insight_preferences;
create policy "Owners update proactive preferences"
  on public.proactive_insight_preferences for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.trips
      where trips.id = trip_id and trips.user_id = auth.uid()
    )
  );

revoke all on public.proactive_insight_preferences from anon;
grant select, insert, update on public.proactive_insight_preferences to authenticated;
