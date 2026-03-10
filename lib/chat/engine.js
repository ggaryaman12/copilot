import { searchKnowledge } from '@/lib/rag/search';
import { generateText } from '@/lib/ollama/client';
import { SYSTEM_POLICY, buildUserPrompt } from '@/lib/prompting/policy';
import { inspectSchema, runSelectQuery } from '@/lib/db/mysql';
import { inferIntent } from '@/lib/agents/intent';
import { proposeTables } from '@/lib/agents/table';
import { pruneColumns } from '@/lib/agents/columnPrune';
import { buildClarifyingQuestions } from '@/lib/chat/clarify';
import { getMissingDbEnvKeys } from '@/lib/config/env';

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

async function generateSqlFromQuestion({ prompt, tablePlan, columnPlan }) {
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
  const raw = await generateText(generationPrompt, 'You generate safe SQL only.');
  return extractSqlCandidate(raw);
}

export async function runAgent({ mode, prompt, sql, selectedTables = [], tableAck = false }) {
  const trace = [];
  const normalizedMode = (mode || 'architecture').toLowerCase();
  const intentStart = now();
  const intent = inferIntent({ mode: normalizedMode, prompt });
  pushTrace(trace, 'intent', intentStart, 'ok', { domains: intent.domains });

  const retrievalStart = now();
  const contexts = await searchKnowledge(prompt, normalizedMode, undefined, intent.domains);
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
    const schemaStart = now();
    const schema = await inspectSchema();
    pushTrace(trace, 'schema_inspection', schemaStart, 'ok', { tables: schema.tables.length });
    const tableStart = now();
    tablePlan = proposeTables({ prompt, schema, selectedTables });
    pushTrace(trace, 'table_agent', tableStart, 'ok', { proposed: tablePlan.recommendedTables?.length || 0 });
    const finalTables = tableAck ? tablePlan.finalTables : tablePlan.recommendedTables;
    const pruneStart = now();
    columnPlan = pruneColumns({ prompt, schema, tables: finalTables });
    pushTrace(trace, 'column_prune', pruneStart, 'ok', { tables: finalTables.length });

    let finalSql = sql;
    if (!finalSql) {
      const sqlGenStart = now();
      finalSql = await generateSqlFromQuestion({ prompt, tablePlan, columnPlan });
      pushTrace(trace, 'sql_generation', sqlGenStart, finalSql ? 'ok' : 'blocked', { hasSql: Boolean(finalSql) });
    }

    if (!tableAck) {
      sqlContext = {
        type: 'awaiting_table_ack',
        generatedSql: finalSql || '',
        tableAck,
        tablePlan,
        columnPlan,
        message: 'Please confirm/edit tables, then run again with ACK.'
      };
      pushTrace(trace, 'table_ack_gate', now(), 'blocked', { suggested: tablePlan?.recommendedTables?.length || 0 });
    } else if (finalSql) {
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
          tableAck,
          tablePlan,
          columnPlan
        };
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
  let answer = await generateText(userPrompt, SYSTEM_POLICY);
  if (normalizedMode === 'sql' && sqlContext?.type === 'query_result') {
    const executionBlock = `\n\nSQL_EXECUTION\nSQL: ${sqlContext.sql}\nRows: ${sqlContext.rowCount}\nPreview:\n${JSON.stringify(sqlContext.preview, null, 2)}`;
    answer += executionBlock;
  } else if (normalizedMode === 'sql' && sqlContext?.type === 'awaiting_table_ack') {
    answer += `\n\nTABLE_CONFIRMATION_REQUIRED\nSuggested tables: ${(sqlContext.tablePlan?.recommendedTables || []).join(', ')}\nDraft SQL: ${sqlContext.generatedSql || 'not generated yet'}`;
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
    tableAck
  });

  return { answer, contexts, sqlContext, intent, tablePlan, columnPlan, trace, clarifyingQuestions };
}
