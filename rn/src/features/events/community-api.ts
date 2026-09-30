import { supabase } from '@/lib/supabase';
import { createEmailSession } from '../auth/appwrite-auth';
import { clearBootstrap } from '../discover/bootstrap-api';

export type Profile = {
  id: string;
  name: string;
  bio: string;
  avatar_url: string | null;
  onboarding_complete: boolean;
  linkedin_url?: string | null;
  resume_file_id?: string | null;
  resume_filename?: string | null;
  resume_size?: number | null;
  resume_uploaded_at?: string | null;
};

export type ProfileInput = {
  name: string;
  bio?: string;
  linkedin_url?: string | null;
  avatar_url?: string | null;
};

export type CurrentUser = {
  id: string;
  email: string;
  profile: Profile;
};

export type AuthSession = {
  token_type: 'Bearer';
  access_token: string;
  expires_at: string;
  user: CurrentUser;
};

export type OTPChallenge = {
  user_id: string;
  expires_at: string;
};

export type EventLocation = {
  label: string;
  area: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  instructions?: string | null;
};

export type EventCreateInput = {
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  timezone?: string;
  location?: EventLocation | null;
  image_url?: string | null;
  hide_exact_location?: boolean;
  require_approval?: boolean;
  visibility?: 'public' | 'unlisted' | 'private';
  capacity?: number | null;
  price_cents?: 0;
  currency?: 'USD';
};

export type CommunityEvent = EventCreateInput & {
  id: string;
  host: Profile;
  created_at: string;
  updated_at: string;
  image_background: string;
};

export type EventPage = {
  items: CommunityEvent[];
  next_cursor?: string | null;
};

export { requestEmailOtp } from '../auth/appwrite-auth';

function toProfile(row: any): Profile {
  return {
    id: row.id,
    name: row.name ?? '',
    bio: row.bio ?? '',
    avatar_url: row.avatar_url ?? null,
    onboarding_complete: Boolean(row.onboarding_complete),
    linkedin_url: row.linkedin_url ?? null,
    resume_file_id: row.resume_path ?? null,
    resume_filename: row.resume_filename ?? null,
    resume_size: row.resume_size ?? null,
    resume_uploaded_at: row.resume_uploaded_at ?? null,
  };
}

async function userFromToken(token?: string | null) {
  const { data, error } = token
    ? await supabase.auth.getUser(token)
    : await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('Sign in first');
  return data.user;
}

export async function verifyEmailOtp(email: string, code: string): Promise<AuthSession> {
  const { token, expiresAt } = await createEmailSession(email, code);
  const user = await fetchCurrentUser(token);
  return { token_type: 'Bearer', access_token: token, expires_at: expiresAt, user };
}

export async function fetchCurrentUser(token?: string | null): Promise<CurrentUser> {
  const user = await userFromToken(token);
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return { id: user.id, email: user.email ?? '', profile: toProfile(profileRow) };
}

export async function updateProfile(_token: string, payload: ProfileInput): Promise<Profile> {
  const user = await userFromToken();
  const changes = {
    name: payload.name.trim(),
    bio: payload.bio?.trim() ?? '',
    linkedin_url: payload.linkedin_url ?? null,
    onboarding_complete: true,
    ...(payload.avatar_url !== undefined ? { avatar_url: payload.avatar_url } : {}),
  };
  const { data, error } = await supabase
    .from('profiles')
    .update(changes)
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) throw error;
  return toProfile(data);
}

export async function postEvent(_token: string, payload: EventCreateInput): Promise<CommunityEvent> {
  const user = await userFromToken();
  const insert = {
    host_id: user.id,
    title: payload.title.trim(),
    description: payload.description ?? '',
    starts_at: payload.starts_at,
    ends_at: payload.ends_at,
    timezone: payload.timezone ?? 'America/Chicago',
    location: payload.location ?? null,
    image_url: payload.image_url ?? null,
    hide_exact_location: payload.hide_exact_location ?? false,
    require_approval: payload.require_approval ?? false,
    visibility: payload.visibility ?? 'public',
    capacity: payload.capacity ?? null,
    price_cents: 0,
    currency: 'USD',
  };
  const { data, error } = await supabase.from('events').insert(insert).select('id').single();
  if (error) throw error;
  clearBootstrap();
  return fetchEventById(data.id);
}

