import fs from 'fs/promises';
import path from 'path';
import { loadOrderListMemory } from '@/lib/order-list/memory';

const contextPath = path.resolve(process.cwd(), 'data/context/order-list-context.json');

export async function loadOrderListContext() {
  const raw = await fs.readFile(contextPath, 'utf8');
  const context = JSON.parse(raw);
  const memory = await loadOrderListMemory();
  return {
    ...context,
    examples: [...(context.examples || []), ...(memory.approvedExamples || [])],
    learnedMemory: memory,
    performanceHints: [...(context.indexHints || []), ...(memory.performanceHints || [])]
  };
}

export function getOrderListContextPath() {
  return contextPath;
}
