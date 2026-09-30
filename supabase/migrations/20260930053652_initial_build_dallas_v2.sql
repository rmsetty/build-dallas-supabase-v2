create extension if not exists vector with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  bio text not null default '' check (char_length(bio) <= 2000),
  avatar_path text,
  linkedin_url text,
  onboarding_complete boolean not null default false,
  resume_path text,
  resume_filename text,
  resume_size bigint,
  resume_uploaded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 255),
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Chicago',
  location jsonb,
  image_url text,
  hide_exact_location boolean not null default false,
  require_approval boolean not null default false,
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  capacity integer check (capacity is null or capacity between 1 and 1000000),
  price_cents integer not null default 0 check (price_cents = 0),
  currency text not null default 'USD' check (currency = 'USD'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (ends_at > starts_at)
);

create index if not exists events_visibility_starts_idx on public.events(visibility, starts_at);
create index if not exists events_host_starts_idx on public.events(host_id, starts_at);

create table if not exists public.provider_events (
  source text not null check (source in ('luma','eventbrite','meetup')),
  provider_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null default '',
  search_text text not null default '',
  startup boolean not null default false,
  data jsonb not null,
  fetched_at timestamptz not null default now(),
  embedding extensions.vector(384),
  embedded_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source, provider_event_id)
);

create index if not exists provider_events_starts_idx on public.provider_events(starts_at);
create index if not exists provider_events_startup_starts_idx on public.provider_events(startup, starts_at);
create index if not exists provider_events_search_idx on public.provider_events using gin (to_tsvector('english', search_text));

create table if not exists public.ingestion_status (
  source text primary key check (source in ('luma','eventbrite','meetup')),
  fetched_at timestamptz not null,
  incomplete boolean not null default false,
  item_count integer not null default 0,
  error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_interests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interests text[] not null default '{}',
  about text not null default '' check (char_length(about) <= 280),
  text_hash text not null default '',
  embedding extensions.vector(384),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_contributions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  provider_source text,
  provider_event_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('note','correction','transcript','deck','recording_link','other')),
  content text,
  url text,
  status text not null default 'community_submitted' check (status in ('community_submitted','build_dallas_reviewed','organizer_verified','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contribution_event_ref check (
    event_id is not null or (provider_source is not null and provider_event_id is not null)
  )
);

create table if not exists public.follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists events_touch_updated_at on public.events;
create trigger events_touch_updated_at before update on public.events
for each row execute function public.touch_updated_at();

drop trigger if exists provider_events_touch_updated_at on public.provider_events;
create trigger provider_events_touch_updated_at before update on public.provider_events
for each row execute function public.touch_updated_at();

drop trigger if exists event_contributions_touch_updated_at on public.event_contributions;
create trigger event_contributions_touch_updated_at before update on public.event_contributions
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.provider_events enable row level security;
alter table public.ingestion_status enable row level security;
alter table public.user_interests enable row level security;
alter table public.event_contributions enable row level security;
alter table public.follows enable row level security;

create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles owner update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "events public or owner read" on public.events for select using (visibility = 'public' or (select auth.uid()) = host_id);
create policy "events owner insert" on public.events for insert to authenticated with check ((select auth.uid()) = host_id);
create policy "events owner update" on public.events for update to authenticated using ((select auth.uid()) = host_id) with check ((select auth.uid()) = host_id);
create policy "events owner delete" on public.events for delete to authenticated using ((select auth.uid()) = host_id);

create policy "provider events public read" on public.provider_events for select using (true);
create policy "ingestion status public read" on public.ingestion_status for select using (true);

create policy "interests owner read" on public.user_interests for select to authenticated using ((select auth.uid()) = user_id);
create policy "interests owner insert" on public.user_interests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "interests owner update" on public.user_interests for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "interests owner delete" on public.user_interests for delete to authenticated using ((select auth.uid()) = user_id);

create policy "contributions public accepted read" on public.event_contributions for select using (status in ('community_submitted','build_dallas_reviewed','organizer_verified') or (select auth.uid()) = user_id);
create policy "contributions owner insert" on public.event_contributions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "contributions owner update pending" on public.event_contributions for update to authenticated using ((select auth.uid()) = user_id and status = 'community_submitted') with check ((select auth.uid()) = user_id);

create policy "follows owner all" on public.follows for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.match_provider_events(
  query_embedding extensions.vector(384),
  match_count integer default 100
)
returns table (
  source text,
  provider_event_id text,
  starts_at timestamptz,
  data jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    p.source,
    p.provider_event_id,
    p.starts_at,
    p.data,
    (1 - (p.embedding OPERATOR(extensions.<=>) query_embedding))::double precision as similarity
  from public.provider_events p
  where p.starts_at >= now() and p.embedding is not null
  order by p.embedding OPERATOR(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 100);
$$;

revoke all on function public.match_provider_events(extensions.vector, integer) from public;
grant execute on function public.match_provider_events(extensions.vector, integer) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars','avatars',true,10485760,array['image/jpeg','image/png','image/webp','image/gif']),
  ('resumes','resumes',false,5000000,array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "avatar public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar owner insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "avatar owner update" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and owner_id = (select auth.uid()::text)
) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "avatar owner delete" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and owner_id = (select auth.uid()::text)
);

create policy "resume owner read" on storage.objects for select to authenticated using (
  bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "resume owner insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "resume owner update" on storage.objects for update to authenticated using (
  bucket_id = 'resumes' and owner_id = (select auth.uid()::text)
) with check (
  bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy "resume owner delete" on storage.objects for delete to authenticated using (
  bucket_id = 'resumes' and owner_id = (select auth.uid()::text)
);
