import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBlogPostingJsonLd,
  buildBreadcrumbJsonLd,
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
  buildCollectionPageJsonLd,
} from './build-jsonld.mjs';

const baseSite = {
  name: '码农的自留地',
  url: 'https://scp.net.cn',
  description: '语法 语义 语用',
};

test('buildBlogPostingJsonLd: includes required fields', () => {
  const j = buildBlogPostingJsonLd({
    title: 'T',
    description: 'D',
    date: '2025-11-13',
    updateDate: '2025-12-01',
    url: 'https://scp.net.cn/blog/x/',
    tags: ['A', 'B'],
    seriesName: 'SERIES',
    seriesUrls: ['https://scp.net.cn/blog/a/', 'https://scp.net.cn/blog/x/'],
  }, baseSite);

  assert.equal(j['@context'], 'https://schema.org');
  assert.equal(j['@type'], 'BlogPosting');
  assert.equal(j.headline, 'T');
  assert.equal(j.datePublished, '2025-11-13');
  assert.equal(j.dateModified, '2025-12-01');
  assert.equal(j.description, 'D');
  assert.equal(j.keywords, 'A, B');
  assert.equal(j.mainEntityOfPage['@id'], 'https://scp.net.cn/blog/x/');
  assert.equal(j.isPartOf['@type'], 'CreativeWorkSeries');
  assert.equal(j.isPartOf.name, 'SERIES');
  assert.equal(j.isPartOf.hasPart.length, 2);
});

test('buildBlogPostingJsonLd: uses date when updateDate missing', () => {
  const j = buildBlogPostingJsonLd({
    title: 'T', description: 'D', date: '2025-01-01', url: 'https://x',
    tags: [], seriesName: null, seriesUrls: [],
  }, baseSite);
  assert.equal(j.dateModified, '2025-01-01');
});

test('buildBreadcrumbJsonLd: home > blog > slug', () => {
  const j = buildBreadcrumbJsonLd({
    home: { name: 'Home', url: 'https://scp.net.cn/' },
    sections: [{ name: 'Blog', url: 'https://scp.net.cn/blog/' }],
    current: { name: 'T', url: 'https://scp.net.cn/blog/x/' },
  });
  assert.equal(j['@type'], 'BreadcrumbList');
  assert.equal(j.itemListElement.length, 3);
  assert.equal(j.itemListElement[0].position, 1);
  assert.equal(j.itemListElement[2].name, 'T');
});

test('buildOrganizationJsonLd: includes name, url, logo', () => {
  const j = buildOrganizationJsonLd(baseSite);
  assert.equal(j['@type'], 'Organization');
  assert.equal(j.name, '码农的自留地');
  assert.equal(j.url, 'https://scp.net.cn');
});

test('buildWebSiteJsonLd: includes SearchAction', () => {
  const j = buildWebSiteJsonLd(baseSite, '/search?q={search_term_string}');
  assert.equal(j['@type'], 'WebSite');
  assert.equal(j.potentialAction['@type'], 'SearchAction');
  assert.equal(j.potentialAction.target['@type'], 'EntryPoint');
  assert.equal(j.potentialAction.target.urlTemplate, 'https://scp.net.cn/search?q={search_term_string}');
  assert.equal(j.potentialAction['query-input'], 'required name=search_term_string');
});

test('buildCollectionPageJsonLd: lists section pages', () => {
  const j = buildCollectionPageJsonLd({
    name: 'Spring 源码解读',
    description: 'desc',
    url: 'https://scp.net.cn/blog/spring/',
    pages: [{ name: 'a', url: '/blog/spring/a/' }, { name: 'b', url: '/blog/spring/b/' }],
  }, baseSite);
  assert.equal(j['@type'], 'CollectionPage');
  assert.equal(j.name, 'Spring 源码解读');
  assert.equal(j.hasPart.length, 2);
});
