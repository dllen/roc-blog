import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOgSvg, escapeXml } from './build-og-svg.mjs';

const colors = {
  _fallback: '#52525b',
  spring: '#fbbf24',
  redis: '#dc2626',
};

test('buildOgSvg: includes title, description, date, site name', () => {
  const svg = buildOgSvg({
    title: 'IoC 容器启动流程',
    description: 'refresh() 模板方法模式解析',
    date: '2025-11-13',
    section: 'spring',
    sectionTitle: 'SPRING 源码解读',
    sequence: '02',
    siteName: '码农的自留地',
    siteUrl: 'https://scp.net.cn',
  }, colors);
  assert.match(svg, /<svg[^>]*viewBox="0 0 1200 630"/);
  assert.match(svg, /IoC 容器启动流程/);
  assert.match(svg, /refresh\(\) 模板方法模式解析/);
  assert.match(svg, /2025-11-13/);
  assert.match(svg, /码农的自留地/);
  assert.match(svg, /#fbbf24/, 'should use spring color');
  assert.match(svg, /SPRING 源码解读/);
});

test('buildOgSvg: uses fallback color for unknown section', () => {
  const svg = buildOgSvg({
    title: 'T', description: 'D', date: '2025-01-01',
    section: 'unknown', sectionTitle: 'OTHER', sequence: '1',
    siteName: 'S', siteUrl: 'https://x.com',
  }, colors);
  assert.match(svg, /#52525b/, 'fallback color used');
});

test('buildOgSvg: XML-escapes title with special chars', () => {
  const svg = buildOgSvg({
    title: 'Tom & Jerry "special" <test>',
    description: 'safe', date: '2025-01-01',
    section: 'redis', sectionTitle: 'REDIS', sequence: '1',
    siteName: 'S', siteUrl: 'https://x.com',
  }, colors);
  assert.match(svg, /Tom &amp; Jerry/);
  assert.match(svg, /&quot;special&quot;/);
  assert.match(svg, /&lt;test&gt;/);
});

test('escapeXml: handles all special chars', () => {
  assert.equal(escapeXml('a < b & c > d "e" \'f\''), 'a &lt; b &amp; c &gt; d &quot;e&quot; &apos;f&apos;');
});
