// Minimal TOML frontmatter parser supporting only the subset we need:
//   - top-level:  key = "string"  |  key = number
//   - section:    [name]  (we use only [extra])
//   - comments:   # line, and trailing on the same line
//   - blank lines
// Not a general TOML parser.

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseFrontmatter(md) {
  const m = md.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+\n?/);
  if (!m) throw new Error('No TOML frontmatter found');
  const lines = m[1].split('\n');

  const top = {};
  const sections = {};
  let currentSection = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;

    const secMatch = line.match(/^\[(\w+)\]$/);
    if (secMatch) {
      currentSection = secMatch[1];
      if (!sections[currentSection]) sections[currentSection] = {};
      continue;
    }

    const kv = line.match(/^(\w+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const [, key, rawVal] = kv;
    const val = rawVal.trim();
    const parsed = /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : stripQuotes(val);

    if (currentSection) sections[currentSection][key] = parsed;
    else top[key] = parsed;
  }

  // Result shape: { title?, date?, extra: { ...known encryption fields } }
  const KNOWN_EXTRA = ['password', 'password_hint', 'remember_days'];
  const result = {
    title: top.title,
    date: top.date != null ? String(top.date) : undefined,
    extra: {},
  };
  for (const k of KNOWN_EXTRA) {
    if (sections.extra && k in sections.extra) result.extra[k] = sections.extra[k];
    else if (k in top) result.extra[k] = top[k];
  }
  return result;
}

export { parseFrontmatter };