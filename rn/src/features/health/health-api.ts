import { getJSON } from '@/lib/api-client';

export type HealthResponse = { status: 'ok'; service: string };

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const data = await getJSON('/v1/health', signal);
  if (
    typeof data !== 'object' || data === null ||
    !('status' in data) || data.status !== 'ok' ||
    !('service' in data) || typeof data.service !== 'string'
  ) {
    throw new Error('Invalid health response');
  }
  return { status: data.status, service: data.service };
}
