# Training and Eval Guide (v1)

This v1 uses prompt + retrieval tuning only (no fine-tuning/LoRA).

## 1. Build Retrieval Index

```bash
cd /Users/aryamangupta/YELO/yelo-copilot-platform
npm run index:build
```

Output:

- `data/index.json`

## 2. Maintain Eval Dataset

Update:

- `data/eval/dataset.json`

Question categories:

- endpoint ownership in `yelo-server`
- dashboard -> server flow mapping
- marketplace -> server flow mapping
- table/query usage (`SELECT`-safe)

## 3. Run Eval

Start app, then run:

```bash
npm run eval:run
```

Output:

- `data/eval/results.json`

## 4. What to Tune

- `RAG_TOP_K`
- `RAG_CHUNK_LINES`
- `RAG_CHUNK_OVERLAP`
- system prompt constraints in `lib/prompting/policy.js`

## 5. Acceptance Targets (suggested)

- citation correctness: >= 0.9
- structure compliance (`VERIFIED/INFERRED/UNKNOWN`): >= 0.95
- SQL safety compliance in SQL mode: 1.0

If results regress below target, do not release prompt/retrieval change.
