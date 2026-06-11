-- 1. Create Profiles Table (extends Supabase Auth Users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create Trips Table
create table public.trips (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null default 'Minha Próxima Viagem',
  subtitle text not null default 'Planeje sua viagem conversando pelo chat!',
  dates text not null default 'A definir',
  weather text not null default 'A definir',
  group_type text not null default 'A definir',
  hotel text not null default 'A definir',
  hotel_link text not null default '',
  target_date timestamp with time zone,
  budget jsonb not null default '{"hospedagem": 0, "alimentacao": 0, "passeios": 0, "compras": 0}'::jsonb,
  budget_thresholds jsonb not null default '{"economico": 150, "intermediario": 450}'::jsonb,
  budget_analysis text not null default '',
  packing jsonb not null default '[]'::jsonb,
  itinerary jsonb not null default '[]'::jsonb,
  flights jsonb not null default '[]'::jsonb,
  members jsonb not null default '["Você"]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Create Documents Table (to store files metadata)
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  trip_id uuid references public.trips on delete cascade not null,
  name text not null,
  category text not null,
  file_url text not null,
  parsed_json jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create Chat Histories Table
create table public.chat_histories (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  trip_id uuid references public.trips on delete cascade not null,
  messages jsonb not null default '[]'::jsonb,
  chat_type text not null check (chat_type in ('plan', 'travel')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_trip_chat_type unique (trip_id, chat_type)
);

-- 5. Enable Row-Level Security (RLS) on all tables
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.documents enable row level security;
alter table public.chat_histories enable row level security;

-- 6. Setup RLS Policies

-- Profiles: Users can read and update their own profile
create policy "Allow profile read for owners" on public.profiles
  for select using (auth.uid() = id);

create policy "Allow profile update for owners" on public.profiles
  for update using (auth.uid() = id);

create policy "Allow profile insert during signup" on public.profiles
  for insert with check (auth.uid() = id);

-- Trips: 
-- - Select is public (enables shared trip views via unguessable UUID)
-- - Insert is restricted to authenticated owners
-- - Update/Delete is restricted to owner
create policy "Allow public read of shared trips" on public.trips
  for select using (true);

create policy "Allow authenticated trip creation" on public.trips
  for insert with check (auth.role() = 'authenticated' and auth.uid() = user_id);

create policy "Allow trip updates for owners" on public.trips
  for update using (auth.uid() = user_id);

create policy "Allow trip delete for owners" on public.trips
  for delete using (auth.uid() = user_id);

-- Documents:
-- - Select is public (so users viewing shared trips can access files)
-- - Insert/Delete checks if user owns the parent trip
create policy "Allow public read of trip documents" on public.documents
  for select using (true);

create policy "Allow document insert for trip owners" on public.documents
  for insert with check (
    exists (
      select 1 from public.trips
      where trips.id = documents.trip_id and trips.user_id = auth.uid()
    )
  );

create policy "Allow document delete for trip owners" on public.documents
  for delete using (
    exists (
      select 1 from public.trips
      where trips.id = documents.trip_id and trips.user_id = auth.uid()
    )
  );

-- Chat Histories:
-- - All actions restricted to the trip owner
create policy "Allow chat history access for owners" on public.chat_histories
  for all using (auth.uid() = user_id);

-- 7. Automatic Profile Creation on User Signup Trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 8. Performance Indexes (foreign key indexing)
create index idx_trips_user_id on public.trips (user_id);
create index idx_documents_trip_id on public.documents (trip_id);
create index idx_chat_histories_user_id on public.chat_histories (user_id);
create index idx_chat_histories_trip_id on public.chat_histories (trip_id);

-- 9. Authorized Emails Table (for checkout webhook sync)
create table public.authorized_emails (
  email text primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for authorized_emails (protect customer list from public reads)
alter table public.authorized_emails enable row level security;

