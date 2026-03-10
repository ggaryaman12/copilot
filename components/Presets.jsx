const PRESETS = [
  {
    label: 'Dashboard -> API Flow',
    mode: 'flow',
    prompt: 'Trace how yelo-dashboard-angular calls yelo-server for admin/merchant flows with cited files.'
  },
  {
    label: 'Marketplace -> API Flow',
    mode: 'flow',
    prompt: 'Trace how yelo-marketplace-webapp calls yelo-server for customer-facing flows with cited files.'
  }
];

export default function Presets({ onChoose }) {
  return (
    <div className="panel presets">
      <h3>Saved Presets</h3>
      <div className="preset-grid">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="preset-btn"
            onClick={() => onChoose(preset)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
