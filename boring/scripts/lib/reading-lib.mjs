// Pure logic for prev/next + related article computation.
// Used by Tera macros via no I/O — caller passes already-parsed sections.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './parse-frontmatter.mjs';

/**
 * Build a minimal "section" object from a directory of .md files
 * (for testing). In production, Zola passes section.pages directly.
 */
export function fakeSection(dir) {
  const out = { title: dir.split('/').pop(), pages: [] };
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (!name.endsWith('.md') || name.startsWith('_index')) continue;
    const full = join(dir, name);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (!s.isFile()) continue;
    const { data } = parseFrontmatter(readFileSync(full, 'utf8'));
    if (!data.title) continue;
    out.pages.push({
      title: data.title,
      slug: name.replace(/\.md$/, ''),
      date: data.date || '1970-01-01',
      permalink: `/${out.title}/${name.replace(/\.md$/, '')}/`,
      taxonomies: { tags: data.taxonomies?.tags || data.tags || [] },
    });
  }
  out.pages.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

/**
 * Find prev and next articles in the same section by date order.
 * @param {object} section - section with .pages array
 * @param {object} current - the current page (must have .slug)
 * @returns {{ prev: object|null, next: object|null }}
 */
export function findPrevNext(section, current) {
  if (!section || !current) return { prev: null, next: null };
  const idx = section.pages.findIndex(p => p.slug === current.slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? section.pages[idx - 1] : null,
    next: idx < section.pages.length - 1 ? section.pages[idx + 1] : null,
  };
}

/**
 * Find related articles by counting shared tags.
 * @param {object} current - current page with .taxonomies.tags
 * @param {object[]} allSections - array of section objects
 * @param {number} limit - max results
 * @returns {Array<{page: object, shared: number}>} sorted by shared desc, then date desc
 */
export function findRelated(current, allSections, limit = 3) {
  const currentTags = current?.taxonomies?.tags || [];
  if (currentTags.length === 0) return [];

  const candidates = [];
  for (const section of allSections) {
    for (const p of section.pages || []) {
      // Exclude self by permalink
      if (p.permalink === current.permalink) continue;
      const pTags = p.taxonomies?.tags || [];
      const shared = currentTags.filter(t => pTags.includes(t)).length;
      if (shared > 0) {
        candidates.push({ page: p, shared, date: p.date || '1970-01-01' });
      }
    }
  }
  candidates.sort((a, b) => {
    if (b.shared !== a.shared) return b.shared - a.shared;
    return b.date.localeCompare(a.date);
  });
  return candidates.slice(0, limit);
}
