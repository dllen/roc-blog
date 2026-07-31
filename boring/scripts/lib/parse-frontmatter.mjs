// Pure frontmatter parser. Supports both YAML (---) and TOML (+++).
// Output: { format: 'yaml'|'toml'|null, data: object, body: string, warnings: string[] }
//
// This is intentionally a hand-rolled parser: it only extracts the fields
// the rest of the content-governance pipeline needs. For complex nested
// structures, fields are preserved as raw strings or arrays.

const YAML_DELIM = '---';
const TOML_DELIM = '+++';

export function parseFrontmatter(source) {
  const warnings = [];
  const lines = source.split(/\r?\n/);
  if (lines.length === 0) {
    return { format: null, data: {}, body: '', warnings };
  }

  const first = lines[0].trim();
  if (first !== YAML_DELIM && first !== TOML_DELIM) {
    return { format: null, data: {}, body: source, warnings };
  }

  const delim = first;
  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === delim) { endIdx = i; break; }
  }
  if (endIdx === -1) {
    warnings.push('frontmatter_not_closed');
    return { format: delim === YAML_DELIM ? 'yaml' : 'toml', data: {}, body: source, warnings };
  }

  const fmBlock = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');

  let data;
  try {
    data = delim === YAML_DELIM ? parseYaml(fmBlock, warnings) : parseToml(fmBlock, warnings);
  } catch (err) {
    warnings.push(`parse_error: ${err.message}`);
    data = {};
  }

  return {
    format: delim === YAML_DELIM ? 'yaml' : 'toml',
    data,
    body,
    warnings,
  };
}

// --- YAML subset parser: key: value, arrays with [...], nested with indentation
function parseYaml(block, warnings) {
  const out = {};
  const lines = block.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
    const m = line.match(/^(\s*)([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) { warnings.push(`yaml_unparsed_line: ${line}`); i++; continue; }
    const [, indent, key, rest] = m;
    const trimmed = rest.trim();
    if (trimmed === '' || trimmed === '|' || trimmed === '>') {
      // Nested block or scalar; collect indented lines
      const nested = [];
      const baseIndent = indent.length + 2;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trim() === '' || next.length - next.trimStart().length >= baseIndent) {
          nested.push(next);
          i++;
        } else break;
      }
      // Recursively parse nested block (so `extra:\n  foo: bar` becomes {foo:'bar'})
      out[key] = parseYaml(nested.join('\n'), warnings);
    } else if (trimmed.startsWith('[') && !trimmed.endsWith(']')) {
      // Multi-line array
      const arr = [trimmed.slice(1).replace(/,$/, '').trim()];
      const keyIndent = indent.length;
      let closed = false;
      i++;
      while (i < lines.length) {
        const next = lines[i];
        const nextTrim = next.trim();
        const nextIndent = next.length - next.trimStart().length;
        if (nextTrim === ']') { i++; closed = true; break; }
        if (nextIndent <= keyIndent && nextTrim !== '') {
          warnings.push(`yaml_unclosed_array_at: ${key}`);
          break;
        }
        arr.push(nextTrim.replace(/,$/, '').replace(/^["']|["']$/g, '').trim());
        i++;
      }
      if (!closed) warnings.push(`yaml_unclosed_array_at: ${key}`);
      out[key] = arr.filter(Boolean);
    } else {
      out[key] = parseValue(trimmed);
      i++;
    }
  }
  return out;
}

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v.startsWith('[') && v.endsWith(']')) {
    return v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  }
  return v;
}

// --- TOML subset parser: key = value, [section] headers, arrays with [...]
function parseToml(block, warnings) {
  const out = {};
  let current = out;
  const lines = block.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      const path = sec[1].split('.');
      current = out;
      for (const p of path) {
        if (!current[p]) current[p] = {};
        current = current[p];
      }
      continue;
    }
    const m = line.match(/^([A-Za-z_][\w-]*)\s*=\s*(.*)$/);
    if (!m) { warnings.push(`toml_unparsed_line: ${line}`); continue; }
    const [, key, raw] = m;
    current[key] = parseValue(raw.trim());
  }
  return out;
}
