import { env } from '@/lib/config/env';

export function assertApiKey(request) {
  const key = request.headers.get('x-api-key') || '';
  return key && key === env.apiKey;
}
