import { supabase } from '@/lib/supabase';
import { clearBootstrap, type CatalogPage } from '../discover/bootstrap-api';

export const MAX_INTERESTS = 30;
export const MAX_INTEREST_LENGTH = 40;
export const MAX_ABOUT_LENGTH = 280;

export type Interests = { interests: string[]; about: string; updated_at: string };
export type InterestsInput = { interests: string[]; about?: string };
export type ForYouPage = CatalogPage & { personalized: true };

export async function saveInterests(_token: string, payload: InterestsInput): Promise<Interests> {
  const { data, error } = await supabase.functions.invoke('save-interests', { body: payload });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  clearBootstrap();
  return {
    interests: data.interests ?? [],
    about: data.about ?? '',
    updated_at: data.updated_at ?? new Date().toISOString(),
  };
}

export async function clearInterests(_token: string): Promise<void> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error('Sign in first');
  const { error } = await supabase.from('user_interests').delete().eq('user_id', user.id);
  if (error) throw error;
  clearBootstrap();
}

export async function fetchForYouPage(
  _token: string | null | undefined,
  cursor?: string | null,
): Promise<ForYouPage> {
  const offset = Number.parseInt(cursor || '0', 10) || 0;
  const { data, error } = await supabase.rpc('my_recommended_provider_events', {
    offset_count: offset,
    limit_count: 30,
  });
  if (error) throw error;
  if (!data) throw new Error('Save your interests first');
  return { ...(data as CatalogPage), personalized: true };
}

export function normalizeInterest(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function mergeInterests(current: string[], added: string[]) {
  const seen = new Set<string>();
  return [...current, ...added]
    .map(normalizeInterest)
    .filter(value => {
      const key = value.toLowerCase();
      if (!value || value.length > MAX_INTEREST_LENGTH || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_INTERESTS);
}
