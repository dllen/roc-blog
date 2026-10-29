import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const consentSrc = readFileSync(resolve(__dirname, 'consent.js'), 'utf8');

function createDOM(html = '<!doctype html><html><body></body></html>', url = 'https://scp.net.cn/') {
    return new JSDOM(html, { runScripts: 'dangerously', url });
}

function loadConsent(dom) {
    dom.window.eval(consentSrc);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
}

const sampleConfig = JSON.stringify({
    client: 'ca-pub-3563451416072185',
    slots: {
        articleIntro: '1111111111',
        articleRelated: '2222222222',
        home: '3333333333',
    },
});

function pageWith(opts) {
    const cfg = opts.config || sampleConfig;
    const banner = opts.banner !== false
        ? '<div id="consent-banner" hidden><button data-consent-accept>A</button><button data-consent-reject>R</button></div>'
        : '';
    const article = opts.article || '';
    const home = opts.home || '';
    return `<!doctype html><html><body><script id="adsense-config" type="application/json">${cfg}</script>${banner}${article}${home}</body></html>`;
}

test('does nothing when adsense-config is missing', () => {
    const dom = createDOM('<!doctype html><html><body><div id="consent-banner"></div></body></html>');
    const { window } = dom;

    assert.doesNotThrow(() => loadConsent(dom));

    const banner = window.document.getElementById('consent-banner');
    assert.equal(banner.hidden, false, 'banner stays in default state when config absent');
    assert.equal(window.localStorage.getItem('adsense_consent'), null);
});

test('keeps banner hidden when consent already granted', () => {
    const dom = createDOM(pageWith({}), 'https://scp.net.cn/');
    const { window } = dom;
    window.localStorage.setItem('adsense_consent', 'granted');

    loadConsent(dom);

    const banner = window.document.getElementById('consent-banner');
    assert.equal(banner.hidden, true);

    const dl = window.dataLayer || [];
    const last = dl[dl.length - 1];
    assert.equal(last.ad_storage, 'granted', 'signals AdSense to enable personalized ads');
});

test('keeps banner hidden when consent already denied', () => {
    const dom = createDOM(pageWith({}), 'https://scp.net.cn/');
    const { window } = dom;
    window.localStorage.setItem('adsense_consent', 'denied');

    loadConsent(dom);

    const banner = window.document.getElementById('consent-banner');
    assert.equal(banner.hidden, true);

    const dl = window.dataLayer || [];
    const last = dl[dl.length - 1];
    assert.equal(last.ad_storage, 'denied', 'explicit denied signal (default already denied)');
});

test('shows banner on first visit and accept writes granted + signals', () => {
    const dom = createDOM(pageWith({}), 'https://scp.net.cn/');
    const { window } = dom;

    loadConsent(dom);

    const banner = window.document.getElementById('consent-banner');
    assert.equal(banner.hidden, false, 'banner visible on first visit');

    const acceptBtn = banner.querySelector('[data-consent-accept]');
    acceptBtn.click();

    assert.equal(window.localStorage.getItem('adsense_consent'), 'granted');
    assert.equal(banner.hidden, true);

    const dl = window.dataLayer || [];
    const last = dl[dl.length - 1];
    assert.equal(last.ad_storage, 'granted');
});

test('reject writes denied and hides banner', () => {
    const dom = createDOM(pageWith({}), 'https://scp.net.cn/');
    const { window } = dom;

    loadConsent(dom);

    const banner = window.document.getElementById('consent-banner');
    const rejectBtn = banner.querySelector('[data-consent-reject]');
    rejectBtn.click();

    assert.equal(window.localStorage.getItem('adsense_consent'), 'denied');
    assert.equal(banner.hidden, true);

    const dl = window.dataLayer || [];
    const last = dl[dl.length - 1];
    assert.equal(last.ad_storage, 'denied');
});

test('accept triggers adsbygoogle.push to fill slots', () => {
    const dom = createDOM(pageWith({ article: '<article><div class="article-content"><h2>X</h2><p>body</p></div></article>' }));
    const { window } = dom;

    loadConsent(dom);

    window.adsbygoogle = [];
    const banner = window.document.getElementById('consent-banner');
    banner.querySelector('[data-consent-accept]').click();

    assert.equal(window.adsbygoogle.length, 1, 'fills queued on accept');
    assert.equal(typeof window.adsbygoogle[0], 'object');
});

