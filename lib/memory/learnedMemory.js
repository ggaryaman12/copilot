import fs from 'fs/promises';
import path from 'path';

const learnedMemoryPath = path.resolve(process.cwd(), 'data/memory/learned-memory.json');

const DEFAULT_MEMORY = {
  version: 1,
  updatedAt: null,
  facts: []
};

export async function loadLearnedMemory() {
  try {
    const raw = await fs.readFile(learnedMemoryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_MEMORY,
      ...parsed,
      facts: Array.isArray(parsed?.facts) ? parsed.facts : []
    };
  } catch {
    return DEFAULT_MEMORY;
  }
}

export async function saveLearnedMemory(payload) {
  await fs.mkdir(path.dirname(learnedMemoryPath), { recursive: true });
  const next = {
    ...DEFAULT_MEMORY,
    ...payload,
    updatedAt: new Date().toISOString(),
    facts: Array.isArray(payload?.facts) ? payload.facts : []
  };
  await fs.writeFile(learnedMemoryPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function upsertLearnedFact(fact) {
  const memory = await loadLearnedMemory();
  const nextFacts = [...memory.facts];
  const key = String(fact?.key || '').trim();
  if (!key) {
    throw new Error('Fact key is required.');
  }

  const idx = nextFacts.findIndex((item) => item.key === key);
  const payload = {
    ...fact,
    key,
    updatedAt: new Date().toISOString()
  };

  if (idx >= 0) {
    nextFacts[idx] = {
      ...nextFacts[idx],
      ...payload,
      aliases: Array.from(new Set([...(nextFacts[idx].aliases || []), ...(payload.aliases || [])]))
    };
  } else {
    nextFacts.push(payload);
  }

  return saveLearnedMemory({
    ...memory,
    facts: nextFacts
  });
}

export function getLearnedMemoryPath() {
  return learnedMemoryPath;
}

export function findLearnedFacts(memory, prompt = '') {
  const normalized = String(prompt || '').toLowerCase();
  const facts = Array.isArray(memory?.facts) ? memory.facts : [];
  return facts.filter((fact) => {
    const aliases = Array.isArray(fact.aliases) ? fact.aliases : [];
    return aliases.some((alias) => normalized.includes(String(alias).toLowerCase()));
  });
}
