import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import {
  deleteUserAvatar,
  deleteUserResume,
  uploadUserResume,
  fetchCurrentUser,
  requestEmailOtp,
  updateProfile,
  uploadUserAvatar,
  verifyEmailOtp,
  type AuthSession,
  type CurrentUser,
  type OTPChallenge,
  type Profile,
  type ProfileInput,
} from '../events/community-api';
import { getApiToken, deleteAppwriteSession } from './appwrite-auth';
import { clearBootstrap, updateBootstrapUser } from '../discover/bootstrap-api';
import { sessionStore } from '@/lib/session-store';

export type AuthContextType = {
  isAuthenticated: boolean;
  hasSession: boolean;
  token: string | null;
  currentUser: CurrentUser | null;
  session: AuthSession | null;
  isLoading: boolean;
  requestOTP: (email: string) => Promise<OTPChallenge>;
  verifyOTP: (userId: string, code: string) => Promise<AuthSession>;
  saveProfile: (data: ProfileInput) => Promise<Profile>;
  uploadAvatar: (fileUri: string, filename?: string, mimeType?: string) => Promise<Profile>;
  deleteAvatar: () => Promise<Profile>;
  uploadResume: (fileUri: string, filename: string) => Promise<Profile>;
  deleteResume: () => Promise<Profile>;
  signOut: () => Promise<void>;
  setSessionManually: (session: AuthSession | null) => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Appwrite restores its session; never restore a backend session secret.
    getApiToken().then(async token => {
      const user = await fetchCurrentUser(token);
      if (!active) return;
      const restored: AuthSession = {
        token_type: 'Bearer', access_token: token,
        expires_at: new Date(Date.now() + 900_000).toISOString(), user,
      };
      sessionStore.set(restored);
      setSession(restored);
      setCurrentUser(user);
    }).catch(() => {
      if (active) sessionStore.clear();
    }).finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const token = session?.access_token ?? null;
  const onboardingComplete = Boolean(
    currentUser?.profile?.onboarding_complete || (currentUser?.profile?.name && currentUser.profile.name.length > 0),
  );
  const isAuthenticated = Boolean(token && onboardingComplete);
  const hasSession = Boolean(token);

  async function requestOTP(email: string): Promise<OTPChallenge> {
    return requestEmailOtp(email);
  }

  async function verifyOTP(userId: string, code: string): Promise<AuthSession> {
    const newSession = await verifyEmailOtp(userId, code);
    setSession(newSession);
    setCurrentUser(newSession.user);
    sessionStore.set({
      access_token: newSession.access_token,
      expires_at: newSession.expires_at,
      user: newSession.user,
    });
    return newSession;
  }

  async function saveProfile(data: ProfileInput): Promise<Profile> {
    if (!token) throw new Error('Not authenticated');
    const updated = await updateProfile(token, data);
    if (currentUser) {
      const nextUser: CurrentUser = {
        ...currentUser,
        profile: updated,
      };
      setCurrentUser(nextUser);
      updateBootstrapUser(nextUser);
      if (session) {
        sessionStore.set({
          access_token: session.access_token,
          expires_at: session.expires_at,
          user: nextUser,
        });
      }
    }
    return updated;
  }

  async function uploadAvatar(fileUri: string, filename?: string, mimeType?: string): Promise<Profile> {
    if (!token) throw new Error('Not authenticated');
    const updated = await uploadUserAvatar(token, fileUri, filename, mimeType);
    if (currentUser) {
      const nextUser: CurrentUser = {
        ...currentUser,
        profile: updated,
      };
      setCurrentUser(nextUser);
      updateBootstrapUser(nextUser);
      if (session) {
        sessionStore.set({
          access_token: session.access_token,
          expires_at: session.expires_at,
          user: nextUser,
        });
      }
    }
    return updated;
  }

  async function deleteAvatar(): Promise<Profile> {
    if (!token) throw new Error('Not authenticated');
    const updated = await deleteUserAvatar(token);
    if (currentUser) {
      const nextUser: CurrentUser = {
        ...currentUser,
        profile: updated,
      };
      setCurrentUser(nextUser);
      updateBootstrapUser(nextUser);
      if (session) {
        sessionStore.set({
          access_token: session.access_token,
          expires_at: session.expires_at,
          user: nextUser,
        });
      }
    }
    return updated;
  }

  function applyProfile(profile: Profile) {
    if (!currentUser) return;
    const nextUser = { ...currentUser, profile };
    setCurrentUser(nextUser);
    updateBootstrapUser(nextUser);
    if (session) sessionStore.set({
      access_token: session.access_token, expires_at: session.expires_at, user: nextUser,
    });
  }

  async function uploadResume(fileUri: string, filename: string): Promise<Profile> {
    if (!token) throw new Error('Not authenticated');
    const updated = await uploadUserResume(token, fileUri, filename);
    applyProfile(updated);
    return updated;
  }

  async function deleteResume(): Promise<Profile> {
    if (!token) throw new Error('Not authenticated');
    const updated = await deleteUserResume(token);
    applyProfile(updated);
    return updated;
  }

  async function signOut(): Promise<void> {
    // A failed remote logout is surfaced so the user can retry revocation.
    await deleteAppwriteSession();
    clearBootstrap();
    sessionStore.clear();
    setSession(null);
    setCurrentUser(null);
  }

  return (
    <AuthContext
      value={{
        isAuthenticated,
        hasSession,
        token,
        currentUser,
        session,
        isLoading,
        requestOTP,
        verifyOTP,
        saveProfile,
        uploadAvatar,
        deleteAvatar,
        uploadResume,
        deleteResume,
        signOut,
        setSessionManually: setSession,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthContextType {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used within AuthProvider');
  return auth;
}
