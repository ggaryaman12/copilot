'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CitationPanel from '@/components/CitationPanel';
import Presets from '@/components/Presets';

const MODES = [
  { value: 'architecture', label: 'Architecture' },
  { value: 'flow', label: 'Request Flow Trace' },
  { value: 'sql', label: 'SQL Copilot' }
];

function toMessage(role, type, payload = {}) {
  return {
    id: crypto.randomUUID(),
    role,
    type,
    ts: new Date().toISOString(),
    ...payload
  };
}

export default function HomePage() {
  const [sessionStartedAt] = useState(() => new Date().toISOString());
  const [theme, setTheme] = useState('dark');
  const [mode, setMode] = useState('architecture');
  const [prompt, setPrompt] = useState('');
  const [sql, setSql] = useState('');
  const [apiKey, setApiKey] = useState('change-me');
  const [sessionId, setSessionId] = useState('web-ui');
  const [provider, setProvider] = useState('auto');
  const [llmModel, setLlmModel] = useState('');
  const [llmEmbedModel, setLlmEmbedModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmBaseUrl, setLlmBaseUrl] = useState('');

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const [intent, setIntent] = useState(null);
  const [tablePlan, setTablePlan] = useState(null);
  const [columnPlan, setColumnPlan] = useState(null);
  const [sqlContext, setSqlContext] = useState(null);

  const [selectedTables, setSelectedTables] = useState([]);
  const [tableInput, setTableInput] = useState('');
  const [tableAck, setTableAck] = useState(false);

  const [citations, setCitations] = useState([]);
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState({ runtime: [], audit: [] });
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [rightTab, setRightTab] = useState('citations');
  const threadRef = useRef(null);
  const composerRef = useRef(null);

  const canSend = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading]);
  const dbConfigured = Boolean(health?.checks?.db?.configured);
  const dbStatus = health == null ? 'Checking' : (dbConfigured ? 'Connected' : 'Not Ready');
  const llmProvider = health?.checks?.llm?.provider || provider;

  function appendMessage(msg) {
    setMessages((prev) => [...prev, msg]);
  }

  function focusMode(nextMode) {
    setMode(nextMode);
    const label = MODES.find((m) => m.value === nextMode)?.label || nextMode;
    appendMessage(toMessage('assistant', 'text', {
      text: `Focus locked to: ${label}. I will only ask questions relevant to this mode.`
    }));
  }

  useEffect(() => {
    const cachedTheme = localStorage.getItem('yelo_agent_theme');
    const cachedKey = localStorage.getItem('yelo_agent_api_key');
    const cachedSession = localStorage.getItem('yelo_agent_session');
    const cachedProvider = localStorage.getItem('yelo_llm_provider');
    const cachedModel = localStorage.getItem('yelo_llm_model');
    const cachedEmbed = localStorage.getItem('yelo_llm_embed_model');
    const cachedLlmKey = localStorage.getItem('yelo_llm_api_key');
    const cachedBaseUrl = localStorage.getItem('yelo_llm_base_url');
    if (cachedTheme) setTheme(cachedTheme);
    if (cachedKey) setApiKey(cachedKey);
    if (cachedSession) setSessionId(cachedSession);
    if (cachedProvider) setProvider(cachedProvider);
    if (cachedModel) setLlmModel(cachedModel);
    if (cachedEmbed) setLlmEmbedModel(cachedEmbed);
    if (cachedLlmKey) setLlmApiKey(cachedLlmKey);
    if (cachedBaseUrl) setLlmBaseUrl(cachedBaseUrl);

    setMessages([
      toMessage('assistant', 'text', {
        text: 'Ask me anything about architecture, request flow, or SQL. I will ask questions upfront if context is missing.'
      })
    ]);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('yelo_agent_theme', theme);
  }, [theme]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  async function parseResponseSafe(response) {
    const text = await response.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, data: { raw: text } };
    }
  }

  function toApiError(parsed, status, fallback) {
    if (parsed?.ok) {
      return parsed?.data?.error || `${fallback} (${status})`;
    }
    const raw = String(parsed?.data?.raw || '');
    if (raw.startsWith('<!DOCTYPE') || raw.startsWith('<html')) {
      return `${fallback} (${status}): API returned HTML error page. Check server logs/runtime logs for stack trace.`;
    }
    return `${fallback} (${status}): ${raw.slice(0, 220)}`;
  }

  function applyQuestionSuggestion(question) {
    const raw = String(question || '').trim();
    if (!raw) return;

    const tableMatch = raw.match(/^Confirm one exact table from:\s*(.+)$/i);
    if (tableMatch?.[1]) {
      const first = tableMatch[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)[0];
      if (first) {
        if (loading) return;
        const lastUserPrompt = [...messages]
          .reverse()
          .find((m) => m.role === 'user' && m.type === 'text' && String(m.text || '').trim())?.text || '';
        const basePrompt = String(prompt || lastUserPrompt || '').trim();
        setSelectedTables([first]);
        setTableAck(true);
        runAgent({
          mode: 'sql',
          prompt: basePrompt || 'Run SQL with selected table.',
          sql: String(sql || '').trim(),
          selectedTables: [first],
          tableAck: true,
          silentUserMessage: true
        });
      }
    } else {
      setPrompt((prev) => `${prev ? `${prev}\n` : ''}${raw}`);
    }

    composerRef.current?.focus();
  }

  const loadHealthAndLogs = useCallback(async () => {
    try {
      const headers = {};
      if (provider) headers['x-llm-provider'] = provider;
      if (llmModel) headers['x-llm-model'] = llmModel;
      if (llmEmbedModel) headers['x-llm-embed-model'] = llmEmbedModel;
      if (llmApiKey) headers['x-llm-api-key'] = llmApiKey;
      if (llmBaseUrl) headers['x-llm-base-url'] = llmBaseUrl;
      const [healthRes, logsRes] = await Promise.all([
        fetch('/api/health', { headers }),
        fetch(`/api/logs?limit=80&since=${encodeURIComponent(sessionStartedAt)}`, { headers: { 'x-api-key': apiKey } })
      ]);

      const h = await parseResponseSafe(healthRes);
      setHealth(h.ok ? h.data : { ok: false, error: 'Non-JSON health response.' });

      if (logsRes.ok) {
        const l = await parseResponseSafe(logsRes);
        setLogs(l.ok ? l.data : { runtime: [{ raw: 'Non-JSON logs response.' }], audit: [] });
      } else {
        setLogs({ runtime: [{ raw: 'Failed to read logs (check API key).' }], audit: [] });
      }
    } catch (e) {
      setHealth({ ok: false, error: e.message || 'health failed' });
    }
  }, [apiKey, llmApiKey, llmBaseUrl, llmEmbedModel, llmModel, provider, sessionStartedAt]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHealthAndLogs();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadHealthAndLogs]);

  async function clearLogs() {
    await fetch('/api/logs', { method: 'DELETE', headers: { 'x-api-key': apiKey } });
    await loadHealthAndLogs();
  }

  async function syncDbMemory() {
    try {
      const res = await fetch('/api/db/snapshot', {
        method: 'POST',
        headers: { 'x-api-key': apiKey }
      });
      const parsed = await parseResponseSafe(res);
      if (!res.ok || !parsed.ok) {
        throw new Error(toApiError(parsed, res.status, 'DB memory sync failed'));
      }
      const data = parsed.data;
      appendMessage(toMessage('assistant', 'text', {
        text: `DB memory snapshot saved. Tables: ${data.tableCount}, Code hints: ${data.codeHintCount}.`
      }));
      if ((data.questions || []).length) {
        appendMessage(toMessage('assistant', 'questions', {
          intro: 'To improve SQL accuracy for future runs, please confirm:',
          questions: data.questions
        }));
      }
      await loadHealthAndLogs();
    } catch (e) {
      setError(e.message || 'Failed to sync DB memory');
    }
  }

  async function preflightPrompt(rawPrompt, rawMode, rawSql = '', rawSelectedTables = []) {
    const res = await fetch('/api/chat/preflight', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        prompt: rawPrompt,
        mode: rawMode,
        sql: rawSql,
        selectedTables: rawSelectedTables,
        llm: {
          provider,
          model: llmModel,
          embedModel: llmEmbedModel,
          apiKey: llmApiKey,
          baseUrl: llmBaseUrl
        }
      })
    });
    const parsed = await parseResponseSafe(res);
    if (!res.ok || !parsed.ok) {
      throw new Error(toApiError(parsed, res.status, 'Preflight failed'));
    }
    return parsed.data;
  }

  async function runAgent(overrides = {}) {
    const resolvedMode = overrides.mode || mode;
    const resolvedPrompt = String(overrides.prompt ?? prompt ?? '').trim();
    const resolvedSql = String(overrides.sql ?? (resolvedMode === 'sql' ? sql : '') ?? '');
    const resolvedSelectedTables = Array.isArray(overrides.selectedTables)
      ? overrides.selectedTables
      : (resolvedMode === 'sql' ? selectedTables : []);
    const resolvedTableAck = typeof overrides.tableAck === 'boolean'
      ? overrides.tableAck
      : (resolvedMode === 'sql' ? tableAck : false);
    const silentUserMessage = Boolean(overrides.silentUserMessage);

    if (!resolvedPrompt) return;
    localStorage.setItem('yelo_agent_api_key', apiKey);
    localStorage.setItem('yelo_agent_session', sessionId);
    localStorage.setItem('yelo_llm_provider', provider);
    localStorage.setItem('yelo_llm_model', llmModel);
    localStorage.setItem('yelo_llm_embed_model', llmEmbedModel);
    localStorage.setItem('yelo_llm_api_key', llmApiKey);
    localStorage.setItem('yelo_llm_base_url', llmBaseUrl);

    if (!silentUserMessage) {
      appendMessage(toMessage('user', 'text', { text: resolvedPrompt }));
    }
    setLoading(true);
    setError('');

    try {
      const pre = await preflightPrompt(
        resolvedPrompt,
        resolvedMode,
        resolvedMode === 'sql' ? resolvedSql : '',
        resolvedSelectedTables
      );
      if (!pre.ready) {
        appendMessage(toMessage('assistant', 'questions', {
          intro: resolvedMode === 'sql'
            ? 'I need this input before executing SQL:'
            : 'Before I run this safely, I need a couple of clarifications:',
          questions: pre.questions || []
        }));
        setIntent(pre.intent || null);
        setLoading(false);
        return;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'x-session-id': sessionId
        },
        body: JSON.stringify({
          mode: resolvedMode,
          prompt: resolvedPrompt,
          sql: resolvedMode === 'sql' ? resolvedSql : '',
          selectedTables: resolvedMode === 'sql' ? resolvedSelectedTables : [],
          tableAck: resolvedMode === 'sql' ? resolvedTableAck : false,
          llm: {
            provider,
            model: llmModel,
            embedModel: llmEmbedModel,
            apiKey: llmApiKey,
            baseUrl: llmBaseUrl
          }
        })
      });
      const parsed = await parseResponseSafe(res);
      if (!res.ok || !parsed.ok) throw new Error(toApiError(parsed, res.status, 'Chat request failed'));
      const data = parsed.data;

      setIntent(data.intent || null);
      setTablePlan(data.tablePlan || null);
      setColumnPlan(data.columnPlan || null);
      setSqlContext(data.sqlContext || null);
      setCitations(data.citations || []);

      appendMessage(toMessage('assistant', 'text', { text: data.answer || 'No answer.' }));

      const cleanRecommended = (data.tablePlan?.recommendedTables || [])
        .map((x) => String(x || '').trim())
        .filter(Boolean);

      if (resolvedMode === 'sql' && cleanRecommended.length && ['needs_table_input', 'query_error'].includes(data.sqlContext?.type)) {
        setSelectedTables(cleanRecommended);
        appendMessage(toMessage('assistant', 'table_card', {
          intro: 'Select the exact table to continue SQL execution.',
          tables: cleanRecommended,
          draftSql: data.sqlContext?.generatedSql || ''
        }));
      }

      if (resolvedMode === 'sql' && data.sqlContext?.type === 'query_result') {
        appendMessage(toMessage('assistant', 'sql_result', {
          sql: data.sqlContext.sql,
          rowCount: data.sqlContext.rowCount,
          rows: data.sqlContext.preview || []
        }));
      }
      if (resolvedMode === 'sql' && data.sqlContext?.type === 'needs_table_input') {
        const suggestions = (data.sqlContext.suggestedTables || [])
          .map((t) => String(t || '').trim())
          .filter(Boolean)
          .slice(0, 5);
        appendMessage(toMessage('assistant', 'questions', {
          intro: data.sqlContext.message || 'I need the exact table name before executing SQL.',
          questions: suggestions.length
            ? [`Confirm one exact table from: ${suggestions.join(', ')}`]
            : ['Please provide the exact table name to run this SQL query.']
        }));
      }

      if ((data.clarifyingQuestions || []).length && !(resolvedMode === 'sql' && data.sqlContext?.type === 'needs_table_input')) {
        appendMessage(toMessage('assistant', 'questions', {
          intro: 'Quick follow-ups to improve accuracy:',
          questions: data.clarifyingQuestions
        }));
      }

      await loadHealthAndLogs();
      if (!overrides.keepComposer) {
        setPrompt('');
        setSql('');
      }
    } catch (e) {
      setError(e.message || 'Unknown error');
      appendMessage(toMessage('assistant', 'text', { text: `I hit an issue: ${e.message || 'unknown error'}` }));
      await loadHealthAndLogs();
    } finally {
      setLoading(false);
    }
  }

  function addTableFromInput() {
    const t = tableInput.trim();
    if (!t) return;
    setSelectedTables((prev) => Array.from(new Set([...prev, t])));
    setTableInput('');
  }

  function removeTable(name) {
    setSelectedTables((prev) => prev.filter((x) => x !== name));
  }

  function confirmTablesAndRun(draftSql = '') {
    const tables = selectedTables
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    if (!tables.length) {
      setError('Add/select at least one table before execution.');
      return;
    }
    const effectiveSql = String(sql || '').trim();
    const lastUserPrompt = [...messages]
      .reverse()
      .find((m) => m.role === 'user' && m.type === 'text' && String(m.text || '').trim())?.text || '';
    const basePrompt = String(prompt || lastUserPrompt || '').trim();
    setTableAck(true);
    if (effectiveSql) setSql(effectiveSql);
    runAgent({
      mode: 'sql',
      prompt: basePrompt || 'Execute SQL for selected table.',
      sql: effectiveSql,
      selectedTables: tables,
      tableAck: true,
      silentUserMessage: true
    });
  }

  function applyPreset(preset) {
    setMode(preset.mode);
    setPrompt(preset.prompt);
  }

  return (
    <main className="app-shell chatbot-shell">
      <header className="topbar chat-topbar">
        <div>
          <h1>YELO Copilot Platform</h1>
          <p>Scope: yelo-server, yelo-dashboard-angular, yelo-marketplace-webapp</p>
          <div className="status-strip">
            <span className="status-pill">Mode: {MODES.find((m) => m.value === mode)?.label}</span>
            <span className="status-pill">Provider: {String(llmProvider).toUpperCase()}</span>
            <span className={`status-pill ${health == null ? 'status-neutral' : (dbConfigured ? 'status-ok' : 'status-warn')}`}>
              DB: {dbStatus}
            </span>
          </div>
        </div>
        <div className="top-actions">
          <div className="mode-switch">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`mode-btn ${mode === m.value ? 'mode-btn-active' : ''}`}
                onClick={() => focusMode(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="secondary-btn" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? 'Hide Settings' : 'Show Settings'}
          </button>
          <button className="theme-toggle" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>
        </div>
      </header>

      <section className="chat-grid">
        <section className="panel chat-main">
          {showSettings ? (
          <div className="chat-controls">
            <div className="row-two">
              <div>
                <label>API Key</label>
                <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              </div>
              <div>
                <label>Session ID</label>
                <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
              </div>
            </div>
            <div className="row-two">
              <div>
                <label>Provider</label>
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  <option value="auto">AUTO (default Ollama)</option>
                  <option value="ollama">Ollama</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
              <div>
                <label>Model (optional override)</label>
                <input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="e.g. minimax-m2.5:cloud or gemini-1.5-pro" />
              </div>
            </div>
            <div className="row-two">
              <div>
                <label>Embed Model (optional)</label>
                <input value={llmEmbedModel} onChange={(e) => setLlmEmbedModel(e.target.value)} placeholder="optional embed model" />
              </div>
              <div>
                <label>Provider API Key (optional)</label>
                <input value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder="Gemini/OpenAI/etc key" />
              </div>
            </div>
            <div>
              <label>Provider Base URL (optional)</label>
              <input value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} placeholder="override provider base URL" />
            </div>
          </div>
          ) : null}
          <div className="chat-controls">
            <Presets onChoose={applyPreset} />
          </div>

          <div className="chat-thread" ref={threadRef}>
            {messages.map((msg) => (
              <article key={msg.id} className={`bubble bubble-${msg.role}`}>
                {msg.type === 'text' ? <p>{msg.text}</p> : null}

                {msg.type === 'questions' ? (
                  <div>
                    <p>{msg.intro}</p>
                    <div className="question-list question-list-cards">
                      {(msg.questions || []).map((q) => (
                        <div key={q} className="question-card">
                          <p className="question-text">{q}</p>
                          <div className="question-actions">
                            <button type="button" className="question-chip" onClick={() => applyQuestionSuggestion(q)}>
                              Use This
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {msg.type === 'table_card' ? (
                  <div className="table-card">
                    <p>{msg.intro}</p>
                    <div className="table-list">
                      {selectedTables.map((t) => (
                        <div key={t} className="table-row">
                          <span>{t}</span>
                          <button type="button" onClick={() => removeTable(t)}>x</button>
                        </div>
                      ))}
                    </div>
                    <div className="table-add-row">
                      <input
                        value={tableInput}
                        onChange={(e) => setTableInput(e.target.value)}
                        placeholder="Add table name"
                      />
                      <button type="button" onClick={addTableFromInput}>Add</button>
                    </div>
                    {msg.draftSql ? <pre>{msg.draftSql}</pre> : null}
                    <button type="button" disabled={loading} className="looks-good" onClick={() => confirmTablesAndRun(msg.draftSql || '')}>
                      {tableAck ? 'Confirm & Run Again' : 'Looks Good: Confirm & Run'}
                    </button>
                  </div>
                ) : null}

                {msg.type === 'sql_result' ? (
                  <div>
                    <p>Executed SQL ({msg.rowCount} rows)</p>
                    <pre>{msg.sql}</pre>
                    <pre>{JSON.stringify(msg.rows, null, 2)}</pre>
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="composer">
            <label>Message</label>
            <textarea
              ref={composerRef}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask naturally. I will ask follow-ups in chat if needed."
            />

            {mode === 'sql' ? (
              <>
                <label>Optional SQL (leave empty for agent-generated SQL)</label>
                <textarea
                  rows={3}
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  placeholder="Optional. If provided, it must be SELECT/EXPLAIN and real table names."
                />
                <label className="checkbox-line">
                  <input type="checkbox" checked={tableAck} onChange={(e) => setTableAck(e.target.checked)} />
                  Optional: lock selected table(s) for this run.
                </label>
              </>
            ) : null}

            <div className="composer-actions">
              <button type="button" disabled={!canSend} onClick={runAgent}>{loading ? 'Running...' : 'Send'}</button>
              <button type="button" className="secondary-btn" onClick={loadHealthAndLogs}>Refresh Health & Logs</button>
              <button type="button" className="secondary-btn" onClick={syncDbMemory}>Sync DB Memory</button>
              <button type="button" className="secondary-btn" onClick={clearLogs}>Clear Logs</button>
            </div>

            {error ? <p className="error">{error}</p> : null}
          </div>
        </section>

        <aside className="panel chat-side">
          <div className="side-tabs">
            <button type="button" className={rightTab === 'citations' ? 'side-tab active' : 'side-tab'} onClick={() => setRightTab('citations')}>Citations</button>
            <button type="button" className={rightTab === 'agents' ? 'side-tab active' : 'side-tab'} onClick={() => setRightTab('agents')}>Agents</button>
            <button type="button" className={rightTab === 'ops' ? 'side-tab active' : 'side-tab'} onClick={() => setRightTab('ops')}>Ops</button>
          </div>
          {rightTab === 'citations' ? <CitationPanel citations={citations} /> : null}
          {rightTab === 'agents' ? (
            <div className="panel mini-panel">
              <h3>Intent / Table / Column</h3>
              <pre>{JSON.stringify({ intent, tablePlan, columnPlan, sqlContext }, null, 2)}</pre>
            </div>
          ) : null}
          {rightTab === 'ops' ? (
            <div className="panel mini-panel">
              <h3>Health</h3>
              <pre>{JSON.stringify(health, null, 2)}</pre>
              <h3>Runtime Logs</h3>
              <pre>{JSON.stringify(logs.runtime || [], null, 2)}</pre>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
