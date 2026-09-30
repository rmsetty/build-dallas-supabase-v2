alter table public.profiles add column if not exists avatar_url text;

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
  ) into payload
  from (
    select e.starts_at, e.id,
      jsonb_build_object(
        'id', e.id, 'title', e.title, 'description', e.description,
        'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
        'location', case
          when e.hide_exact_location and uid is distinct from e.host_id and e.location is not null
            then jsonb_build_object('label', coalesce(e.location->>'area',''), 'area', coalesce(e.location->>'area',''))
          else e.location end,
        'image_url', e.image_url, 'hide_exact_location', e.hide_exact_location,
        'require_approval', e.require_approval, 'visibility', e.visibility,
        'capacity', e.capacity, 'price_cents', e.price_cents, 'currency', e.currency,
        'created_at', e.created_at, 'updated_at', e.updated_at, 'image_background', '#000000',
        'host', jsonb_build_object(
          'id', p.id, 'name', p.name, 'bio', p.bio, 'avatar_url', p.avatar_url,
          'onboarding_complete', p.onboarding_complete, 'linkedin_url', p.linkedin_url
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
declare uid uuid := auth.uid(); result jsonb;
begin
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'description', e.description,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'timezone', e.timezone,
    'location', case
      when e.hide_exact_location and uid is distinct from e.host_id and e.location is not null
        then jsonb_build_object('label', coalesce(e.location->>'area',''), 'area', coalesce(e.location->>'area',''))
      else e.location end,
    'image_url', e.image_url, 'hide_exact_location', e.hide_exact_location,
    'require_approval', e.require_approval, 'visibility', e.visibility,
    'capacity', e.capacity, 'price_cents', e.price_cents, 'currency', e.currency,
    'created_at', e.created_at, 'updated_at', e.updated_at, 'image_background', '#000000',
    'host', jsonb_build_object(
      'id', p.id, 'name', p.name, 'bio', p.bio, 'avatar_url', p.avatar_url,
      'onboarding_complete', p.onboarding_complete, 'linkedin_url', p.linkedin_url
    )
  ) into result
  from public.events e
  join public.profiles p on p.id = e.host_id
  where e.id = target_id and (e.visibility = 'public' or e.host_id = uid);
  return result;
end;
$$;
