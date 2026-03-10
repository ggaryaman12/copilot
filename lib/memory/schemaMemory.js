import fs from 'fs/promises';
import path from 'path';

const memoryPath = path.resolve(process.cwd(), 'data/memory/schema-memory.json');
const yeloServerRoot = '/Users/aryamangupta/YELO/yelo-server';

const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage']);
const CODE_EXT = new Set(['.js', '.ts', '.jsx', '.tsx', '.sql', '.json']);

async function walk(dir, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      await walk(full, out);
      continue;
    }
    const ext = path.extname(e.name).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    out.push(full);
  }
  return out;
}

function extractTableHintsFromText(text = '') {
  const matches = text.match(/\btb_[a-z0-9_]+\b/gi) || [];
  return matches.map((m) => m.toLowerCase());
}

export async function extractCodeTableHints() {
  try {
    const files = await walk(yeloServerRoot);
    const counts = new Map();
    for (const file of files) {
      try {
        const raw = await fs.readFile(file, 'utf8');
        for (const t of extractTableHintsFromText(raw)) {
          counts.set(t, (counts.get(t) || 0) + 1);
        }
      } catch {
        // ignore unreadable files
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([table, count]) => ({ table, count }))
      .slice(0, 120);
  } catch {
    return [];
  }
}

export async function loadSchemaMemory() {
  try {
    const raw = await fs.readFile(memoryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSchemaMemory(payload) {
  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(memoryPath, JSON.stringify(payload, null, 2), 'utf8');
}

export function getSchemaMemoryPath() {
  return memoryPath;
}
