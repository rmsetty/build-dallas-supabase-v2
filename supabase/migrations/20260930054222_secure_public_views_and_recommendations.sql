drop policy if exists "profiles public read" on public.profiles;
create policy "profiles owner read" on public.profiles
for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "events public or owner read" on public.events;
create policy "events owner read" on public.events
for select to authenticated using ((select auth.uid()) = host_id);

create or replace function public.list_community_events(
  page_limit integer default 20,
  mine boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  payload jsonb;
begin
  if mine and uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(item order by starts_at, id), '[]'::jsonb),
    'next_cursor', null
  )
  into payload
  from (
    select e.starts_at, e.id,
      jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'description', e.description,
        'starts_at', e.starts_at,
        'ends_at', e.ends_at,
        'timezone', e.timezone,
        'location', case
          when e.hide_exact_location and uid is distinct from e.host_id and e.location is not null
            then jsonb_build_object('label', coalesce(e.location->>'area',''), 'area', coalesce(e.location->>'area',''))
          else e.location end,
        'image_url', e.image_url,
        'hide_exact_location', e.hide_exact_location,
        'require_approval', e.require_approval,
        'visibility', e.visibility,
        'capacity', e.capacity,
        'price_cents', e.price_cents,
        'currency', e.currency,
        'created_at', e.created_at,
        'updated_at', e.updated_at,
        'image_background', '#000000',
        'host', jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'bio', p.bio,
          'avatar_url', null,
          'onboarding_complete', p.onboarding_complete,
          'linkedin_url', p.linkedin_url
        )
      ) as item
    from public.events e
    join public.profiles p on p.id = e.host_id
    where case when mine then e.host_id = uid else (e.visibility = 'public' or e.host_id = uid) end
    order by e.starts_at, e.id
    limit least(greatest(page_limit, 1), 100)
  ) s;

  return coalesce(payload, jsonb_build_object('items','[]'::jsonb,'next_cursor',null));
end;
$$;

create or replace function public.get_community_event(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'description', e.description,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'timezone', e.timezone,
    'location', case
      when e.hide_exact_location and uid is distinct from e.host_id and e.location is not null
        then jsonb_build_object('label', coalesce(e.location->>'area',''), 'area', coalesce(e.location->>'area',''))
      else e.location end,
    'image_url', e.image_url,
    'hide_exact_location', e.hide_exact_location,
    'require_approval', e.require_approval,
    'visibility', e.visibility,
    'capacity', e.capacity,
    'price_cents', e.price_cents,
    'currency', e.currency,
    'created_at', e.created_at,
    'updated_at', e.updated_at,
    'image_background', '#000000',
    'host', jsonb_build_object(
      'id', p.id,
      'name', p.name,
      'bio', p.bio,
      'avatar_url', null,
      'onboarding_complete', p.onboarding_complete,
      'linkedin_url', p.linkedin_url
    )
  )
  into result
  from public.events e
  join public.profiles p on p.id = e.host_id
  where e.id = target_id and (e.visibility = 'public' or e.host_id = uid);

  return result;
end;
$$;

revoke all on function public.list_community_events(integer,boolean) from public;
grant execute on function public.list_community_events(integer,boolean) to anon, authenticated;
revoke all on function public.get_community_event(uuid) from public;
grant execute on function public.get_community_event(uuid) to anon, authenticated;

create or replace function public.my_recommended_provider_events(
  offset_count integer default 0,
  limit_count integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  q extensions.vector(384);
  payload jsonb;
  total_count integer;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select embedding into q from public.user_interests where user_id = uid;
  if q is null then return null; end if;

  select count(*) into total_count
  from public.provider_events
  where starts_at >= now() and embedding is not null;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(data order by distance), '[]'::jsonb),
    'next_cursor', case when offset_count + limit_count < least(total_count,100) then (offset_count + limit_count)::text else null end,
    'personalized', true,
    'queries', '[]'::jsonb,
    'failedQueries', '[]'::jsonb,
    'failedProviders', '[]'::jsonb,
    'incomplete', false,
    'fetchedAt', now()
  )
  into payload
  from (
    select data, embedding OPERATOR(extensions.<=>) q as distance
    from public.provider_events
    where starts_at >= now() and embedding is not null
    order by embedding OPERATOR(extensions.<=>) q
    offset greatest(offset_count,0)
    limit least(greatest(limit_count,1),30)
  ) ranked;

  return payload;
end;
$$;

revoke all on function public.my_recommended_provider_events(integer,integer) from public;
grant execute on function public.my_recommended_provider_events(integer,integer) to authenticated;
