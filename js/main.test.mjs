import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(resolve(__dirname, 'main.js'), 'utf8');

function createDOM(html = '<!doctype html><html><body></body></html>') {
    return new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'https://scp.net.cn/',
    });
}

function loadMain(dom) {
    dom.window.eval(mainSrc);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
}

test('initializes without optional controls', () => {
    const dom = createDOM();

    assert.doesNotThrow(() => loadMain(dom));
});

test('dark mode toggle updates the html class, persisted preference, and accessible state', () => {
    const dom = createDOM('<!doctype html><html><body><button id="darkmode-toggle"></button></body></html>');
    const { window } = dom;
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const toggle = window.document.getElementById('darkmode-toggle');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.getAttribute('aria-label'), '启用深色模式');

    toggle.click();

    assert.equal(window.document.documentElement.classList.contains('dark'), true);
    assert.equal(window.localStorage.getItem('is_darkmode_set'), 'true');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(toggle.getAttribute('aria-label'), '启用浅色模式');

    toggle.click();

    assert.equal(window.document.documentElement.classList.contains('dark'), false);
    assert.equal(window.localStorage.getItem('is_darkmode_set'), 'false');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    assert.equal(toggle.getAttribute('aria-label'), '启用深色模式');
});

test('back-to-top becomes visible after scrolling and scrolls to the top when clicked', () => {
    const dom = createDOM('<!doctype html><html><body><button id="back-to-top" class="hidden"></button></body></html>');
    const { window } = dom;
    let scrollToArgs;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1 });
    window.scrollTo = (...args) => {
        scrollToArgs = args;
    };
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    window.dispatchEvent(new window.Event('scroll'));

    assert.equal(window.document.getElementById('back-to-top').classList.contains('hidden'), false);

    window.document.getElementById('back-to-top').click();

    assert.deepEqual(scrollToArgs, [0, 0]);
});

test('localStorage access errors do not break initialization or dark mode clicks', () => {
    const dom = createDOM('<!doctype html><html><body><button id="darkmode-toggle"></button></body></html>');
    const { window } = dom;
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
            throw new Error('storage unavailable');
        },
    });

    assert.doesNotThrow(() => { window.eval(mainSrc); window.document.dispatchEvent(new window.Event('DOMContentLoaded')); });
    assert.doesNotThrow(() => window.document.getElementById('darkmode-toggle').click());
    assert.equal(window.document.documentElement.classList.contains('dark'), true);
});

test('nav dropdown trigger toggles aria-expanded and panel visibility', () => {
    const html = `
        <!doctype html><html><body>
        <div class="site-dropdown" data-dropdown>
            <button class="site-dropdown__trigger" aria-haspopup="true" aria-expanded="false">trigger</button>
            <div class="site-dropdown__panel"></div>
        </div>
        </body></html>`;
    const dom = createDOM(html);
    const { window } = dom;
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const trigger = window.document.querySelector('.site-dropdown__trigger');
    const panel = window.document.querySelector('.site-dropdown__panel');

    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hasAttribute('data-open'), false);

    trigger.click();

    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(panel.hasAttribute('data-open'), true);

    trigger.click();

    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hasAttribute('data-open'), false);
});

test('nav dropdown closes on outside click and Escape', () => {
    const html = `
        <!doctype html><html><body>
        <div class="site-dropdown" data-dropdown>
            <button class="site-dropdown__trigger" aria-haspopup="true" aria-expanded="false">trigger</button>
            <div class="site-dropdown__panel"></div>
        </div>
        <p id="outside">outside</p>
        </body></html>`;
    const dom = createDOM(html);
    const { window } = dom;
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const trigger = window.document.querySelector('.site-dropdown__trigger');
    const panel = window.document.querySelector('.site-dropdown__panel');

    trigger.click();
    assert.equal(panel.hasAttribute('data-open'), true);

    window.document.getElementById('outside').dispatchEvent(new window.Event('click', { bubbles: true }));
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hasAttribute('data-open'), false);

    trigger.click();
    assert.equal(panel.hasAttribute('data-open'), true);

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(panel.hasAttribute('data-open'), false);
});

