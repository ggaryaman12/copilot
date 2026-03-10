'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const [theme, setTheme] = useState('dark');
  const [mode, setMode] = useState('architecture');
  const [prompt, setPrompt] = useState('');
  const [sql, setSql] = useState('');
  const [apiKey, setApiKey] = useState('change-me');
  const [sessionId, setSessionId] = useState('web-ui');

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

  const canSend = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading]);

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
    if (cachedTheme) setTheme(cachedTheme);
    if (cachedKey) setApiKey(cachedKey);
    if (cachedSession) setSessionId(cachedSession);

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

  async function parseResponseSafe(response) {
    const text = await response.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, data: { raw: text } };
    }
  }

  async function loadHealthAndLogs() {
    try {
      const [healthRes, logsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/logs?limit=40', { headers: { 'x-api-key': apiKey } })
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
  }

  async function clearLogs() {
    await fetch('/api/logs', { method: 'DELETE', headers: { 'x-api-key': apiKey } });
    await loadHealthAndLogs();
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
        selectedTables: rawSelectedTables
      })
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Preflight failed (${res.status})`);
    return body;
  }

  async function runAgent() {
    if (!prompt.trim()) return;
    localStorage.setItem('yelo_agent_api_key', apiKey);
    localStorage.setItem('yelo_agent_session', sessionId);

    appendMessage(toMessage('user', 'text', { text: prompt }));
    setLoading(true);
    setError('');

    try {
      const pre = await preflightPrompt(prompt, mode, mode === 'sql' ? sql : '', selectedTables);
      if (!pre.ready) {
        appendMessage(toMessage('assistant', 'questions', {
          intro: 'Before I run this safely, I need a couple of clarifications:',
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
          mode,
          prompt,
          sql: mode === 'sql' ? sql : '',
          selectedTables: mode === 'sql' ? selectedTables : [],
          tableAck: mode === 'sql' ? tableAck : false
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      setIntent(data.intent || null);
      setTablePlan(data.tablePlan || null);
      setColumnPlan(data.columnPlan || null);
      setSqlContext(data.sqlContext || null);
      setCitations(data.citations || []);

      appendMessage(toMessage('assistant', 'text', { text: data.answer || 'No answer.' }));

      const cleanRecommended = (data.tablePlan?.recommendedTables || [])
        .map((x) => String(x || '').trim())
        .filter(Boolean);

      if (mode === 'sql' && cleanRecommended.length) {
        setSelectedTables(cleanRecommended);
        appendMessage(toMessage('assistant', 'table_card', {
          intro: "I'm planning to use the tables below. Confirm or edit before execution.",
          tables: cleanRecommended,
          draftSql: data.sqlContext?.generatedSql || ''
        }));
      }

      if (mode === 'sql' && data.sqlContext?.type === 'query_result') {
        appendMessage(toMessage('assistant', 'sql_result', {
          sql: data.sqlContext.sql,
          rowCount: data.sqlContext.rowCount,
          rows: data.sqlContext.preview || []
        }));
      }

      if ((data.clarifyingQuestions || []).length) {
        appendMessage(toMessage('assistant', 'questions', {
          intro: 'Quick follow-ups to improve accuracy:',
          questions: data.clarifyingQuestions
        }));
      }

      await loadHealthAndLogs();
      setPrompt('');
      setSql('');
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
          <button className="theme-toggle" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>
        </div>
      </header>

      <section className="chat-grid">
        <section className="panel chat-main">
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
            <Presets onChoose={applyPreset} />
          </div>

          <div className="chat-thread">
            {messages.map((msg) => (
              <article key={msg.id} className={`bubble bubble-${msg.role}`}>
                {msg.type === 'text' ? <p>{msg.text}</p> : null}

                {msg.type === 'questions' ? (
                  <div>
                    <p>{msg.intro}</p>
                    <div className="question-list">
                      {(msg.questions || []).map((q) => (
                        <button key={q} type="button" className="question-chip" onClick={() => setPrompt(q)}>
                          {q}
                        </button>
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
                    <button type="button" className="looks-good" onClick={() => setTableAck(true)}>
                      {tableAck ? 'Table selection confirmed' : 'Looks Good'}
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
                  I confirm selected tables and want execution.
                </label>
              </>
            ) : null}

            <div className="composer-actions">
              <button type="button" disabled={!canSend} onClick={runAgent}>{loading ? 'Running...' : 'Send'}</button>
              <button type="button" className="secondary-btn" onClick={loadHealthAndLogs}>Refresh Health & Logs</button>
              <button type="button" className="secondary-btn" onClick={clearLogs}>Clear Logs</button>
            </div>

            {error ? <p className="error">{error}</p> : null}
          </div>
        </section>

        <aside className="panel chat-side">
          <CitationPanel citations={citations} />
          <div className="panel mini-panel">
            <h3>Intent / Table / Column</h3>
            <pre>{JSON.stringify({ intent, tablePlan, columnPlan, sqlContext }, null, 2)}</pre>
          </div>
          <div className="panel mini-panel">
            <h3>Health</h3>
            <pre>{JSON.stringify(health, null, 2)}</pre>
            <h3>Runtime Logs</h3>
            <pre>{JSON.stringify(logs.runtime || [], null, 2)}</pre>
          </div>
        </aside>
      </section>
    </main>
  );
}