test('injects article intro ad slot after first h2', () => {
    const html = pageWith({
        article: '<article><div class="article-content"><p>intro</p><h2>First</h2><p>body1</p><h2>Second</h2><p>body2</p></div></article>',
    });
    const dom = createDOM(html);
    const { window } = dom;

    loadConsent(dom);

    const slots = window.document.querySelectorAll('.ad-slot--article-intro');
    assert.equal(slots.length, 1, 'one intro slot');

    const ins = slots[0].querySelector('ins.adsbygoogle');
    assert.equal(ins.getAttribute('data-ad-client'), 'ca-pub-3563451416072185');
    assert.equal(ins.getAttribute('data-ad-slot'), '1111111111');
    assert.equal(ins.getAttribute('data-ad-format'), 'auto');
    assert.equal(ins.getAttribute('data-full-width-responsive'), 'true');

    const content = window.document.querySelector('.article-content');
    const children = Array.from(content.children);
    const h2FirstIdx = children.findIndex(function (c) { return c.tagName === 'H2'; });
    assert.equal(children[h2FirstIdx + 1].classList.contains('ad-slot--article-intro'), true, 'slot sits right after first h2');
});

test('skips article intro injection when no h2 exists', () => {
    const html = pageWith({
        article: '<article><div class="article-content"><p>only intro</p></div></article>',
    });
    const dom = createDOM(html);
    const { window } = dom;

    loadConsent(dom);

    assert.equal(window.document.querySelectorAll('.ad-slot--article-intro').length, 0);
});

test('injects homepage ad slot after 4th article row', () => {
    const items = [];
    for (let i = 0; i < 10; i++) items.push(`<li class="article-row"><a>#${i}</a></li>`);
    const html = pageWith({
        home: `<ul id="article-list">${items.join('')}</ul>`,
    });
    const dom = createDOM(html);
    const { window } = dom;

    loadConsent(dom);

    const homeSlot = window.document.querySelector('.ad-slot--home');
    assert.ok(homeSlot, 'home slot exists');
    assert.equal(homeSlot.tagName, 'LI', 'home slot is a list item');

    const ins = homeSlot.querySelector('ins.adsbygoogle');
    assert.equal(ins.getAttribute('data-ad-slot'), '3333333333');

    const list = window.document.getElementById('article-list');
    const kids = Array.from(list.children);
    const idx = kids.findIndex(function (c) { return c.classList.contains('ad-slot--home'); });
    assert.equal(idx, 4, 'home slot is the 5th child (after 4 article rows)');
});

test('skips homepage injection when fewer than 4 items', () => {
    const html = pageWith({
        home: '<ul id="article-list"><li class="article-row"><a>only</a></li></ul>',
    });
    const dom = createDOM(html);
    const { window } = dom;

    loadConsent(dom);

    assert.equal(window.document.querySelectorAll('.ad-slot--home').length, 0);
});

test('skips slot injection when slot ID is empty', () => {
    const cfg = JSON.stringify({
        client: 'ca-pub-3563451416072185',
        slots: { articleIntro: '', articleRelated: '', home: '' },
    });
    const html = pageWith({
        config: cfg,
        article: '<article><div class="article-content"><h2>X</h2></div></article>',
        home: '<ul id="article-list"><li></li><li></li><li></li><li></li><li></li></ul>',
    });
    const dom = createDOM(html);
    const { window } = dom;

    loadConsent(dom);

    assert.equal(window.document.querySelectorAll('.adsbygoogle').length, 0);
});

test('malformed config is ignored gracefully', () => {
    const html = '<!doctype html><html><body><script id="adsense-config" type="application/json">{not json</script><div id="consent-banner"></div></body></html>';
    const dom = createDOM(html);
    const { window } = dom;

    assert.doesNotThrow(() => loadConsent(dom));
    assert.equal(window.document.getElementById('consent-banner').hidden, false);
});

test('localStorage access errors do not break init', () => {
    const dom = createDOM(pageWith({ banner: false }));
    const { window } = dom;

    Object.defineProperty(window, 'localStorage', {
        get: function () { throw new Error('SecurityError'); },
        configurable: true,
    });

    assert.doesNotThrow(() => loadConsent(dom));
});