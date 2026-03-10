const REPOS = ['yelo-server', 'yelo-dashboard-angular', 'yelo-marketplace-webapp'];

function includesAny(text, words) {
  return words.some((w) => text.includes(w));
}

export function inferIntent({ mode, prompt }) {
  const q = String(prompt || '').toLowerCase();
  const repos = new Set();

  if (mode === 'flow' || mode === 'architecture') repos.add('yelo-server');
  if (includesAny(q, ['dashboard', 'admin', 'manager', 'merchant'])) repos.add('yelo-dashboard-angular');
  if (includesAny(q, ['marketplace', 'customer', 'buyer', 'checkout', 'cart'])) repos.add('yelo-marketplace-webapp');
  if (includesAny(q, ['api', 'route', 'controller', 'service', 'endpoint'])) repos.add('yelo-server');

  if (repos.size === 0) {
    REPOS.forEach((r) => repos.add(r));
  }

  return {
    domains: Array.from(repos),
    reasoning: `Heuristic intent mapping from prompt keywords and mode=${mode}.`
  };
}
