alter function public.match_provider_events(extensions.vector, integer) set search_path = '';

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

create index if not exists event_contributions_event_idx on public.event_contributions(event_id);
create index if not exists event_contributions_user_idx on public.event_contributions(user_id);
