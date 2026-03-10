export function tokenize(text = '') {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}
