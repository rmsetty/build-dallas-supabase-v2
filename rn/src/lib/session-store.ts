import type { AuthSession } from '@/features/events/community-api';

// Appwrite owns persistent sessions. API JWTs and bootstrap state stay in memory.
type StoredSession = Pick<AuthSession, 'access_token' | 'expires_at' | 'user'>;
let memorySession: StoredSession | null = null;
export const sessionStore = {
  get: () => memorySession,
  set(session: StoredSession | null) { memorySession = session; },
  clear() { memorySession = null; },
};

// Remove credentials left by the former backend-managed web session flow.
if (typeof window !== 'undefined') {
  try { window.localStorage?.removeItem('build_dallas_session'); } catch { /* Storage unavailable. */ }
}
