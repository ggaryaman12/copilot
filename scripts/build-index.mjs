import fs from 'fs/promises';
import path from 'path';

const root = process.cwd();
const env = {
  scopePaths: (process.env.REPO_SCOPE_PATHS || [
    '/Users/aryamangupta/YELO/yelo-server',
    '/Users/aryamangupta/YELO/yelo-dashboard-angular',
    '/Users/aryamangupta/YELO/yelo-marketplace-webapp'
  ].join(',')).split(',').map((v) => path.resolve(v.trim())).filter(Boolean),
  chunkLines: Number.parseInt(process.env.RAG_CHUNK_LINES || '120', 10),
  chunkOverlap: Number.parseInt(process.env.RAG_CHUNK_OVERLAP || '20', 10),
  maxChunkChars: Number.parseInt(process.env.RAG_MAX_CHUNK_CHARS || '2400', 10),
  maxFileBytes: Number.parseInt(process.env.RAG_MAX_FILE_BYTES || '350000', 10),
  maxFiles: Number.parseInt(process.env.RAG_MAX_FILES || '12000', 10),
  maxChunks: Number.parseInt(process.env.RAG_MAX_CHUNKS || '6000', 10),
  embedMaxChunks: Number.parseInt(process.env.RAG_EMBED_MAX_CHUNKS || '2500', 10),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  embedModel: process.env.OLLAMA_EMBED_MODEL || 'minimax-m2.5:cloud'
};

const outPath = path.resolve(root, 'data/index.json');
const ignoreDirNames = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);
const allowedExt = new Set(['.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.sql', '.yml', '.yaml', '.html', '.scss', '.css']);
const ignoredFileNames = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

function shouldSkipFileByName(fileName) {
  const lower = fileName.toLowerCase();
  if (ignoredFileNames.has(lower)) return true;
  if (lower.endsWith('.min.js')) return true;
  if (lower.endsWith('.bundle.js')) return true;
  if (lower.includes('.chunk.')) return true;
  return false;
}

function tokenize(text = '') {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  return Array.from(new Set(tokens)).slice(0, 180);
}

async function embedText(prompt) {
  try {
    const res = await fetch(`${env.ollamaBaseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.embedModel, prompt })
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.embedding || [];
  } catch {
    return [];
  }
}

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= env.maxFiles) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirNames.has(entry.name)) continue;
      await walk(full, out);
      continue;
    }
    if (shouldSkipFileByName(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!allowedExt.has(ext)) continue;
    const stat = await fs.stat(full);
    if (stat.size > env.maxFileBytes) continue;
    out.push(full);
  }
  return out;
}

function chunkByLines(filePath, content) {
  const lines = content.split(/\r?\n/);
  const chunks = [];
  const size = Math.max(30, env.chunkLines);
  const overlap = Math.max(0, Math.min(size - 1, env.chunkOverlap));

  let start = 0;
  while (start < lines.length) {
    const end = Math.min(lines.length, start + size);
    const text = lines.slice(start, end).join('\n').trim();
    if (text) {
      const compactText = text.slice(0, env.maxChunkChars);
      chunks.push({
        path: filePath,
        startLine: start + 1,
        endLine: end,
        text: compactText,
        tokens: tokenize(compactText)
      });
    }
    if (end === lines.length) break;
    start = end - overlap;
  }

  return chunks;
}

async function main() {
  const allFiles = [];
  for (const scopePath of env.scopePaths) {
    const files = await walk(scopePath);
    allFiles.push(...files);
    if (allFiles.length >= env.maxFiles) break;
  }
  const filesToProcess = allFiles.slice(0, env.maxFiles);

  const chunks = [];
  let idCounter = 1;
  let skippedReadErrors = 0;

  for (const filePath of filesToProcess) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const fileChunks = chunkByLines(filePath, content);
      for (const chunk of fileChunks) {
        const embedding = idCounter <= env.embedMaxChunks ? await embedText(chunk.text) : [];
        chunks.push({ id: idCounter++, ...chunk, embedding });
        if (chunks.length >= env.maxChunks) break;
      }
      if (chunks.length >= env.maxChunks) break;
    } catch {
      skippedReadErrors += 1;
    }
  }

  const indexData = {
    createdAt: new Date().toISOString(),
    scopePaths: env.scopePaths,
    limits: {
      maxChunkChars: env.maxChunkChars,
      maxFileBytes: env.maxFileBytes,
      maxFiles: env.maxFiles,
      maxChunks: env.maxChunks,
      embedMaxChunks: env.embedMaxChunks
    },
    skippedReadErrors,
    filesIndexed: filesToProcess.length,
    chunksIndexed: chunks.length,
    chunks
  };

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`Index written: ${outPath}`);
  console.log(`Files: ${filesToProcess.length}, Chunks: ${chunks.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
