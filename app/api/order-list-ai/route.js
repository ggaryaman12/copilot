import { NextResponse } from 'next/server';
import { assertApiKey } from '@/lib/auth/guard';
import { resolveLLMRuntime } from '@/lib/llm/runtime';
import { writeRuntimeLog } from '@/lib/logging/runtime';
import { loadOrderListContext } from '@/lib/order-list/context';
import { planOrderListPrompt } from '@/lib/order-list/planner';
import { buildOrderListQuery, renderDebugSql, summarizeAppliedFilters } from '@/lib/order-list/query';
import { runSelectQueryWithValues } from '@/lib/db/mysql';
import { buildCorsHeaders } from '@/lib/http/cors';

function badRequest(message, request, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status, headers: buildCorsHeaders(request) });
}

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: buildCorsHeaders(request) });
}

export async function POST(request) {
  if (!assertApiKey(request)) {
    return badRequest('Unauthorized', request, 401);
  }

  try {
    const body = await request.json();
    const prompt = String(body.prompt || '').trim();
    const page = String(body.page || '').trim();
    const marketplaceUserId = body.marketplaceUserId;
    const userRole = body.userRole;
    const first = body.first;
    const rows = body.rows;

    if (!prompt) return badRequest('prompt is required', request);
    if (page !== 'dashboard-order-list') return badRequest('Unsupported page context.', request);
    if (!marketplaceUserId) return badRequest('marketplaceUserId is required.', request);
    if (String(userRole) !== '2' && String(userRole) !== '8') {
      return badRequest('Order-list AI is enabled only for admins and managers in Phase 1.', request, 403);
    }

    const llmRuntime = resolveLLMRuntime({ request, body });
    const context = await loadOrderListContext();
    const planned = await planOrderListPrompt({ prompt, context, llmRuntime });

    if (!planned.ok) {
      return NextResponse.json(
        {
          ok: false,
          unsupportedReason: planned.reason,
          summary: planned.reason,
          appliedFilters: {},
          sqlPreview: '',
          rows: [],
          rowCount: 0
        },
        { status: 200, headers: buildCorsHeaders(request) }
      );
    }

    const query = buildOrderListQuery({
      context,
      plan: planned.plan,
      requestScope: {
        marketplaceUserId,
        userRole
      },
      pagination: {
        first,
        rows
      }
    });

    const [result, countResult] = await Promise.all([
      runSelectQueryWithValues(query.sql, query.values),
      runSelectQueryWithValues(query.countSql, query.countValues)
    ]);
    const totalCount = Number(countResult?.rows?.[0]?.total_count || 0);
    return NextResponse.json(
      {
        ok: true,
        summary: summarizeAppliedFilters(planned.plan, context),
        appliedFilters: planned.plan,
        sqlPreview: result.sql,
        sqlValues: query.values,
        sqlDebug: renderDebugSql(result.sql, query.values),
        rows: result.rows,
        rowCount: Array.isArray(result.rows) ? result.rows.length : 0,
        totalCount,
        first: query.offset,
        rowsPerPage: query.limit
      },
      { headers: buildCorsHeaders(request) }
    );
  } catch (error) {
    await writeRuntimeLog('error', 'order_list_ai_failed', {
      message: error?.message || 'unknown error',
      stack: error?.stack || null
    });
    return badRequest(error.message, request, 500);
  }
}
