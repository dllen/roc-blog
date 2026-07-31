#!/usr/bin/env node
// Inject JSON-LD + OG meta blocks into Zola templates. Idempotent.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] || 'templates');

const BASE_JSONLD_BLOCK = '    {% block jsonld %}{% endblock %}\n';

const PAGE_JSONLD_BLOCK = `{% block jsonld %}
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "{{ page.title }}",
      "datePublished": "{{ page.date }}",
      "dateModified": "{{ page.update_date | default(value=page.date) }}",
      "description": "{{ page.description | default(value='') }}",
      "keywords": "{{ page.taxonomies.tags | default(value=[]) | join(sep=', ') }}",
      "mainEntityOfPage": { "@type": "WebPage", "@id": "{{ page.permalink | safe }}" },
      "author": { "@type": "Person", "name": "roc" }
    }
    </script>
    {% endblock jsonld %}
`;

const INDEX_JSONLD_BLOCK = `{% block jsonld %}
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "{{ config.title }}",
      "url": "{{ config.base_url }}",
      "description": "{{ config.description }}",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "{{ config.base_url }}/search?q={search_term_string}",
        "query-input": "required name=search_term_string"
      }
    }
    </script>
    {% endblock jsonld %}
`;

const SECTION_JSONLD_BLOCK = `{% block jsonld %}
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "{{ section.title }}",
      "description": "{{ section.description | default(value='') }}",
      "url": "{{ section.permalink | safe }}",
      "hasPart": [
        {% for p in section.pages %}
        { "@type": "BlogPosting", "name": "{{ p.title }}", "url": "{{ p.permalink | safe }}" }{% if not loop.last %},{% endif %}
        {% endfor %}
      ]
    }
    </script>
    {% endblock jsonld %}
`;

const transformations = [
  {
    file: 'base.html',
    match: /<\/head>/,
    insert: BASE_JSONLD_BLOCK + '    </head>',
  },
  {
    file: 'page.html',
    match: /\{%\s*block content\s*%\}/,
    insert: PAGE_JSONLD_BLOCK + '{% block content %}',
  },
  {
    file: 'index.html',
    match: /\{%\s*block content\s*%\}/,
    insert: INDEX_JSONLD_BLOCK + '{% block content %}',
  },
  {
    file: 'section.html',
    match: /\{%\s*block content\s*%\}/,
    insert: SECTION_JSONLD_BLOCK + '{% block content %}',
  },
];

let changed = 0;
for (const t of transformations) {
  const filePath = join(root, t.file);
  let source;
  try { source = readFileSync(filePath, 'utf8'); } catch { continue; }

  if (source.includes('{% block jsonld %}')) {
    // Idempotent: already injected
    continue;
  }
  if (!t.match.test(source)) {
    console.log(`[inject] ${t.file}: pattern not found, skipping`);
    continue;
  }

  const newSource = source.replace(t.match, t.insert);
  writeFileSync(filePath, newSource, 'utf8');
  changed++;
  console.log(`[inject] ${t.file}: injected jsonld block`);
}

console.log(`[inject] changed=${changed} of ${transformations.length}`);
process.exit(0);
