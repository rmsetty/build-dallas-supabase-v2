import { rememberMeetupEvents } from '../events/meetup-api';
import { fetchBootstrap } from './bootstrap-api';
import { sessionStore } from '@/lib/session-store';
import { type ProviderEvent } from '../events/provider-event';

export type StartupEvents = {
  items: ProviderEvent[];
  queries: string[];
  failedQueries: string[];
  incomplete: boolean;
  fetchedAt: string;
  failedProviders?: string[];
  next_cursor?: string | null;
};

export async function fetchStartupEvents(signal?: AbortSignal, force = false): Promise<StartupEvents> {
  const data = await fetchBootstrap(sessionStore.get()?.access_token, force);
  if (signal?.aborted) throw new Error('Request cancelled');
  rememberMeetupEvents(data.discover.items.filter(event => event.source === 'meetup'));
  return data.discover;
}
