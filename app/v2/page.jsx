'use client';

import { useMemo, useState } from 'react';
import YeloShell from '@/components/redesign/YeloShell';
import ChatMessage from '@/components/redesign/ChatMessage';
import TypingIndicator from '@/components/redesign/TypingIndicator';
import InlineTableConfirmCard from '@/components/redesign/InlineTableConfirmCard';
import FloatingComposer from '@/components/redesign/FloatingComposer';
import RightDrawer from '@/components/redesign/RightDrawer';

const MODES = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'request-flow', label: 'Request Flow Trace' },
  { value: 'sql', label: 'SQL Copilot' }
];

const SQL_SCENARIOS = {
  jobs: {
    key: 'jobs',
    defaultTable: 'tb_jobs',
    tables: ['tb_jobs', 'tb_job_payment_details', 'tb_marketplace_storefronts'],
    citation: {
      label: 'tb_jobs query pattern',
      path: '/Users/aryamangupta/YELO/yelo-server/1',
      startLine: 1,
      score: 0.86,
      preview: 'SELECT ... FROM tb_jobs j ... LEFT JOIN tb_marketplace_cities tmc ON tmc.city_id = j.team_id'
    }
  },
  cities: {
    key: 'cities',
    defaultTable: 'tb_marketplace_cities',
    tables: ['tb_marketplace_cities', 'tb_city_config', 'tb_city_geofence_mapping'],
    citation: {
      label: 'cityDao.js',
      path: '/Users/aryamangupta/YELO/yelo-server/modules/cities/dao/cityDao.js',
      startLine: 93,
      score: 0.94,
      preview: 'let query = `SELECT ${columns} FROM tb_marketplace_cities tmc`;'
    }
  },
  stores: {
    key: 'stores',
    defaultTable: 'tb_marketplace_storefronts',
    tables: ['tb_marketplace_storefronts', 'tb_form_settings'],
    citation: {
      label: 'biddingController.js',
      path: '/Users/aryamangupta/YELO/yelo-server/modules/freelancer/bidding/controllers/biddingController.js',
      startLine: 741,
      score: 0.91,
      preview: 'LEFT JOIN tb_marketplace_storefronts tms ON tms.user_id = tfs.user_id ... tms.store_name, tfs.form_name'
    }
  },
  generic: {
    key: 'generic',
    defaultTable: '',
    tables: [],
    citation: {
      label: 'search-required',
      path: '/Users/aryamangupta/YELO/yelo-server',
      startLine: 1,
      score: 0.2,
      preview: 'No verified table match yet. Narrow the entity first.'
    }
  }
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 00:00:00`;
}

function addOneDay(year, month, day) {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return formatDateTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
}

function parseSqlPrompt(prompt) {
  const userIdMatch = prompt.match(/user id\s+(\d+)/i);
  const fromToMatch = prompt.match(/from\s+(\d{1,2})\s+([a-z]+)\s+to\s+(\d{1,2})\s+([a-z]+)/i);
  const todayMatch = /\btoday\b/i.test(prompt);
  const startsWithMatch = prompt.match(/start(?:s)?\s+with\s+([a-z0-9\s-]+)/i) || prompt.match(/name\s+start\s+with\s+([a-z0-9\s-]+)/i);
  const explicitTableMatch = prompt.match(/\bfrom\s+(tb_[a-z0-9_]+)/i);

  const monthMap = {
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

  let startDate = '';
  let endDate = '';
  let rangeLabel = '';

  if (fromToMatch) {
    const [, startDayRaw, startMonthRaw, endDayRaw, endMonthRaw] = fromToMatch;
    const startMonth = monthMap[startMonthRaw.toLowerCase()];
    const endMonth = monthMap[endMonthRaw.toLowerCase()];

    if (startMonth && endMonth) {
      const year = 2026;
      const startDay = Number(startDayRaw);
      const endDay = Number(endDayRaw);
      startDate = formatDateTime(year, startMonth, startDay);
      endDate = addOneDay(year, endMonth, endDay);
      rangeLabel = `${startDayRaw} ${startMonthRaw} to ${endDayRaw} ${endMonthRaw}`;
    }
  } else if (todayMatch) {
    startDate = '2026-03-10 00:00:00';
    endDate = '2026-03-11 00:00:00';
    rangeLabel = 'today';
  }

  return {
    userId: userIdMatch?.[1] || '',
    startDate,
    endDate,
    rangeLabel,
    startsWith: startsWithMatch?.[1]?.trim().replace(/^["']|["']$/g, '') || '',
    explicitTable: explicitTableMatch?.[1] || ''
  };
}

function detectSqlScenario(prompt) {
  const normalized = prompt.toLowerCase();

  if (/\bcit(y|ies)\b/.test(normalized)) {
    return SQL_SCENARIOS.cities;
  }

  if (/\bstore(s|fronts)?\b|\bmerchant(s)?\b/.test(normalized)) {
    return SQL_SCENARIOS.stores;
  }

  if (/\border(s)?\b|\bjob(s)?\b/.test(normalized)) {
    return SQL_SCENARIOS.jobs;
  }

  return SQL_SCENARIOS.generic;
}

function buildSqlPlan(prompt, tableOverride) {
  const scenario = detectSqlScenario(prompt);
  const parsed = parseSqlPrompt(prompt);
  const explicitTable = parsed.explicitTable;
  const selectedTable = tableOverride || explicitTable || scenario.defaultTable;

  if (scenario.key === 'cities') {
    const startsWith = parsed.startsWith || 'Chandigarh';
    const sql = `SELECT city_id, name, is_active, priority
FROM ${selectedTable}
WHERE name LIKE "${startsWith}%"
ORDER BY name ASC
LIMIT 50`;

    return {
      scenario,
      prompt,
      selectedTable,
      draftSql: sql,
      summary: `I identified a city lookup query. Confirm the table, review the SQL, then run it.`,
      resultPreview: [
        { city_id: 12, name: `${startsWith}`, is_active: 1, priority: 1 },
        { city_id: 14, name: `${startsWith} Extension`, is_active: 1, priority: 2 }
      ]
    };
  }

  if (scenario.key === 'stores') {
    const startsWith = parsed.startsWith || 'Chandigarh';
    const table = selectedTable || 'tb_marketplace_storefronts';
    const isFormSettings = table === 'tb_form_settings';
    const nameColumn = isFormSettings ? 'form_name' : 'store_name';
    const selectColumns = isFormSettings
      ? 'user_id, form_name, domain_name'
      : 'user_id, store_name, display_name, email';
    const sql = `SELECT ${selectColumns}
FROM ${table}
WHERE ${nameColumn} LIKE "${startsWith}%"
ORDER BY ${nameColumn} ASC
LIMIT 50`;

    const previewRows = isFormSettings
      ? [
          { user_id: 4012, form_name: startsWith, domain_name: `${startsWith.toLowerCase()}.example.com` },
          { user_id: 4188, form_name: `${startsWith} Express`, domain_name: `${startsWith.toLowerCase()}-express.example.com` }
        ]
      : [
          { user_id: 701, store_name: startsWith, display_name: startsWith, email: 'store@example.com' },
          { user_id: 719, store_name: `${startsWith} Central`, display_name: `${startsWith} Central`, email: 'central@example.com' }
        ];

    return {
      scenario: {
        ...scenario,
        tables: Array.from(new Set([...(scenario.tables || []), ...(explicitTable ? [explicitTable] : [])]))
      },
      prompt,
      selectedTable: table,
      draftSql: sql,
      summary: `I identified a storefront lookup query. Confirm the table, review the SQL, then run it.`,
      resultPreview: previewRows
    };
  }

  if (scenario.key === 'jobs') {
    const clauses = [];
    if (parsed.userId) {
      clauses.push(`marketplace_user_id = ${parsed.userId}`);
    }
    if (parsed.startDate && parsed.endDate) {
      clauses.push(`creation_datetime >= "${parsed.startDate}"`);
      clauses.push(`creation_datetime < "${parsed.endDate}"`);
    }

    const whereClause = clauses.length ? `\nWHERE ${clauses.join('\n  AND ')}` : '';
    const sql = `SELECT job_id, marketplace_user_id, creation_datetime, job_status, total_amount
FROM ${selectedTable}${whereClause}
ORDER BY creation_datetime DESC
LIMIT 200`;

    return {
      scenario,
      prompt,
      selectedTable,
      draftSql: sql,
      summary: `I identified an order lookup query. Confirm the table, review the SQL, then run it.`,
      resultPreview: [
        {
          job_id: 9001201,
          marketplace_user_id: parsed.userId || '510012362',
          creation_datetime: parsed.startDate || '2026-02-27 18:42:11',
          job_status: 9,
          total_amount: 540
        },
        {
          job_id: 9001194,
          marketplace_user_id: parsed.userId || '510012362',
          creation_datetime: parsed.endDate ? parsed.endDate.replace('00:00:00', '12:14:03') : '2026-02-18 12:14:03',
          job_status: 5,
          total_amount: 320
        }
      ]
    };
  }

  return {
    scenario,
    prompt,
    selectedTable: explicitTable || '',
    draftSql: explicitTable ? `SELECT *\nFROM ${explicitTable}\nLIMIT 50` : '-- I need a clearer entity first, for example orders/jobs, stores, or cities.',
    summary: explicitTable
      ? `I picked up the explicit table hint ${explicitTable}. Review the draft SQL, then run it or refine the target columns.`
      : 'I could not infer the SQL entity with confidence. Narrow the target entity first, then I will generate the query.',
    resultPreview: []
  };
}

function buildAssistantReply(mode, prompt) {
  if (mode === 'architecture') {
    return {
      text: `I will map ownership for "${prompt}" across yelo-server, yelo-dashboard-angular, and yelo-marketplace-webapp, then separate VERIFIED facts from inferred coupling.`,
      citations: [SQL_SCENARIOS.jobs.citation]
    };
  }

  if (mode === 'request-flow') {
    return {
      text: `I will trace "${prompt}" from entrypoint to controller, service, and DB touchpoints. I will surface the main handoff chain first.`,
      citations: [SQL_SCENARIOS.jobs.citation]
    };
  }

  return {
    text: 'I identified a candidate query. Confirm the table, review the SQL, then run it.',
    citations: [SQL_SCENARIOS.generic.citation],
    showSqlCard: true
  };
}

export default function V2Page() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState('citations');
  const [mode, setMode] = useState('sql');
  const [prompt, setPrompt] = useState('');
  const [sql, setSql] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('tb_jobs');
  const [draftSql, setDraftSql] = useState('');
  const [activeSqlPlan, setActiveSqlPlan] = useState(null);
  const [panelCitations, setPanelCitations] = useState([]);
  const [runLogs, setRunLogs] = useState([
    { ts: '2026-03-10T08:35:00.000Z', level: 'info', message: 'v2_demo_ready', mode: 'sql' }
  ]);
  const [messages, setMessages] = useState([
    {
      id: createId('assistant'),
      role: 'assistant',
      text: 'Choose a mode, then ask naturally. I will adapt the workflow to Architecture, Request Flow Trace, or SQL Copilot.',
      citations: []
    }
  ]);

  const activeModeLabel = useMemo(
    () => MODES.find((item) => item.value === mode)?.label || 'SQL Copilot',
    [mode]
  );

  async function persistLearnedFact(fact) {
    try {
      await fetch('/api/memory/teach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'my-yelo-key-123'
        },
        body: JSON.stringify({ fact })
      });
    } catch {
      // V2 should not break the UI if memory persistence fails.
    }
  }

  function openCitations() {
    setDrawerTab('citations');
    setDrawerOpen(true);
  }

  function appendMessage(message) {
    setMessages((prev) => [...prev, message]);
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setActiveSqlPlan(null);
    setDraftSql('');
  }

  function handleGenerateQuery(sourcePrompt = activeSqlPlan?.prompt || prompt, tableOverride = selectedTable) {
    const nextPlan = buildSqlPlan(sourcePrompt, tableOverride);
    setActiveSqlPlan(nextPlan);
    setSelectedTable(nextPlan.selectedTable || tableOverride || '');
    setDraftSql(nextPlan.draftSql);
    setPanelCitations([nextPlan.scenario.citation]);
    return nextPlan;
  }

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed || loading) {
      return;
    }

    appendMessage({
      id: createId('user'),
      role: 'user',
      text: trimmed
    });

    if (mode === 'sql') {
      const plan = buildSqlPlan(trimmed);
      setActiveSqlPlan(plan);
      setSelectedTable(plan.selectedTable);
      setDraftSql(plan.draftSql);
      setPanelCitations([plan.scenario.citation]);
      appendMessage({
        id: createId('assistant'),
        role: 'assistant',
        text: plan.summary,
        citations: [plan.scenario.citation],
        showSqlCard: true
      });
      setDrawerTab('citations');
      setDrawerOpen(true);
    } else {
      const reply = buildAssistantReply(mode, trimmed);
      setPanelCitations(reply.citations || []);
      appendMessage({
        id: createId('assistant'),
        role: 'assistant',
        ...reply
      });
    }

    setPrompt('');
  }

  function handleConfirmRun() {
    const plan = activeSqlPlan || buildSqlPlan(prompt, selectedTable);
    const sqlToRun = (draftSql || plan.draftSql).trim();

    if (!sqlToRun || plan.scenario.key === 'generic') {
      appendMessage({
        id: createId('assistant'),
        role: 'assistant',
        text: 'I need a clearer SQL entity before execution. Specify whether this is about orders/jobs, cities, vendors, or another concrete table family.'
      });
      return;
    }

    setLoading(true);

    window.setTimeout(() => {
      const result = {
        rowCount: plan.resultPreview.length,
        table: selectedTable,
        sql: sqlToRun,
        rows: plan.resultPreview
      };

      appendMessage({
        id: createId('assistant'),
        role: 'assistant',
        text: `Query executed successfully. Returned ${result.rowCount} rows from ${result.table}.`,
        result
      });
      persistLearnedFact({
        key: `${plan.scenario.key}.${selectedTable || 'table'}`,
        entity: plan.scenario.key,
        aliases: [plan.scenario.key, ...(plan.scenario.key === 'stores' ? ['store', 'stores', 'storefront'] : [])],
        table: selectedTable,
        source: 'runtime-confirmed',
        notes: `Persisted from V2 SQL run for prompt: ${plan.prompt}`
      });
      setRunLogs((prev) => [
        {
          ts: new Date().toISOString(),
          level: 'info',
          message: 'query_executed',
          mode: 'sql',
          table: result.table,
          rows: result.rowCount
        },
        ...prev
      ]);
      setDrawerTab('logs');
      setDrawerOpen(true);
      setLoading(false);
    }, 900);
  }

  return (
    <YeloShell
      mode={activeModeLabel}
      modes={MODES}
      activeMode={mode}
      onModeChange={handleModeChange}
      dbStatus="Connected"
      provider="Ollama"
      drawerOpen={drawerOpen}
      onToggleDrawer={() => setDrawerOpen((value) => !value)}
      composer={(
        <FloatingComposer
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleSubmit}
          loading={loading}
          showAdvanced={advancedOpen}
          onToggleAdvanced={() => setAdvancedOpen((value) => !value)}
          sql={sql}
          onSqlChange={setSql}
          modeLabel={activeModeLabel}
          onRefresh={() => {
            setDrawerTab('logs');
            setDrawerOpen(true);
          }}
          onSync={() => {
            setRunLogs((prev) => [
              {
                ts: new Date().toISOString(),
                level: 'info',
                message: 'db_memory_sync_requested',
                mode
              },
              ...prev
            ]);
            setDrawerTab('logs');
            setDrawerOpen(true);
          }}
          onClear={() => {
            setRunLogs([]);
          }}
        />
      )}
      drawer={(
        <RightDrawer
          tab={drawerTab}
          onTabChange={setDrawerTab}
          citations={panelCitations}
          logs={runLogs}
        />
      )}
    >
      <div className="v2-message-stack">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            text={message.text}
            citations={message.citations}
            onOpenCitation={openCitations}
          >
            {message.showSqlCard ? (
              <InlineTableConfirmCard
                tables={activeSqlPlan?.scenario.tables || []}
                selectedTable={selectedTable}
                draftSql={draftSql}
                onSelectTable={(table) => {
                  setSelectedTable(table);
                  handleGenerateQuery(activeSqlPlan?.prompt || prompt, table);
                }}
                onEditSql={setDraftSql}
                loading={loading}
                onGenerate={() => handleGenerateQuery(activeSqlPlan?.prompt || prompt, selectedTable)}
                onConfirm={handleConfirmRun}
              />
            ) : null}

            {message.result ? (
              <div className="v2-result-card">
                <div className="v2-result-meta">
                  <span className="v2-result-pill">Rows: {message.result.rowCount}</span>
                  <span className="v2-result-pill">Table: {message.result.table}</span>
                  <button
                    type="button"
                    className="v2-toolbar-btn"
                    onClick={() => {
                      setDrawerTab('logs');
                      setDrawerOpen(true);
                    }}
                  >
                    Open Execution Log
                  </button>
                </div>
                <pre className="v2-code-block">{message.result.sql}</pre>
                <pre className="v2-code-block">{JSON.stringify(message.result.rows, null, 2)}</pre>
              </div>
            ) : null}
          </ChatMessage>
        ))}

        {loading ? <TypingIndicator /> : null}
      </div>
    </YeloShell>
  );
}
