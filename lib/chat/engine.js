import { searchKnowledge } from '@/lib/rag/search';
import { generateText } from '@/lib/llm/client';
import { SYSTEM_POLICY, buildUserPrompt } from '@/lib/prompting/policy';
import { inspectSchema, runSelectQuery } from '@/lib/db/mysql';
import { inferIntent } from '@/lib/agents/intent';
import { proposeTables } from '@/lib/agents/table';
import { pruneColumns } from '@/lib/agents/columnPrune';
import { buildClarifyingQuestions } from '@/lib/chat/clarify';
import { getMissingDbEnvKeys } from '@/lib/config/env';
import { loadSchemaMemory } from '@/lib/memory/schemaMemory';
import { planSqlQuery } from '@/lib/agents/sqlPlanner';

function now() {
  return Date.now();
}

function pushTrace(trace, stage, start, status = 'ok', meta = {}) {
  trace.push({
    stage,
    status,
    durationMs: now() - start,
    ...meta
  });
}

function extractSqlCandidate(raw = '') {
  const text = String(raw || '').trim();
  if (!text) return '';
  const fenced = text.match(/```sql\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstSelect = text.match(/(select[\s\S]*?)(?:;|\n\n|$)/i);
  if (firstSelect?.[1]) return firstSelect[1].trim();
  const firstExplain = text.match(/(explain[\s\S]*?)(?:;|\n\n|$)/i);
  if (firstExplain?.[1]) return firstExplain[1].trim();
  return '';
}

function extractSqlTables(sql = '') {
  const out = new Set();
  const re = /\b(?:from|join)\s+`?([a-zA-Z0-9_]+)`?/gi;
  let m;
  while ((m = re.exec(sql)) != null) {
    out.add(String(m[1] || '').toLowerCase());
  }
  return Array.from(out);
}

function extractExplicitTable(prompt = '') {
  const m = String(prompt || '').match(/\b(tb_[a-zA-Z0-9_]+)\b/);
  return m?.[1] || null;
}

function parseDayMonthToken(dayToken, monthToken, year) {
  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };
  const d = Number.parseInt(String(dayToken || '').trim(), 10);
  const m = months[String(monthToken || '').toLowerCase().trim()];
  if (!d || !m) return null;
  return new Date(Date.UTC(year, m - 1, d));
}

function formatUtcDate(d) {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${d.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildFallbackSqlForForcedTable(prompt = '', tableName = '') {
  const q = String(prompt || '').toLowerCase();
  const userMatch = q.match(/marketplace user id\s*([0-9]+)/i) || q.match(/user id\s*([0-9]+)/i);
  const userId = userMatch?.[1] || null;
  const where = [];
  if (userId) {
    where.push(`marketplace_user_id = ${Number.parseInt(userId, 10)}`);
  }
  if (q.includes('today')) {
    where.push('DATE(creation_datetime) = CURDATE()');
  }
  const range = q.match(/from\s+([0-9]{1,2})\s+([a-z]{3,9})\s+to\s+([0-9]{1,2})\s+([a-z]{3,9})/i);
  if (range) {
    const currentYear = new Date().getFullYear();
    const start = parseDayMonthToken(range[1], range[2], currentYear);
    const end = parseDayMonthToken(range[3], range[4], currentYear);
    if (start && end) {
      const endPlusOne = new Date(end.getTime() + (24 * 60 * 60 * 1000));
      where.push(`creation_datetime >= '${formatUtcDate(start)} 00:00:00'`);
      where.push(`creation_datetime < '${formatUtcDate(endPlusOne)} 00:00:00'`);
    }
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const orderSql = where.length ? ' ORDER BY creation_datetime DESC' : '';
  return `SELECT * FROM ${tableName}${whereSql}${orderSql} LIMIT 200`;
}

function buildSqlModeAnswer(sqlContext) {
  if (!sqlContext) return 'SQL Copilot run completed.';

  if (sqlContext.type === 'db_setup_required') {
    return [
      '## VERIFIED',
      'DB configuration is incomplete for SQL execution.',
      '',
      '## INFERRED',
      `Missing env keys: ${(sqlContext.missingEnv || []).join(', ')}`,
      '',
      '## UNKNOWN',
      'Cannot inspect schema or run SQL until DB env is configured.'
    ].join('\n');
  }

  if (sqlContext.type === 'query_result') {
    return [
      '## VERIFIED',
      `Executed SQL successfully. Rows returned: ${sqlContext.rowCount}.`,
      '',
      '```sql',
      sqlContext.sql || '',
      '```',
      '',
      '## INFERRED',
      'Result preview is included in SQL_EXECUTION block.',
      '',
      '## UNKNOWN',
      'Business meaning of rows still depends on table ownership confirmation.'
    ].join('\n');
  }

  if (sqlContext.type === 'needs_table_input') {
    return [
      '## VERIFIED',
      sqlContext.message || 'I need one exact table name before execution.',
      '',
      '## INFERRED',
      `Suggested tables: ${(sqlContext.suggestedTables || []).join(', ') || 'none'}`,
      '',
      '## UNKNOWN',
      'Cannot safely execute until table/column mapping is confirmed.'
    ].join('\n');
  }

  if (sqlContext.type === 'query_error') {
    return [
      '## VERIFIED',
      `SQL execution failed: ${sqlContext.error || 'unknown error'}`,
      '',
      '```sql',
      sqlContext.sql || '',
      '```',
      '',
      '## INFERRED',
      `Candidate tables: ${(sqlContext.suggestedTables || []).join(', ') || 'none'}`,
      '',
      '## UNKNOWN',
      'Need exact table/column confirmation to generate a corrected query.'
    ].join('\n');
  }

  return 'SQL Copilot run completed.';
}

