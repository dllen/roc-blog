import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readingSrc = readFileSync(resolve(__dirname, 'reading.js'), 'utf8');

class FakeIntersectionObserver {
  static instances = [];

  static reset() {
    FakeIntersectionObserver.instances = [];
  }

  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element) {
    this.observed.push(element);
  }

  unobserve(element) {
    this.observed = this.observed.filter(observed => observed !== element);
  }

  disconnect() {
    this.observed = [];
  }

  trigger(element, isIntersecting = true) {
    this.callback([{ target: element, isIntersecting }], this);
  }
}

function setupDOM(html) {
  FakeIntersectionObserver.reset();
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://scp.net.cn/blog/test/' });
  const { window } = dom;
  window.IntersectionObserver = FakeIntersectionObserver;
  window.eval(readingSrc);
  // jsdom doesn't fire DOMContentLoaded after eval; trigger manually
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
  return { dom, window, document: window.document };
}

test('reading: jsdom setup works', () => {
  const { window } = setupDOM('<html><body></body></html>');
  assert.ok(window.document);
});

test('reading: initToc builds toc-list from article h2/h3/h4', () => {
  const html = `<html><body>
    <article>
      <h2 id="a">First</h2>
      <p>text</p>
      <h3 id="b">Second</h3>
      <p>text</p>
      <h4 id="c">Third</h4>
    </article>
    <nav id="toc"><div id="toc-list"></div></nav>
  </body></html>`;
  const { document } = setupDOM(html);
  const list = document.getElementById('toc-list');
  assert.ok(list.innerHTML.includes('First'));
  assert.ok(list.innerHTML.includes('Second'));
  assert.ok(list.innerHTML.includes('Third'));
  assert.equal(document.querySelectorAll('[data-toc-id]').length, 3);
});

test('reading: initToc synchronizes active links across desktop and mobile lists', () => {
  const html = `<html><body>
    <article>
      <h2 id="a">First</h2>
      <h2 id="b">Second</h2>
    </article>
    <nav data-toc-container="desktop"><div id="toc-list"></div></nav>
    <details data-toc-container="mobile"><div id="toc-list-mobile"></div></details>
  </body></html>`;
  const { document } = setupDOM(html);
  const observer = FakeIntersectionObserver.instances[0];
  const [a, b] = document.querySelectorAll('article h2');

  assert.deepEqual(observer.observed, [a, b]);
  assert.equal(observer.options.rootMargin, '-30% 0% -60% 0%');

  observer.trigger(a);
  const aLinks = document.querySelectorAll('[data-toc-id="a"]');
  assert.equal(aLinks.length, 2);
  aLinks.forEach(link => {
    assert.ok(link.hasAttribute('data-active'));
    assert.equal(link.getAttribute('aria-current'), 'location');
  });

  observer.trigger(b);
  aLinks.forEach(link => {
    assert.ok(!link.hasAttribute('data-active'));
    assert.ok(!link.hasAttribute('aria-current'));
  });
  const bLinks = document.querySelectorAll('[data-toc-id="b"]');
  assert.equal(bLinks.length, 2);
  bLinks.forEach(link => {
    assert.ok(link.hasAttribute('data-active'));
    assert.equal(link.getAttribute('aria-current'), 'location');
  });
});

test('reading: initToc hides every toc container when the article has no headings', () => {
  const html = `<html><body>
    <article><p>No sections</p></article>
    <nav data-toc-container="desktop"><div id="toc-list"></div></nav>
    <details data-toc-container="mobile"><div id="toc-list-mobile"></div></details>
  </body></html>`;
  const { document } = setupDOM(html);

  document.querySelectorAll('[data-toc-container]').forEach(container => {
    assert.ok(container.hidden);
  });
  assert.equal(FakeIntersectionObserver.instances.length, 0);
});

test('reading: initToc assigns unique generated IDs to duplicate headings', () => {
  const html = `<html><body>
    <article>
      <h2>Design</h2>
      <h2>Design</h2>
    </article>
    <nav data-toc-container="desktop"><div id="toc-list"></div></nav>
  </body></html>`;
  const { document } = setupDOM(html);
  const headings = document.querySelectorAll('article h2');

  assert.deepEqual(Array.from(headings, heading => heading.id), ['design', 'design-2']);
  assert.deepEqual(
    Array.from(document.querySelectorAll('.anchor-link'), anchor => anchor.getAttribute('href')),
    ['#design', '#design-2']
  );
});

test('reading: initToc preserves the first valid existing ID and uniquifies duplicates', () => {
  const html = `<html><body>
    <article>
      <h2 id="kept">First</h2>
      <h2 id="kept">Second</h2>
      <h2>!!!</h2>
      <h2>!!!</h2>
    </article>
    <nav data-toc-container="desktop"><div id="toc-list"></div></nav>
  </body></html>`;
  const { document } = setupDOM(html);
  const headings = document.querySelectorAll('article h2');

  assert.deepEqual(
    Array.from(headings, heading => heading.id),
    ['kept', 'kept-2', 'section', 'section-2']
  );
});

test('reading: initCodeCopy adds Copy button to each pre', () => {
  const html = `<html><body>
    <article>
      <pre><code>console.log(1)</code></pre>
      <pre><code>console.log(2)</code></pre>
    </article>
  </body></html>`;
  const { document } = setupDOM(html);
  const buttons = document.querySelectorAll('.code-copy');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].textContent, 'Copy');
});

test('reading: initAnchors adds # link to each heading', () => {
  const html = `<html><body>
    <article>
      <h2 id="x">Hello</h2>
      <h3>World</h3>
    </article>
  </body></html>`;
  const { document } = setupDOM(html);
  const anchors = document.querySelectorAll('.anchor-link');
  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].textContent, '#');
});

test('reading: initRelated fetches index and renders top N shared-tag items', async () => {
  const html = `<html><body>
    <section data-related-container
             data-current-permalink="/blog/x/"
             data-current-tags="Spring|源码"
             data-limit="3">
      <h3>Related</h3>
      <div data-related-list></div>
    </section>
  </body></html>`;
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://scp.net.cn/blog/x/' });
  const { window } = dom;
  window.IntersectionObserver = class { observe() {} disconnect() {} };
  // Mock fetch
  window.fetch = async () => ({
    ok: true,
    json: async () => [
      { title: 'A', permalink: '/blog/x/', slug: 'x', section: 'blog', date: '2024-12-01', tags: ['Spring', '源码'] },
      { title: 'B', permalink: '/blog/y/', slug: 'y', section: 'blog', date: '2024-12-02', tags: ['Spring', '源码', 'IoC'] },
      { title: 'C', permalink: '/blog/z/', slug: 'z', section: 'blog', date: '2024-12-03', tags: ['Spring'] },
      { title: 'D', permalink: '/blog/w/', slug: 'w', section: 'blog', date: '2024-12-04', tags: ['Other'] },
    ],
  });
  window.eval(readingSrc);
  if (window.document.readyState === 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
  // Wait for fetch to resolve
  await new Promise(r => setTimeout(r, 50));
  const list = window.document.querySelector('[data-related-list]');
  const items = list.querySelectorAll('a');
  assert.equal(items.length, 2, 'only 2 articles share tags with x');
  assert.ok(items[0].getAttribute('href') === '/blog/y/' || items[0].getAttribute('href') === '/blog/z/',
    'B (shared 3) and C (shared 1) should be top items, x (self) excluded');
});
