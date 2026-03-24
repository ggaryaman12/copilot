export default function YeloShell({
  children,
  drawer,
  composer,
  mode = 'SQL Copilot',
  modes = [],
  activeMode,
  onModeChange,
  dbStatus = 'Connected',
  provider = 'Ollama',
  onToggleDrawer,
  drawerOpen = false
}) {
  return (
    <main className="v2-shell">
      <section className="v2-main">
        <header className="v2-topbar">
          <div className="v2-topbar-copy">
            <h1>Yelo</h1>
            <p>AI Developer + Data Copilot</p>
          </div>

          <div className="v2-topbar-actions">
            {modes.length ? (
              <div className="v2-mode-switch" role="tablist" aria-label="Copilot mode">
                {modes.map((item) => {
                  const isActive = item.value === activeMode;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`v2-mode-btn ${isActive ? 'v2-mode-btn-active' : ''}`}
                      onClick={() => onModeChange?.(item.value)}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="v2-pill">{mode}</span>
            )}
            <span className={`v2-pill ${dbStatus === 'Connected' ? 'v2-pill-success' : 'v2-pill-warn'}`}>
              DB: {dbStatus}
            </span>
            <span className="v2-pill">{provider}</span>
            <button type="button" className="v2-ghost-btn" onClick={onToggleDrawer}>
              {drawerOpen ? 'Hide Panel' : 'Show Panel'}
            </button>
          </div>
        </header>

        <section className="v2-chat-scroll">
          <div className="v2-chat-inner">{children}</div>
        </section>

        {composer ? <div className="v2-composer-wrap">{composer}</div> : null}
      </section>

      {drawer ? (
        <section className={`v2-drawer-slot ${drawerOpen ? 'v2-drawer-slot-open' : 'v2-drawer-slot-closed'}`}>
          {drawer}
        </section>
      ) : null}
    </main>
  );
}
