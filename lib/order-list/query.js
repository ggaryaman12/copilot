import { env } from '@/lib/config/env';

function escapeLikeValue(input) {
  return String(input).replace(/[%_]/g, '\\$&');
}

function escapeSqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildWhereClause(plan, requestScope) {
  const where = [];
  const values = [];

  if (!requestScope?.marketplaceUserId) {
    throw new Error('marketplaceUserId is required for order-list AI scope.');
  }

  where.push('j.marketplace_user_id = ?');
  values.push(Number(requestScope.marketplaceUserId));

  for (const filter of plan.filters) {
    switch (filter.field) {
      case 'customer_id':
        where.push('j.customer_id = ?');
        values.push(Number(filter.value));
        break;
      case 'job_id':
        where.push('j.job_id = ?');
        values.push(Number(filter.value));
        break;
      case 'order_id':
        where.push('j.order_id = ?');
        values.push(Number(filter.value));
        break;
      case 'marketplace_user_id':
        where.push('j.marketplace_user_id = ?');
        values.push(Number(filter.value));
        break;
      case 'job_status':
        where.push('j.job_status = ?');
        values.push(Number(filter.value));
        break;
      case 'total_amount':
        if (filter.operator === 'between') {
          where.push('IFNULL(tjpd.total_amount, 0) BETWEEN ? AND ?');
          values.push(Number(filter.value[0]), Number(filter.value[1]));
        } else {
          const map = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
          const operator = map[filter.operator];
          if (!operator) throw new Error(`Unsupported amount operator: ${filter.operator}`);
          where.push(`IFNULL(tjpd.total_amount, 0) ${operator} ?`);
          values.push(Number(filter.value));
        }
        break;
      case 'creation_datetime':
        if (filter.operator !== 'between' || !Array.isArray(filter.value) || filter.value.length !== 2) {
          throw new Error('creation_datetime supports only between for Phase 1.');
        }
        where.push('j.creation_datetime >= ?');
        where.push('j.creation_datetime < ?');
        values.push(filter.value[0], filter.value[1]);
        break;
      case 'store_name':
        if (filter.operator === 'starts_with') {
          where.push("tms.store_name LIKE ? ESCAPE '\\\\'");
          values.push(`${escapeLikeValue(filter.value)}%`);
        } else if (filter.operator === 'contains') {
          where.push("tms.store_name LIKE ? ESCAPE '\\\\'");
          values.push(`%${escapeLikeValue(filter.value)}%`);
        } else {
          throw new Error(`Unsupported store_name operator: ${filter.operator}`);
        }
        break;
      default:
        throw new Error(`Unsupported filter field: ${filter.field}`);
    }
  }

  return { where, values };
}

function sanitizePageSize(rows) {
  const allowed = [25, 50, 75];
  const parsed = Number(rows);
  return allowed.includes(parsed) ? parsed : 25;
}

function sanitizeOffset(first) {
  const parsed = Number(first);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function buildOrderListQuery({ context, plan, requestScope, pagination = {} }) {
  const { where, values } = buildWhereClause(plan, requestScope);
  const limit = Math.min(sanitizePageSize(pagination.rows), env.db.rowLimit, 200);
  const offset = sanitizeOffset(pagination.first);
  const baseFrom = [
    `SELECT ${context.selectColumns.join(', ')}`,
    `FROM ${context.tables.jobs} j`,
    `LEFT JOIN ${context.tables.payments} tjpd ON tjpd.job_id = j.job_id`,
    `LEFT JOIN ${context.tables.storefronts} tms ON tms.user_id = j.user_id`,
    `WHERE ${where.join(' AND ')}`
  ];

  const sql = [
    ...baseFrom,
    'ORDER BY j.creation_datetime DESC',
    `LIMIT ${limit} OFFSET ${offset}`
  ].join('\n');

  const countSql = [
    'SELECT COUNT(DISTINCT j.job_id) AS total_count',
    `FROM ${context.tables.jobs} j`,
    `LEFT JOIN ${context.tables.payments} tjpd ON tjpd.job_id = j.job_id`,
    `LEFT JOIN ${context.tables.storefronts} tms ON tms.user_id = j.user_id`,
    `WHERE ${where.join(' AND ')}`
  ].join('\n');

  return {
    sql,
    values,
    countSql,
    countValues: values,
    limit,
    offset
  };
}

export function renderDebugSql(sql, values = []) {
  let index = 0;
  return String(sql).replace(/\?/g, () => {
    const value = index < values.length ? values[index] : null;
    index += 1;
    return escapeSqlValue(value);
  });
}

export function summarizeAppliedFilters(plan, context) {
  const labels = [];
  const statusReverse = Object.entries(context.statusMap || {}).reduce((acc, [label, value]) => {
    if (!(value in acc)) acc[value] = label;
    return acc;
  }, {});

  for (const filter of plan.filters) {
    switch (filter.field) {
      case 'customer_id':
        labels.push(`customer id = ${filter.value}`);
        break;
      case 'job_id':
        labels.push(`job id = ${filter.value}`);
        break;
      case 'order_id':
        labels.push(`order id = ${filter.value}`);
        break;
      case 'marketplace_user_id':
        labels.push(`marketplace user id = ${filter.value}`);
        break;
      case 'job_status':
        labels.push(`status = ${statusReverse[filter.value] || filter.value}`);
        break;
      case 'total_amount':
        if (filter.operator === 'between') {
          labels.push(`amount between ${filter.value[0]} and ${filter.value[1]}`);
        } else {
          labels.push(`amount ${filter.operator} ${filter.value}`);
        }
        break;
      case 'creation_datetime':
        labels.push(`created between ${filter.value[0]} and ${filter.value[1]}`);
        break;
      case 'store_name':
        labels.push(`store ${filter.operator === 'starts_with' ? 'starts with' : 'contains'} "${filter.value}"`);
        break;
      default:
        break;
    }
  }

  return labels.length
    ? `Applied AI order filters: ${labels.join(', ')}.`
    : 'Applied AI order filters.';
}
