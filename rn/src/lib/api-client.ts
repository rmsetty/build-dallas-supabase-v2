import { getApiToken } from '@/features/auth/appwrite-auth';
import { Platform } from 'react-native';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(detail ? `API request failed (${status}): ${detail}` : `API request failed (${status})`);
    this.name = 'ApiError';
  }
}

function getBaseUrl(): string {
  const local = __DEV__ && process.env.EXPO_PUBLIC_USE_LOCAL_API === 'true';
  const url = local
    ? process.env.EXPO_PUBLIC_LOCAL_API_URL || (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000')
    : process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error('Set EXPO_PUBLIC_API_URL or enable EXPO_PUBLIC_USE_LOCAL_API for development');
  return url.replace(/\/+$/, '');
}

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const baseURL = getBaseUrl();
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API paths must start with a single slash');
  }

  const accessToken = options.token ? await getApiToken() : null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timeout = setTimeout(abort, options.timeoutMs ?? 15_000);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(`${baseURL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return undefined as T;
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      let detail: string | undefined;
      if (typeof json === 'object' && json !== null && 'detail' in json) {
        const d = (json as { detail: unknown }).detail;
        detail = typeof d === 'string' ? d : JSON.stringify(d);
      }
      throw new ApiError(response.status, detail);
    }

    return json as T;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

// Callers validate unknown JSON at the feature boundary before using it.
export async function getJSON(path: string, signal?: AbortSignal): Promise<unknown> {
  return apiFetch(path, { method: 'GET', signal });
}

export async function apiGet<T>(path: string, token?: string | null, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(path, { method: 'GET', token, signal });
}

export async function apiPost<T>(path: string, body: unknown, token?: string | null, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body, token, signal });
}

export async function apiPut<T>(path: string, body: unknown, token?: string | null, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(path, { method: 'PUT', body, token, signal });
}

export async function apiDelete<T>(path: string, token?: string | null, signal?: AbortSignal): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE', token, signal });
}

export type UploadFileOptions = {
  fieldName?: string;
  filename?: string;
  mimeType?: string;
  token?: string | null;
};

export async function apiUploadFile<T>(
  path: string,
  fileUri: string,
  options: UploadFileOptions = {},
): Promise<T> {
  const baseURL = getBaseUrl();
  const fullUrl = `${baseURL}${path}`;
  const fieldName = options.fieldName || 'file';
  const filename = options.filename || 'avatar.jpg';
  const mimeType = options.mimeType || 'image/jpeg';

  // Strategy 1: Native upload via expo-file-system (avoids JS FormData conversion)
  if (Platform.OS !== 'web') {
    try {
      const { uploadAsync, FileSystemUploadType } = await import('expo-file-system/legacy');
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (options.token) {
        headers['Authorization'] = `Bearer ${await getApiToken()}`;
      }

      const response = await uploadAsync(fullUrl, fileUri, {
        fieldName,
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        mimeType,
        headers,
      });

      let json: unknown;
      try {
        json = JSON.parse(response.body);
      } catch {
        json = null;
      }

      if (response.status < 200 || response.status >= 300) {
        let detail: string | undefined;
        if (typeof json === 'object' && json !== null && 'detail' in json) {
          const d = (json as { detail: unknown }).detail;
          detail = typeof d === 'string' ? d : JSON.stringify(d);
        }
        throw new ApiError(response.status, detail);
      }

      return json as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) throw err;
      console.warn('Native file upload failed, falling back to Blob upload:', err);
    }
  }

  // Strategy 2: Web / Fallback via fetch and real Blob
  const blobRes = await fetch(fileUri);
  const blob = await blobRes.blob();

  const formData = new FormData();
  formData.append(fieldName, blob, filename);

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${await getApiToken()}`;
  }

  const response = await fetch(fullUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  if (!response.ok) {
    let detail: string | undefined;
    if (typeof json === 'object' && json !== null && 'detail' in json) {
      const d = (json as { detail: unknown }).detail;
      detail = typeof d === 'string' ? d : JSON.stringify(d);
    }
    throw new ApiError(response.status, detail);
  }

  return json as T;
}
