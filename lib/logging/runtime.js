import fs from 'fs/promises';
import path from 'path';

const runtimeLogPath = path.resolve(process.cwd(), 'data/runtime.log');

export async function writeRuntimeLog(level, message, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    meta
  };
  await fs.mkdir(path.dirname(runtimeLogPath), { recursive: true });
  await fs.appendFile(runtimeLogPath, JSON.stringify(entry) + '\n', 'utf8');
}

export async function readTailLines(filePath, limit = 150) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(-Math.max(1, Math.min(500, limit)));
  } catch {
    return [];
  }
}

export function getRuntimeLogPath() {
  return runtimeLogPath;
}

export async function clearLogFile(filePath) {
  try {
    await fs.writeFile(filePath, '', 'utf8');
  } catch {
    // ignore
  }
}
