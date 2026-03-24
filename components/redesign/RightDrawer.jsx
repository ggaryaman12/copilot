function CodeBlock({ code = '' }) {
  return (
    <pre className="v2-code-block">
      {code}
    </pre>
  );
}

export default function RightDrawer({
  tab = 'citations',
  onTabChange,
  citations = [],
  logs = []
}) {
  return (
    <aside className="v2-right-drawer">
      <div className="v2-drawer-tabs">
        <button type="button" className={`v2-drawer-tab ${tab === 'citations' ? 'v2-drawer-tab-active' : ''}`} onClick={() => onTabChange?.('citations')}>
          Citations
        </button>
        <button type="button" className={`v2-drawer-tab ${tab === 'logs' ? 'v2-drawer-tab-active' : ''}`} onClick={() => onTabChange?.('logs')}>
          Logs
        </button>
      </div>

      <div className="v2-drawer-body">
        {tab === 'citations'
          ? citations.map((c, idx) => (
              <article key={`${c.path}-${idx}`} className="v2-drawer-card">
                <p className="v2-drawer-path">{c.path}:{c.startLine}</p>
                <p className="v2-drawer-meta">score: {Number(c.score || 0).toFixed(3)}</p>
                <CodeBlock code={c.preview || ''} />
              </article>
            ))
          : logs.map((l, idx) => (
              <article key={idx} className="v2-drawer-card">
                <CodeBlock code={JSON.stringify(l, null, 2)} />
              </article>
            ))}
      </div>
    </aside>
  );
}
