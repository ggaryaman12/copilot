import fs from 'fs/promises';
import path from 'path';

const orderListMemoryPath = path.resolve(process.cwd(), 'data/memory/order-list-memory.json');

const DEFAULT_ORDER_LIST_MEMORY = {
  version: 1,
  updatedAt: null,
  confirmedMappings: [],
  approvedExamples: [],
  performanceHints: []
};

export async function loadOrderListMemory() {
  try {
    const raw = await fs.readFile(orderListMemoryPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ORDER_LIST_MEMORY,
      ...parsed,
      confirmedMappings: Array.isArray(parsed?.confirmedMappings) ? parsed.confirmedMappings : [],
      approvedExamples: Array.isArray(parsed?.approvedExamples) ? parsed.approvedExamples : [],
      performanceHints: Array.isArray(parsed?.performanceHints) ? parsed.performanceHints : []
    };
  } catch {
    return DEFAULT_ORDER_LIST_MEMORY;
  }
}

export function getOrderListMemoryPath() {
  return orderListMemoryPath;
}
