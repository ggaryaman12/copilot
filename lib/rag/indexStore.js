import fs from 'fs/promises';
import path from 'path';

const indexPath = path.resolve(process.cwd(), 'data/index.json');

let cache;

export async function loadIndex() {
  if (cache) return cache;
  const raw = await fs.readFile(indexPath, 'utf8');
  cache = JSON.parse(raw);
  return cache;
}

export async function saveIndex(indexData) {
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2), 'utf8');
  cache = indexData;
}

export function clearIndexCache() {
  cache = undefined;
}
