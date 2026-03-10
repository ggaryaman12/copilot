import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const auditPath = path.resolve(process.cwd(), 'data/audit.log');

export async function writeAuditLog(entry) {
  const enriched = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...entry
  };
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  await fs.appendFile(auditPath, JSON.stringify(enriched) + '\n', 'utf8');
  return enriched.id;
}

export function hashText(value = '') {
  return crypto.createHash('sha256').update(value).digest('hex');
}
