import fs from 'fs/promises';
import path from 'path';

const contextPath = path.resolve(process.cwd(), 'data/context/order-list-context.json');

export async function loadOrderListContext() {
  const raw = await fs.readFile(contextPath, 'utf8');
  return JSON.parse(raw);
}

export function getOrderListContextPath() {
  return contextPath;
}
