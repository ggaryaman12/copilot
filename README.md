# YELO Copilot Platform v1

Standalone internal AI platform for:

- `/Users/aryamangupta/YELO/yelo-server`
- `/Users/aryamangupta/YELO/yelo-dashboard-angular`
- `/Users/aryamangupta/YELO/yelo-marketplace-webapp`

Excluded from v1 indexing/scope:

- `payment-gateways`
- `yelo-socket`
- `jungle-sms-server`

## Features

- Next.js app with API routes + worker scripts.
- Ollama inference (`minimax-m2.5:cloud` by default) for agent responses.
- Hybrid retrieval (lexical + embeddings) with line-aware citations.
- Multi-agent SQL assist:
  - Intent Agent (domain/workspace narrowing)
  - Table Agent (recommended tables with user ACK/edit)
  - Column Prune Agent (token-safe schema narrowing)
- Preflight unknown-context stage:
  - asks upfront questions before queue execution
  - blocks queue item until required answers are filled
- Prompt queue:
  - blocked/queued/running/done states
  - sequential execution for batched tasks
- Read-only DB copilot:
  - schema introspection
  - safe `SELECT` execution
  - `EXPLAIN` support
  - mutating SQL blocked
- API key auth and request audit logging.
- Eval runner for citation/structure/safety checks.

## Quick Start

1. Install deps:

```bash
cd /Users/aryamangupta/YELO/yelo-copilot-platform
npm install
```

2. Configure env:

```bash
cp .env.example .env.local
```

3. Build index:

```bash
npm run index:build
```

4. Run app:

```bash
npm run dev
```

5. Optional eval run:

```bash
npm run eval:run
```

## Required Env Vars

- `YELO_AGENT_API_KEY`
- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_GENERATE_MODEL` (default `minimax-m2.5:cloud`)
- `OLLAMA_EMBED_MODEL` (default `minimax-m2.5:cloud`)
- `REPO_SCOPE_PATHS`
- `RAG_TOP_K`, `RAG_CHUNK_LINES`, `RAG_CHUNK_OVERLAP`
- `RAG_MAX_CHUNK_CHARS`, `RAG_MAX_FILE_BYTES`, `RAG_MAX_FILES`, `RAG_MAX_CHUNKS`, `RAG_EMBED_MAX_CHUNKS`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_QUERY_TIMEOUT_MS`, `DB_ROW_LIMIT`

## Main Endpoints

- `POST /api/chat`
- `POST /api/retrieval/search`
- `GET /api/db/schema`
- `POST /api/db/query`
- `POST /api/db/explain`
- `POST /api/eval/run`
- `GET /api/health`

## Notes

- Existing YELO repos are not modified by this project.
- SQL is enforced as read-only in middleware (`SELECT`/`EXPLAIN` only).
- If embedding model is unavailable, retrieval falls back to lexical mode (no 500 crash).
- Audit logs are appended to `data/audit.log` as JSON lines.
