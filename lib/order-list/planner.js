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

function findApprovedExample(prompt, context) {
  const normalized = normalizeText(prompt);
  const examples = Array.isArray(context?.examples) ? context.examples : [];
  const match = examples.find((item) => normalizeText(item?.prompt || '') === normalized);
  return match?.plan || null;
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
  const idPatterns = [
    { field: 'customer_id', regex: /customer id\s+(\d+(?:\s+or\s+\d+)*)/i },
    { field: 'job_id', regex: /job id\s+(\d+(?:\s+or\s+\d+)*)/i },
    { field: 'order_id', regex: /order id\s+(\d+(?:\s+or\s+\d+)*)/i },
    { field: 'marketplace_user_id', regex: /marketplace user id\s+(\d+(?:\s+or\s+\d+)*)/i }
  ];

  for (const pattern of idPatterns) {
    const match = normalized.match(pattern.regex);
    if (!match) continue;
    const values = match[1]
      .split(/\s+or\s+/i)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    if (!values.length) continue;
    filters.push({
      field: pattern.field,
      operator: values.length > 1 ? 'in' : 'eq',
      value: values.length > 1 ? values : values[0]
    });
  }

  return filters;
}

function parseCustomerContactFilter(normalized) {
  const email = normalized.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (email) {
    return { field: 'customer_email', operator: 'eq', value: email[0].trim().toLowerCase() };
  }

  const phone =
    normalized.match(/customer phone(?: number)?\s+([+\d][\d\s()-]{6,})/i) ||
    normalized.match(/phone(?: number)?\s+([+\d][\d\s()-]{6,})/i);
  if (phone) {
    return { field: 'customer_phone', operator: 'eq', value: phone[1].replace(/\s+/g, '').trim() };
  }

  return null;
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

function parseSourceFilter(normalized, deviceMap = {}) {
  const mentionsCreated =
    /\b(created|placed|made|generated)\s+(?:from|via|through|on)\b/i.test(normalized) ||
    /\bfrom\s+(?:web|android|ios|iphone|ipad|website|webapp)\b/i.test(normalized) ||
    /\b(?:web|android|ios|iphone|ipad|website|webapp)\s+orders\b/i.test(normalized);

  if (!mentionsCreated) {
    return null;
  }

  const aliases = [
    { key: 'android', regex: /\bandroid\b/i },
    { key: 'ios', regex: /\b(?:ios|iphone|ipad)\b/i },
    { key: 'web', regex: /\b(?:web|website|webapp)\b/i }
  ];

  const resolved = [];
  for (const alias of aliases) {
    if (!alias.regex.test(normalized)) continue;
    const values = deviceMap[alias.key] || [];
    resolved.push(...values);
  }

  const unique = Array.from(new Set(resolved.map((value) => Number(value)).filter((value) => Number.isFinite(value))));
  if (unique.length) {
    return { field: 'created_by', operator: 'in', value: unique };
  }

  return null;
}

function parseStatusFilter(normalized, statusMap) {
  const matches = [];
  for (const [label, value] of Object.entries(statusMap || {})) {
    const regex = new RegExp(`\\b${label.replace(/\s+/g, '\\s+')}\\b`, 'i');
    if (regex.test(normalized)) {
      matches.push(Number(value));
    }
  }
  const unique = Array.from(new Set(matches)).filter((value) => Number.isFinite(value));
  if (!unique.length) return null;
  return {
    field: 'job_status',
    operator: unique.length > 1 ? 'in' : 'eq',
    value: unique.length > 1 ? unique : unique[0]
  };
}

function parseDateRange(normalized, now = new Date()) {
  const after = normalized.match(/(?:created|ordered|orders?)\s+(?:after|since|from)\s+(\d{1,2})\s+([a-z]+)/i);
  if (after) {
    const [, day, monthText] = after;
    const month = MONTH_MAP[monthText.toLowerCase()];
    if (month) {
      const start = new Date(now.getFullYear(), month - 1, Number(day));
      return {
        field: 'creation_datetime',
        operator: 'gte',
        value: startOfDay(start),
        label: `after ${day} ${monthText}`
      };
    }
  }

  const before = normalized.match(/(?:created|ordered|orders?)\s+before\s+(\d{1,2})\s+([a-z]+)/i);
  if (before) {
    const [, day, monthText] = before;
    const month = MONTH_MAP[monthText.toLowerCase()];
    if (month) {
      const end = new Date(now.getFullYear(), month - 1, Number(day));
      return {
        field: 'creation_datetime',
        operator: 'lt',
        value: startOfDay(end),
        label: `before ${day} ${monthText}`
      };
    }
  }

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

  const customerContact = parseCustomerContactFilter(normalized);
  if (customerContact) filters.push(customerContact);

  const store = parseStoreFilter(normalized);
  if (store) filters.push(store);

  const source = parseSourceFilter(normalized, context.deviceMap);
  if (source) filters.push(source);

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
      'job_status',
      'created_by'
  ]);

  const filters = plan.filters
    .filter((item) => item && allowedFields.has(item.field) && allowedOperators.has(item.operator))
    .map((item) => {
      let value;
      if (item.field === 'creation_datetime' && Array.isArray(item.value)) {
        value = item.value;
      } else if (item.field === 'creation_datetime') {
        value = String(item.value || '').trim();
      } else if (item.field === 'created_by' && Array.isArray(item.value)) {
        value = item.value.map((entry) => Number(entry));
      } else if (item.field === 'store_name') {
        value = String(item.value || '').trim();
      } else if (item.operator === 'between' && Array.isArray(item.value) && numericFields.has(item.field)) {
        value = item.value.map((entry) => Number(entry));
      } else if (numericFields.has(item.field)) {
        value = Number(item.value);
      } else {
        value = item.value;
      }

      return {
        field: item.field,
        operator: item.operator,
        value
      };
    });

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
  const approvedPlan = validatePlan(findApprovedExample(prompt, context), context);
  if (approvedPlan?.filters?.length) {
    return {
      ok: true,
      plan: approvedPlan,
      source: 'approved-memory'
    };
  }

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
      'Allowed fields only: customer_id, job_id, order_id, marketplace_user_id, created_by, total_amount, creation_datetime, job_status, store_name',
      'Allowed fields also include customer_email and customer_phone for exact-match customer resolution before order query.',
      'Allowed operators only: eq, gt, gte, lt, lte, between, starts_with, contains, in',
      'Never return SQL.',
      'If the prompt is unsupported, return {"entity":"orders","filters":[],"unsupported":true}.'
    ].join(' ');
    const userPrompt = [
      `CONTEXT: ${JSON.stringify({
        allowedFilters: context.allowedFilters,
        allowedOperators: context.allowedOperators,
        statusMap: context.statusMap,
        deviceMap: context.deviceMap
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
      reason: 'Unsupported Phase 1 prompt. Use customer id, order/job id, marketplace user id, source/device, amount, date filters, status, or store name filters.'
    };
  }

  return {
    ok: true,
    plan: merged,
    source: llmPlan?.filters?.length ? 'deterministic+llm' : 'deterministic'
  };
}
