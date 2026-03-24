export default function FloatingComposer({
  prompt,
  onPromptChange,
  onSubmit,
  loading = false,
  showAdvanced = false,
  onToggleAdvanced,
  sql = '',
  onSqlChange,
  modeLabel = 'SQL Copilot',
  onRefresh,
  onSync,
  onClear
}) {
  return (
    <div className="v2-composer-shell">
      <div className="v2-composer-box">
        <div className="v2-composer-head">
          <span className="v2-composer-mode">{modeLabel}</span>
          <span className="v2-composer-hint">Shift+Enter for newline</span>
        </div>
        <div className="v2-composer-input-wrap">
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => onPromptChange?.(e.target.value)}
            placeholder={`Ask Yelo in ${modeLabel}. I will adapt the workflow to this mode.`}
            className="v2-composer-textarea"
          />
        </div>

        <div className="v2-composer-subrow">
          <div className="v2-composer-actions-left">
            <button type="button" className="v2-inline-link" onClick={onToggleAdvanced}>
              {showAdvanced ? 'Hide Advanced Tools' : 'Show Advanced Tools'}
            </button>
          </div>
          <button type="button" disabled={loading || !String(prompt || '').trim()} onClick={onSubmit} className="v2-primary-btn">
            {loading ? 'Running...' : 'Send'}
          </button>
        </div>

        {showAdvanced ? (
          <div className="v2-advanced-panel">
            <label className="v2-field-label">Optional SQL (SELECT/EXPLAIN only)</label>
            <textarea
              rows={3}
              value={sql}
              onChange={(e) => onSqlChange?.(e.target.value)}
              className="v2-composer-sql"
              placeholder="SELECT * FROM tb_jobs LIMIT 50"
            />
            <div className="v2-toolbar">
              <button type="button" className="v2-toolbar-btn" onClick={onRefresh}>Refresh Health & Logs</button>
              <button type="button" className="v2-toolbar-btn" onClick={onSync}>Sync DB Memory</button>
              <button type="button" className="v2-toolbar-btn" onClick={onClear}>Clear Logs</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
