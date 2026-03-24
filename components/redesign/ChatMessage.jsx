function CitationBadges({ citations = [], onOpenCitation }) {
  if (!citations.length) return null;

  return (
    <div className="v2-citation-badges">
      {citations.map((c) => (
        <button
          key={`${c.path}-${c.startLine}`}
          type="button"
          onClick={() => onOpenCitation?.(c)}
          className="v2-citation-badge"
        >
          [{c.label || c.path?.split('/').pop() || 'source'}]
        </button>
      ))}
    </div>
  );
}

export default function ChatMessage({ role = 'assistant', text = '', citations = [], onOpenCitation, children }) {
  const isUser = role === 'user';

  return (
    <article className={`v2-message-row ${isUser ? 'v2-message-row-user' : 'v2-message-row-assistant'}`}>
      <div className={`v2-message-bubble ${isUser ? 'v2-message-bubble-user' : 'v2-message-bubble-assistant'}`}>
        <p className="v2-message-text">{text}</p>
        <CitationBadges citations={citations} onOpenCitation={onOpenCitation} />
        {children}
      </div>
    </article>
  );
}
