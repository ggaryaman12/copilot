import { generateText } from '@/lib/llm/client';

const MONTH_MAP = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

function pad(n) {
  return String(n).padStart(2, '0');
}

function startOfDay(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 00:00:00`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function extractJson(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeText(prompt = '') {
  return String(prompt || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumericAmount(normalized) {
  const patterns = [
    { regex: /(?:amount|order amount).{0,20}greater than\s+(\d+)/i, operator: 'gt' },
    { regex: /(?:amount|order amount).{0,20}greater then\s+(\d+)/i, operator: 'gt' },
    { regex: /(?:amount|order amount).{0,20}more than\s+(\d+)/i, operator: 'gt' },
    { regex: /(?:amount|order amount).{0,20}above\s+(\d+)/i, operator: 'gt' },
    { regex: /(?:amount|order amount).{0,20}over\s+(\d+)/i, operator: 'gt' },
    { regex: /(?:amount|order amount).{0,20}less than\s+(\d+)/i, operator: 'lt' },
    { regex: /(?:amount|order amount).{0,20}below\s+(\d+)/i, operator: 'lt' },
    { regex: /(?:amount|order amount).{0,20}(?:equal to|equals?)\s+(\d+)/i, operator: 'eq' },
    { regex: /(?:amount|order amount).{0,20}between\s+(\d+)\s+and\s+(\d+)/i, operator: 'between' }
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    if (pattern.operator === 'between') {
      return {
        field: 'total_amount',
        operator: 'between',
        value: [Number(match[1]), Number(match[2])]
      };
    }
    return {
      field: 'total_amount',
      operator: pattern.operator,
      value: Number(match[1])
    };
  }
  return null;
}

function parseExplicitIds(normalized) {
  const filters = [];
  const customer = normalized.match(/customer id\s+(\d+)/i);
  const job = normalized.match(/job id\s+(\d+)/i);
  const order = normalized.match(/order id\s+(\d+)/i);
  const marketplace = normalized.match(/marketplace user id\s+(\d+)/i);

  if (customer) filters.push({ field: 'customer_id', operator: 'eq', value: Number(customer[1]) });
  if (job) filters.push({ field: 'job_id', operator: 'eq', value: Number(job[1]) });
  if (order) filters.push({ field: 'order_id', operator: 'eq', value: Number(order[1]) });
  if (marketplace) filters.push({ field: 'marketplace_user_id', operator: 'eq', value: Number(marketplace[1]) });

  return filters;
}

function parseStoreFilter(normalized) {
  const startsWith =
    normalized.match(/(?:store|merchant)(?: name)? starts with ["']?([^"']+)["']?/i) ||
    normalized.match(/(?:store|merchant)(?: name)? start with ["']?([^"']+)["']?/i);
  if (startsWith) {
    return { field: 'store_name', operator: 'starts_with', value: startsWith[1].trim() };
  }

  const contains =
    normalized.match(/from store ["']?([^"']+)["']?/i) ||
    normalized.match(/from merchant ["']?([^"']+)["']?/i) ||
    normalized.match(/store ["']([^"']+)["']/i);
  if (contains) {
    return { field: 'store_name', operator: 'contains', value: contains[1].trim() };
  }

  return null;
}

function parseStatusFilter(normalized, statusMap) {
  for (const [label, value] of Object.entries(statusMap || {})) {
    const regex = new RegExp(`\\b${label.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(normalized)) {
      return { field: 'job_status', operator: 'eq', value };
    }
  }
  return null;
}

function parseDateRange(normalized, now = new Date()) {
  const fromTo = normalized.match(/from\s+(\d{1,2})\s+([a-z]+)\s+to\s+(\d{1,2})\s+([a-z]+)/i);
  if (fromTo) {
    const [, d1, m1, d2, m2] = fromTo;
    const month1 = MONTH_MAP[m1.toLowerCase()];
    const month2 = MONTH_MAP[m2.toLowerCase()];
    if (month1 && month2) {
      const year = now.getFullYear();
      const start = new Date(year, month1 - 1, Number(d1));
      const endExclusive = new Date(year, month2 - 1, Number(d2) + 1);
      return {
        field: 'creation_datetime',
        operator: 'between',
        value: [startOfDay(start), startOfDay(endExclusive)],
        label: `${d1} ${m1} to ${d2} ${m2}`
      };
    }
  }

  if (/\btoday\b/i.test(normalized)) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return {
      field: 'creation_datetime',
      operator: 'between',
      value: [startOfDay(start), startOfDay(addDays(start, 1))],
      label: 'today'
    };
  }

  if (/\byesterday\b/i.test(normalized)) {
    const start = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), -1);
    return {
      field: 'creation_datetime',
      operator: 'between',
      value: [startOfDay(start), startOfDay(addDays(start, 1))],
      label: 'yesterday'
    };
  }

  if (/\bthis month\b/i.test(normalized)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return {
      field: 'creation_datetime',
      operator: 'between',
      value: [startOfDay(start), startOfDay(end)],
      label: 'this month'
    };
  }

  if (/\bthis week\b/i.test(normalized)) {
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = current.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const start = addDays(current, offset);
    return {
      field: 'creation_datetime',
      operator: 'between',
      value: [startOfDay(start), startOfDay(addDays(start, 7))],
      label: 'this week'
    };
  }

  return null;
}