async function generateSqlFromQuestion({ prompt, tablePlan, columnPlan, llmRuntime }) {
  const tables = tablePlan?.recommendedTables || [];
  const pruned = columnPlan || {};
  const generationPrompt = `Generate one safe MySQL SELECT query only.
Question: ${prompt}
Candidate tables: ${tables.join(', ')}
Candidate columns (JSON): ${JSON.stringify(pruned)}
Rules: 
- output only SQL
- SELECT only
- include LIMIT 200
- avoid markdown.`;
  const raw = await generateText(generationPrompt, 'You generate safe SQL only.', llmRuntime);
  return extractSqlCandidate(raw);
}

export async function runAgent({ mode, prompt, sql, selectedTables = [], tableAck = false, llmRuntime }) {
  const trace = [];
  const normalizedMode = (mode || 'architecture').toLowerCase();
  const intentStart = now();
  const intent = inferIntent({ mode: normalizedMode, prompt });
  pushTrace(trace, 'intent', intentStart, 'ok', { domains: intent.domains });

  const retrievalStart = now();
  const contexts = await searchKnowledge(prompt, normalizedMode, undefined, intent.domains, llmRuntime);
  pushTrace(trace, 'retrieval', retrievalStart, 'ok', { contextCount: contexts.length });

  let sqlContext = null;
  let tablePlan = null;
  let columnPlan = null;
  if (normalizedMode === 'sql') {
    const missingDb = getMissingDbEnvKeys();
    if (missingDb.length) {
      sqlContext = {
        type: 'db_setup_required',
        missingEnv: missingDb,
        guidance: 'Set DB_* env vars in .env.local and restart dev server.'
      };
      pushTrace(trace, 'db_setup_check', now(), 'blocked', { missingDb });
    } else {
      const memory = await loadSchemaMemory();
      const schemaStart = now();
      const schema = await inspectSchema();
      pushTrace(trace, 'schema_inspection', schemaStart, 'ok', { tables: schema.tables.length });

      const tableStart = now();
      tablePlan = proposeTables({ prompt, schema, selectedTables });
      if ((!tablePlan?.recommendedTables || tablePlan.recommendedTables.length === 0) && memory?.codeHints?.length) {
        tablePlan = {
          recommendedTables: memory.codeHints.map((h) => h.table).slice(0, 8),
          finalTables: memory.codeHints.map((h) => h.table).slice(0, 8),
          source: 'memory-fallback'
        };
      }
      pushTrace(trace, 'table_agent', tableStart, 'ok', { proposed: tablePlan.recommendedTables?.length || 0 });

      const forcedTable =
        selectedTables.find((x) => String(x || '').trim()) ||
        extractExplicitTable(prompt) ||
        null;
      const plannerStart = now();
      const planner = planSqlQuery({ question: prompt, schema, forcedTable, rowLimit: 200 });
      pushTrace(trace, 'sql_planner', plannerStart, planner.ready ? 'ok' : 'blocked', {
        chosenTable: planner.chosenTable || null,
        reason: planner.reason || null
      });

      const plannerTables = planner.candidates?.length
        ? planner.candidates
        : (tablePlan?.recommendedTables || []);
      tablePlan = {
        recommendedTables: plannerTables,
        finalTables: planner.chosenTable ? [planner.chosenTable] : plannerTables,
        source: forcedTable ? 'user-selected' : 'planner'
      };

      const pruneStart = now();
      columnPlan = pruneColumns({ prompt, schema, tables: tablePlan.finalTables || [] });
      pushTrace(trace, 'column_prune', pruneStart, 'ok', { tables: (tablePlan.finalTables || []).length });

      let finalSql = String(sql || '').trim();
      if (!finalSql) {
        if (planner.ready && planner.sql) {
          finalSql = planner.sql;
        } else if (forcedTable) {
          finalSql = buildFallbackSqlForForcedTable(prompt, forcedTable);
        } else {
          const sqlGenStart = now();
          finalSql = await generateSqlFromQuestion({ prompt, tablePlan, columnPlan, llmRuntime });
          pushTrace(trace, 'sql_generation', sqlGenStart, finalSql ? 'ok' : 'blocked', { hasSql: Boolean(finalSql) });
        }
      }

      if (finalSql) {
      const schemaTables = new Set(schema.tables.map((t) => String(t.table_name || '').toLowerCase()));
      const sqlTables = extractSqlTables(finalSql);
      const skipTableVerification = schemaTables.size === 0;
      const unknownTables = skipTableVerification ? [] : sqlTables.filter((t) => !schemaTables.has(t));
      const userConfirmedTable = Boolean(tableAck && (forcedTable || (selectedTables || []).length));
      if (unknownTables.length && !userConfirmedTable) {
        sqlContext = {
          type: 'needs_table_input',
          generatedSql: finalSql,
          unknownTables,
          message: `I could not verify table(s): ${unknownTables.join(', ')}. Please provide the exact table for this query.`,
          suggestedTables: tablePlan?.recommendedTables || [],
          plannerReason: planner.reason || null,
          tableAck,
          tablePlan,
          columnPlan
        };
        pushTrace(trace, 'table_verify', now(), 'blocked', { unknownTables });
      } else if (!planner.ready && !sql && !forcedTable) {
        sqlContext = {
          type: 'needs_table_input',
          generatedSql: finalSql,
          unknownTables: [],
          message: planner.reason || 'I need one exact table name before executing this query.',
          suggestedTables: tablePlan?.recommendedTables || [],
          plannerReason: planner.reason || null,
          tableAck,
          tablePlan,
          columnPlan
        };
        pushTrace(trace, 'table_verify', now(), 'blocked', { reason: planner.reason || 'planner not ready' });
      } else {
      const queryStart = now();
      try {
        const queryResult = await runSelectQuery(finalSql);
        pushTrace(trace, 'sql_execute', queryStart, 'ok', { rows: Array.isArray(queryResult.rows) ? queryResult.rows.length : 0 });
        sqlContext = {
          type: 'query_result',
          sql: queryResult.sql,
          rowCount: Array.isArray(queryResult.rows) ? queryResult.rows.length : 0,
          preview: Array.isArray(queryResult.rows) ? queryResult.rows.slice(0, 20) : queryResult.rows,
          generatedSql: finalSql,
          plannerReason: planner.reason || null,
          tableAck,
          tablePlan,
          columnPlan
        };
      } catch (error) {
        pushTrace(trace, 'sql_execute', queryStart, 'failed', { message: error?.message || 'query failed' });
        sqlContext = {
          type: 'query_error',
          sql: finalSql,
          error: error?.message || 'Query failed',
          suggestedTables: tablePlan?.recommendedTables || [],
          plannerReason: planner.reason || null,
          tableAck,
          tablePlan,
          columnPlan
        };
      }
      }
    } else {
      sqlContext = {
          type: 'schema_snapshot',
          tables: schema.tables.slice(0, 200),
          columns: schema.columns.slice(0, 800),
          indexes: schema.indexes.slice(0, 800),
          fks: schema.fks.slice(0, 500),
          generatedSql: '',
          tableAck,
          tablePlan,
          columnPlan
        };
      }
    }
  }

  const userPrompt = buildUserPrompt({
    mode: normalizedMode,
    question: prompt,
    contexts,
    sqlContext,
    intent
  });

  const generationStart = now();
  let answer;
  if (normalizedMode === 'sql' && sqlContext && ['db_setup_required', 'query_result', 'needs_table_input', 'query_error'].includes(sqlContext.type)) {
    answer = buildSqlModeAnswer(sqlContext);
  } else {
    answer = await generateText(userPrompt, SYSTEM_POLICY, llmRuntime);
  }
  if (normalizedMode === 'sql' && sqlContext?.type === 'query_result') {
    const executionBlock = `\n\nSQL_EXECUTION\nSQL: ${sqlContext.sql}\nRows: ${sqlContext.rowCount}\nPreview:\n${JSON.stringify(sqlContext.preview, null, 2)}`;
    answer += executionBlock;
  } else if (normalizedMode === 'sql' && sqlContext?.type === 'needs_table_input') {
    answer += `\n\nTABLE_INPUT_REQUIRED\n${sqlContext.message}\nSuggested tables: ${(sqlContext.suggestedTables || []).join(', ')}\nDraft SQL: ${sqlContext.generatedSql || 'not generated yet'}`;
  } else if (normalizedMode === 'sql' && sqlContext?.type === 'query_error') {
    answer += `\n\nSQL_EXECUTION_ERROR\n${sqlContext.error}\nTry one of these tables: ${(sqlContext.suggestedTables || []).join(', ')}`;
  }
  pushTrace(trace, 'generation', generationStart, 'ok', { answerChars: answer.length });

  const clarifyingQuestions = buildClarifyingQuestions({
    mode: normalizedMode,
    prompt,
    intent,
    contexts,
    tablePlan,
    tableAck,
    sqlContext
  });

  return { answer, contexts, sqlContext, intent, tablePlan, columnPlan, trace, clarifyingQuestions };
}
