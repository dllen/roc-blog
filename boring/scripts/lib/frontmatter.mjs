// Minimal frontmatter parser supporting both TOML (+++) and YAML (---)
// delimiters. Returns the subset of fields relevant to the encryption feature.
//
// Supported in TOML (+++):
//   - top-level: key = "string" | key = number
//   - section:   [name]  (we use only [extra])
//   - line and trailing # comments
//
// Supported in YAML (---):
//   - top-level: key: "string" | key: number | key: bare-string
//   - nested:    key:\n  subkey: value  (we use only `extra`)
//   - line # comments
//
// Not supported (out of scope):
//   - YAML lists, anchors, multi-line strings, flow style
//   - General TOML (datetime, multiline, arrays)
//
// Returns: { title?, date?, extra: { password?, password_hint?, remember_days? } }

const KNOWN_EXTRA = ['password', 'password_hint', 'remember_days'];

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseTomlBlock(body) {
  const lines = body.split('\n');
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
  return { top, sections };
}

function parseYamlBlock(body) {
  const lines = body.split('\n');
  const top = {};
  const nested = {}; // key -> { subkey: value }
  let pendingNested = null; // key whose sub-keys follow on indented lines

  const flush = () => {
    if (pendingNested) {
      nested[pendingNested] = currentNested;
      pendingNested = null;
      currentNested = null;
    }
  };
  let currentNested = null;

  for (const raw of lines) {
    // Strip trailing comments (but not # inside quoted strings — out of scope)
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Nested sub-key (2-space indent under a pending parent)
    const nestedMatch = line.match(/^  (\w+):\s*(.+)$/);
    if (nestedMatch && pendingNested) {
      const [, key, rawVal] = nestedMatch;
      const val = rawVal.trim();
      const parsed = /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : stripQuotes(val);
      currentNested[key] = parsed;
      continue;
    }

    // Anything at column 0 (top-level): flush any pending nested block first
    flush();
    const topMatch = line.match(/^(\w+):\s*(.*)$/);
    if (!topMatch) continue;
    const [, key, rawVal] = topMatch;
    const val = rawVal.trim();

    if (val === '') {
      // `key:` with no value starts a nested block
      pendingNested = key;
      currentNested = {};
      continue;
    }
    const parsed = /^-?\d+(\.\d+)?$/.test(val) ? Number(val) : stripQuotes(val);
    top[key] = parsed;
  }
  flush(); // trailing nested block

  return { top, nested };
}

function mergeResult({ top, sections }, delim) {
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

function mergeYamlResult({ top, nested }) {
  const result = {
    title: top.title,
    date: top.date != null ? String(top.date) : undefined,
    extra: {},
  };
  for (const k of KNOWN_EXTRA) {
    if (nested.extra && k in nested.extra) result.extra[k] = nested.extra[k];
    else if (k in top) result.extra[k] = top[k];
  }
  return result;
}

function parseFrontmatter(md) {
  // Detect delimiter (+++ for TOML, --- for YAML)
  const m = md.match(/^(\+\+\+|---)\n([\s\S]*?)\n\1\n?/);
  if (!m) throw new Error('No TOML/YAML frontmatter found');
  const [, delim, body] = m;

  if (delim === '+++') {
    return mergeResult(parseTomlBlock(body), delim);
  }
  // YAML
  return mergeYamlResult(parseYamlBlock(body));
}

export { parseFrontmatter };