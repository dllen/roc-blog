import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readingSrc = readFileSync(resolve(__dirname, 'reading.js'), 'utf8');

function setupDOM(html) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://scp.net.cn/blog/test/' });
  const { window } = dom;
  // Mock IntersectionObserver (not in jsdom by default)
  window.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