test('mobile nav toggle opens and closes the drawer, swapping icons', () => {
    const html = `
        <!doctype html><html><body>
        <button id="mobile-nav-toggle" type="button" aria-controls="site-mobile-drawer" aria-expanded="false" aria-label="打开导航">
            <i data-icon-open></i>
            <i data-icon-close hidden></i>
        </button>
        <div id="site-mobile-drawer" class="site-mobile-drawer" data-mobile-nav hidden></div>
        <div id="site-mobile-drawer-backdrop" data-mobile-nav-backdrop hidden></div>
        </body></html>`;
    const dom = createDOM(html);
    const { window } = dom;
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const toggle = window.document.getElementById('mobile-nav-toggle');
    const drawer = window.document.getElementById('site-mobile-drawer');
    const backdrop = window.document.getElementById('site-mobile-drawer-backdrop');
    const iconOpen = window.document.querySelector('[data-icon-open]');
    const iconClose = window.document.querySelector('[data-icon-close]');

    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.hasAttribute('hidden'), true);
    assert.equal(backdrop.hasAttribute('hidden'), true);
    assert.equal(iconOpen.hidden, false);
    assert.equal(iconClose.hidden, true);

    toggle.click();

    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(toggle.getAttribute('aria-label'), '关闭导航');
    assert.equal(drawer.hasAttribute('hidden'), false);
    assert.equal(drawer.hasAttribute('data-open'), true);
    assert.equal(backdrop.hasAttribute('hidden'), false);
    assert.equal(iconOpen.hidden, true);
    assert.equal(iconClose.hidden, false);

    toggle.click();

    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.hasAttribute('hidden'), true);
    assert.equal(backdrop.hasAttribute('hidden'), true);
});

test('mobile drawer closes when the backdrop is clicked or Escape is pressed', () => {
    const html = `
        <!doctype html><html><body>
        <button id="mobile-nav-toggle" type="button" aria-controls="site-mobile-drawer" aria-expanded="false">
            <i data-icon-open></i>
            <i data-icon-close hidden></i>
        </button>
        <div id="site-mobile-drawer" data-mobile-nav hidden></div>
        <div id="site-mobile-drawer-backdrop" data-mobile-nav-backdrop hidden></div>
        </body></html>`;
    const dom = createDOM(html);
    const { window } = dom;
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const toggle = window.document.getElementById('mobile-nav-toggle');
    const drawer = window.document.getElementById('site-mobile-drawer');
    const backdrop = window.document.getElementById('site-mobile-drawer-backdrop');

    toggle.click();
    assert.equal(drawer.hasAttribute('hidden'), false);

    backdrop.dispatchEvent(new window.Event('click'));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.hasAttribute('hidden'), true);
    assert.equal(backdrop.hasAttribute('hidden'), true);

    toggle.click();
    assert.equal(drawer.hasAttribute('hidden'), false);

    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.hasAttribute('hidden'), true);
});

test('mobile drawer closes when a drawer link is clicked', () => {
    const html = `
        <!doctype html><html><body>
        <button id="mobile-nav-toggle" type="button" aria-controls="site-mobile-drawer" aria-expanded="false">
            <i data-icon-open></i>
            <i data-icon-close hidden></i>
        </button>
        <div id="site-mobile-drawer" data-mobile-nav hidden>
            <a href="/blog/spring/">Spring 源码</a>
        </div>
        <div id="site-mobile-drawer-backdrop" data-mobile-nav-backdrop hidden></div>
        </body></html>`;
    const dom = createDOM(html);
    const { window } = dom;
    window.eval(mainSrc);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    const toggle = window.document.getElementById('mobile-nav-toggle');
    const drawer = window.document.getElementById('site-mobile-drawer');
    const link = drawer.querySelector('a');

    toggle.click();
    assert.equal(drawer.hasAttribute('hidden'), false);

    link.click();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(drawer.hasAttribute('hidden'), true);
});
