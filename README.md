# YELO Copilot Platform v1

Standalone internal AI platform for:

- `/Users/aryamangupta/YELO/yelo-server`
- `/Users/aryamangupta/YELO/yelo-dashboard-angular`
- `/Users/aryamangupta/YELO/yelo-marketplace-webapp`

Excluded from v1 indexing/scope:

- `payment-gateways`
- `yelo-socket`
- `jungle-sms-server`

## What This Platform Does

This platform is an internal engineering copilot for YELO teams. It:

- Understands and answers questions over scoped repos using retrieval with citations.
- Supports three work modes:
  - Architecture analysis
  - Request flow tracing
  - SQL Copilot (read-only guarded execution)
- Uses a provider adapter so inference can run on:
  - `AUTO` (defaults to Ollama)
  - explicit Ollama
  - explicit Gemini (user-supplied API key/model from UI)
- Enforces SQL safety (`SELECT`/`EXPLAIN` only, limit + timeout + deny mutating SQL).
- Logs activity for audit/debug (`data/audit.log`, `data/runtime.log`).

## Features

- Next.js app with API routes + worker scripts.
- Provider adapter layer: `AUTO` (default Ollama) or per-user `Ollama/Gemini` override from UI.
- Hybrid retrieval (lexical + embeddings) with line-aware citations.
- Multi-agent SQL assist:
  - Intent Agent (domain/workspace narrowing)
  - Table Agent (recommended real DB tables from schema)
  - Column Prune Agent (token-safe schema narrowing)
  - SQL Planner (deterministic schema-first SQL generation before LLM fallback)
- Preflight unknown-context stage:
  - asks upfront questions only when strictly required
  - SQL mode avoids generic blockers and prefers deterministic execution
- Prompt queue:
  - blocked/queued/running/done states
  - sequential execution for batched tasks
- Read-only DB copilot:
  - schema introspection
  - safe `SELECT` execution
  - `EXPLAIN` support
  - mutating SQL blocked
- DB memory snapshot:
  - captures full schema + yelo-server table hints
  - stores memory at `data/memory/schema-memory.json`
  - surfaces follow-up confirmation questions for ambiguous tables
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
- `LLM_PROVIDER` (`auto|ollama|gemini`)
- `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- `OLLAMA_GENERATE_MODEL` (default `minimax-m2.5:cloud`)
- `OLLAMA_EMBED_MODEL` (default `minimax-m2.5:cloud`)
- `GEMINI_BASE_URL`, `GEMINI_API_KEY`, `GEMINI_GENERATE_MODEL`, `GEMINI_EMBED_MODEL`
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
- `POST /api/db/snapshot`
- `POST /api/eval/run`
- `GET /api/health`

## Notes

- Existing YELO repos are not modified by this project.
- SQL is enforced as read-only in middleware (`SELECT`/`EXPLAIN` only).
- If embedding model is unavailable, retrieval falls back to lexical mode (no 500 crash).
- Audit logs are appended to `data/audit.log` as JSON lines.

## Training Roadmap

This project follows a staged path from retrieval tuning to model tuning.

### Iteration 1: RAG and Prompt Tuning (Current Phase)

Goal:

- Improve answer quality without changing model weights.

Flow:

1. Index scoped repos into chunked, line-aware knowledge (`data/index.json`).
2. Retrieve relevant chunks per prompt (lexical + embedding fallback).
3. Run intent/table/column agents.
4. Run deterministic SQL planner for SQL mode (schema-first) and execute safely.
5. Generate answer with strict policy and citations.
6. Evaluate on dataset and score for:
   - structure compliance
   - citation quality
   - SQL safety
7. Tune prompts/retrieval params and repeat.

Outputs:

- `data/index.json`
- `data/eval/dataset.json`
- `data/eval/results.json`

### Iteration 2: Supervised Fine-Tuning (SFT)

Goal:

- Fine-tune a base model on YELO-specific high-quality examples.

Flow:

1. Build curated training dataset from real tasks:
   - architecture ownership
   - flow mapping
   - SQL generation + safe execution behavior
2. Create train/validation/test splits.
3. Fine-tune target model.
4. Re-run same eval suite used in Iteration 1.
5. Promote only if quality and safety improve.

Outputs:

- versioned SFT dataset
- fine-tuned checkpoint metadata
- before/after eval comparison

### Iteration 3: Preference Alignment (DPO/RLHF-Style)

Goal:

- Align model behavior to team preferences and decision style.

Flow:

1. Build preference pairs from real prompts:
   - preferred vs rejected answers
2. Train preference-aligned model.
3. Re-run full eval gate:
   - hallucination rate
   - citation correctness
   - SQL safety
   - regression checks
4. Release only if all gates pass thresholds.

Outputs:

- preference dataset
- aligned checkpoint metadata
- release gate report

## Exact Training Loop We Are Following

Current operational loop (Iteration 1):

1. Collect real user prompts from platform usage.
2. Add/normalize them into eval dataset categories.
3. Run eval.
4. Inspect failures and identify root cause:
   - retrieval miss
   - prompt policy weakness
   - intent/table/column behavior
5. Apply minimal targeted change.
6. Re-run eval and compare metrics.
7. Keep only improvements that pass safety and citation checks.

This ensures improvements are measurable and portable across providers.
