import { loadIndex } from '@/lib/rag/indexStore';
import { tokenize } from '@/lib/rag/tokenize';
import { embedText } from '@/lib/llm/client';
import { isInScope } from '@/lib/rag/scope';
import { env } from '@/lib/config/env';

function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function lexicalScore(queryTokens, chunkTokens) {
  if (!queryTokens.length || !chunkTokens.length) return 0;
  const set = new Set(chunkTokens);
  let score = 0;
  for (const token of queryTokens) {
    if (set.has(token)) score += 1;
  }
  return score / queryTokens.length;
}

function matchesRepoFilter(chunkPath, repoFilter = []) {
  if (!repoFilter.length) return true;
  return repoFilter.some((repoName) => chunkPath.includes(`/${repoName}/`));
}

export async function searchKnowledge(query, mode = 'architecture', topK = env.ragTopK, repoFilter = [], llmRuntime) {
  const index = await loadIndex();
  const queryTokens = tokenize(query);
  let queryEmbedding = [];
  try {
    queryEmbedding = await embedText(`${mode}: ${query}`, llmRuntime);
  } catch {
    queryEmbedding = [];
  }

  const scored = index.chunks
    .filter((chunk) => isInScope(chunk.path) && matchesRepoFilter(chunk.path, repoFilter))
    .map((chunk) => {
      const lex = lexicalScore(queryTokens, chunk.tokens || []);
      const sem = cosine(queryEmbedding, chunk.embedding || []);
      const score = queryEmbedding.length ? (lex * 0.55 + sem * 0.45) : lex;
      return { chunk, score, lex, sem };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ chunk, score, lex, sem }) => ({
    id: chunk.id,
    path: chunk.path,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    text: chunk.text,
    score,
    lexical: lex,
    semantic: sem,
    anchor: `${chunk.path}:${chunk.startLine}`
  }));
}
