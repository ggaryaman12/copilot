export default function InlineTableConfirmCard({
  tables = [],
  selectedTable = '',
  draftSql = '',
  onSelectTable,
  onConfirm,
  onEditSql,
  loading = false,
  onGenerate
}) {
  return (
    <section className="v2-inline-card">
      <div className="v2-inline-card-header">
        <div>
          <p className="v2-inline-card-title">Confirm table before execution</p>
          <p className="v2-inline-card-copy">Pick the exact table, review the generated SQL, then run immediately.</p>
        </div>
        <span className="v2-inline-status">{selectedTable || 'No table selected'}</span>
      </div>

      <div className="v2-inline-card-row">
        <div className="v2-inline-field">
          <label className="v2-field-label">Target table</label>
          <select value={selectedTable} onChange={(e) => onSelectTable?.(e.target.value)} className="v2-inline-select">
            <option value="">Select table</option>
            {tables.map((table) => (
              <option key={table} value={table}>{table}</option>
            ))}
          </select>
        </div>

        <div className="v2-inline-actions">
          <button type="button" onClick={onGenerate} className="v2-toolbar-btn">
            Generate Query
          </button>
          <button type="button" disabled={!selectedTable || loading} onClick={onConfirm} className="v2-primary-btn">
            {loading ? 'Executing...' : 'Compile & Run'}
          </button>
        </div>
      </div>

      <div className="v2-inline-field">
        <label className="v2-field-label">Generated SQL</label>
      </div>
      <textarea
        rows={6}
        value={draftSql}
        onChange={(e) => onEditSql?.(e.target.value)}
        className="v2-inline-sql"
      />
    </section>
  );
}