export function parseDeterministicOrderPrompt(prompt, context, now = new Date()) {
  const normalized = normalizeText(prompt);
  const filters = [];

  const amount = parseNumericAmount(normalized);
  if (amount) filters.push(amount);

  filters.push(...parseExplicitIds(normalized));

  const store = parseStoreFilter(normalized);
  if (store) filters.push(store);

  const status = parseStatusFilter(normalized, context.statusMap);
  if (status) filters.push(status);

  const date = parseDateRange(normalized, now);
  if (date) filters.push(date);

  return {
    entity: 'orders',
    filters,
    unsupported: (context.unsupportedKeywords || []).find((keyword) => normalized.includes(keyword)) || ''
  };
}

function validatePlan(plan, context) {
  const allowedFields = new Set(context.allowedFilters || []);
  const allowedOperators = new Set(context.allowedOperators || []);
  if (!plan || plan.entity !== 'orders' || !Array.isArray(plan.filters)) {
    return null;
  }

  const numericFields = new Set([
    'customer_id',
    'job_id',
    'order_id',
    'marketplace_user_id',
    'total_amount',
    'job_status'
  ]);

  const filters = plan.filters
    .filter((item) => item && allowedFields.has(item.field) && allowedOperators.has(item.operator))
    .map((item) => ({
      field: item.field,
      operator: item.operator,
      value:
        item.field === 'creation_datetime' && Array.isArray(item.value)
          ? item.value
          : item.field === 'store_name'
            ? String(item.value || '').trim()
            : item.operator === 'between' && Array.isArray(item.value) && numericFields.has(item.field)
              ? item.value.map((value) => Number(value))
              : numericFields.has(item.field)
                ? Number(item.value)
                : item.value
    }));

  return {
    entity: 'orders',
    filters
  };
}

function mergePlans(primary, fallback) {
  const merged = [];
  const seen = new Set();
  for (const source of [primary?.filters || [], fallback?.filters || []]) {
    for (const filter of source) {
      const key = `${filter.field}:${filter.operator}:${JSON.stringify(filter.value)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(filter);
    }
  }
  return { entity: 'orders', filters: merged };
}

export async function planOrderListPrompt({ prompt, context, llmRuntime, now = new Date() }) {
  const deterministic = parseDeterministicOrderPrompt(prompt, context, now);
  if (deterministic.unsupported) {
    return {
      ok: false,
      reason: `Unsupported Phase 1 prompt. '${deterministic.unsupported}' is outside order-list AI scope.`
    };
  }

  let llmPlan = null;
  try {
    const examples = (context.examples || [])
      .map((item) => `PROMPT: ${item.prompt}\nJSON: ${JSON.stringify(item.plan)}`)
      .join('\n\n');
    const system = [
      'You convert dashboard order-list requests into strict JSON only.',
      'Return one JSON object with shape {"entity":"orders","filters":[{"field":"","operator":"","value":""}]}',
      'Allowed fields only: customer_id, job_id, order_id, marketplace_user_id, total_amount, creation_datetime, job_status, store_name',
      'Allowed operators only: eq, gt, gte, lt, lte, between, starts_with, contains',
      'Never return SQL.',
      'If the prompt is unsupported, return {"entity":"orders","filters":[],"unsupported":true}.'
    ].join(' ');
    const userPrompt = [
      `CONTEXT: ${JSON.stringify({
        allowedFilters: context.allowedFilters,
        allowedOperators: context.allowedOperators,
        statusMap: context.statusMap
      })}`,
      `EXAMPLES:\n${examples}`,
      `PROMPT: ${prompt}`
    ].join('\n\n');
    const raw = await generateText(userPrompt, system, llmRuntime);
    llmPlan = validatePlan(extractJson(raw), context);
  } catch {
    llmPlan = null;
  }

  const merged = mergePlans(llmPlan, deterministic);
  if (!merged.filters.length) {
    return {
      ok: false,
      reason: 'Unsupported Phase 1 prompt. Use customer id, order/job id, marketplace user id, amount, date range, status, or store name filters.'
    };
  }

  return {
    ok: true,
    plan: merged
  };
}
