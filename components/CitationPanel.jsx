export default function CitationPanel({ citations = [] }) {
  return (
    <aside className="panel citations">
      <h3>Citations</h3>
      {citations.length === 0 ? <p className="muted">No citations yet.</p> : null}
      <ul>
        {citations.map((c, idx) => (
          <li key={`${c.path}-${c.startLine}-${idx}`}>
            <code>{c.path}:{c.startLine}</code>
            <div className="muted">score: {Number(c.score || 0).toFixed(3)}</div>
            {c.preview ? <pre className="citation-preview">{c.preview}</pre> : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
