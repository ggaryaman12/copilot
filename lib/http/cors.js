import { env } from '@/lib/config/env';

function resolveOrigin(request) {
  const origin = request.headers.get('origin') || '';
  if (!origin) return '';
  if (env.copilotAllowedOrigins.includes('*')) return origin;
  return env.copilotAllowedOrigins.includes(origin) ? origin : '';
}

export function buildCorsHeaders(request) {
  const origin = resolveOrigin(request);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-session-id',
    'Access-Control-Max-Age': '86400'
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
