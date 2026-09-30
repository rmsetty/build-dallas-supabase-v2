import { supabase } from '@/lib/supabase';

export async function getApiToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error('No active session');
  return data.session.access_token;
}

export function clearApiToken() {
  // Supabase owns token refresh/persistence; kept for legacy call-site compatibility.
}

export async function requestEmailOtp(email: string) {
  const normalized = email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
  return {
    user_id: normalized,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export async function createEmailSession(email: string, code: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code,
    type: 'email',
  });
  if (error) throw error;
  if (!data.session) throw new Error('Could not create session');
  return {
    token: data.session.access_token,
    expiresAt: new Date(data.session.expires_at! * 1000).toISOString(),
  };
}

export async function deleteAppwriteSession() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
