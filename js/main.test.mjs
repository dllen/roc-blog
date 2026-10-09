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