export async function fetchMyEvents(_token: string): Promise<EventPage> {
  const { data, error } = await supabase.rpc('list_community_events', { page_limit: 100, mine: true });
  if (error) throw error;
  return data as EventPage;
}

export async function fetchEventById(eventId: string, _token?: string | null): Promise<CommunityEvent> {
  const { data, error } = await supabase.rpc('get_community_event', { target_id: eventId });
  if (error) throw error;
  if (!data) throw new Error('Event not found');
  return data as CommunityEvent;
}

async function fileToArrayBuffer(uri: string) {
  const response = await fetch(uri);
  if (!response.ok && !uri.startsWith('file:')) throw new Error('Could not read selected file');
  return response.arrayBuffer();
}

export async function uploadUserAvatar(
  _token: string,
  fileUri: string,
  filename = 'avatar.jpg',
  mimeType = 'image/jpeg',
): Promise<Profile> {
  const user = await userFromToken();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${Date.now()}-${safe}`;
  const bytes = await fileToArrayBuffer(fileUri);

  const current = await fetchCurrentUser();
  const oldPath = current.profile.avatar_url
    ? current.profile.avatar_url.split('/storage/v1/object/public/avatars/')[1] ?? null
    : null;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicUrl } = supabase.storage.from('avatars').getPublicUrl(path);
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_path: path, avatar_url: publicUrl.publicUrl })
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) throw error;

  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  return toProfile(data);
}

export async function deleteUserAvatar(_token: string): Promise<Profile> {
  const user = await userFromToken();
  const { data: row, error: readError } = await supabase
    .from('profiles')
    .select('avatar_path')
    .eq('id', user.id)
    .single();
  if (readError) throw readError;
  if (row.avatar_path) await supabase.storage.from('avatars').remove([row.avatar_path]);

  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_path: null, avatar_url: null })
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) throw error;
  return toProfile(data);
}

export async function uploadUserResume(_token: string, fileUri: string, filename: string): Promise<Profile> {
  const user = await userFromToken();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'resume.pdf';
  const path = `${user.id}/${Date.now()}-${safe}`;
  const bytes = await fileToArrayBuffer(fileUri);
  if (bytes.byteLength > 5_000_000) throw new Error('Resume must be 5 MB or smaller');

  const { data: previous, error: previousError } = await supabase
    .from('profiles')
    .select('resume_path')
    .eq('id', user.id)
    .single();
  if (previousError) throw previousError;

  const { error: uploadError } = await supabase.storage
    .from('resumes')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('profiles')
    .update({
      resume_path: path,
      resume_filename: safe,
      resume_size: bytes.byteLength,
      resume_uploaded_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) throw error;

  if (previous.resume_path) await supabase.storage.from('resumes').remove([previous.resume_path]);
  return toProfile(data);
}

export async function deleteUserResume(_token: string): Promise<Profile> {
  const user = await userFromToken();
  const { data: previous, error: previousError } = await supabase
    .from('profiles')
    .select('resume_path')
    .eq('id', user.id)
    .single();
  if (previousError) throw previousError;
  if (previous.resume_path) await supabase.storage.from('resumes').remove([previous.resume_path]);

  const { data, error } = await supabase
    .from('profiles')
    .update({
      resume_path: null,
      resume_filename: null,
      resume_size: null,
      resume_uploaded_at: null,
    })
    .eq('id', user.id)
    .select('*')
    .single();
  if (error) throw error;
  return toProfile(data);
}
