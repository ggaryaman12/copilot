import path from 'path';

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
}

function parseScopePaths(raw) {
  const defaults = [
    '/Users/aryamangupta/YELO/yelo-server',
    '/Users/aryamangupta/YELO/yelo-dashboard-angular',
    '/Users/aryamangupta/YELO/yelo-marketplace-webapp'
  ];
  const items = (raw || defaults.join(','))
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => path.resolve(v));
  return Array.from(new Set(items));
}

export const env = {
  apiKey: process.env.YELO_AGENT_API_KEY || 'change-me',
  copilotAllowedOrigins: (process.env.COPILOT_ALLOWED_ORIGINS || 'http://localhost:4200,http://127.0.0.1:4200,http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  llmProvider: (process.env.LLM_PROVIDER || 'auto').toLowerCase(),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaGenerateModel: process.env.OLLAMA_GENERATE_MODEL || 'minimax-m2.5:cloud',
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || 'minimax-m2.5:cloud',
  ollamaTimeoutMs: toInt(process.env.OLLAMA_TIMEOUT_MS, 90000),
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiGenerateModel: process.env.GEMINI_GENERATE_MODEL || 'gemini-1.5-pro',
  geminiEmbedModel: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
  scopePaths: parseScopePaths(process.env.REPO_SCOPE_PATHS),
  ragTopK: toInt(process.env.RAG_TOP_K, 8),
  ragChunkLines: toInt(process.env.RAG_CHUNK_LINES, 120),
  ragChunkOverlap: toInt(process.env.RAG_CHUNK_OVERLAP, 20),
  db: {
    host: process.env.DB_HOST || '',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    ssl: toBool(process.env.DB_SSL, false),
    queryTimeoutMs: toInt(process.env.DB_QUERY_TIMEOUT_MS, 12000),
    rowLimit: toInt(process.env.DB_ROW_LIMIT, 200)
  }
};

export function getMissingDbEnvKeys() {
  const missing = [];
  if (!env.db.host) missing.push('DB_HOST');
  if (!env.db.user) missing.push('DB_USER');
  if (!env.db.password) missing.push('DB_PASSWORD');
  if (!env.db.database) missing.push('DB_NAME');
  return missing;
}
