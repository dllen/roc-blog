import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tippingSrc = readFileSync(resolve(__dirname, 'tipping.js'), 'utf8');

const markup = `<!doctype html><html><body>
    <div class="site-actions">
        <button id="tipping-trigger" type="button" aria-expanded="false" aria-haspopup="dialog">coffee</button>
    </div>
    <dialog id="tipping-dialog" aria-label="赞赏">
        <div class="tip-dialog__body">
            <button type="button" data-tipping-close aria-label="关闭赞赏">x</button>
            <details class="tip">
                <summary class="tip__trigger">赞赏</summary>
                <div class="tip__panel"><p>panel</p></div>
            </details>
        </div>
    </dialog>
</body></html>`;

function loadTipping(html = markup) {
    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://scp.net.cn/' });
    dom.window.eval(tippingSrc);
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    return dom;
}

test('initializes without the tipping controls', () => {
    assert.doesNotThrow(() => loadTipping('<!doctype html><html><body></body></html>'));
});

test('trigger opens the dialog, expands the panel, and syncs aria-expanded', () => {
    const dom = loadTipping();
    const { document } = dom.window;
    const trigger = document.getElementById('tipping-trigger');
    const dialog = document.getElementById('tipping-dialog');

    trigger.click();

    assert.equal(dialog.hasAttribute('open'), true, 'dialog must open');
    assert.equal(dialog.querySelector('details').open, true, 'panel must expand');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');

    trigger.click();

    assert.equal(dialog.hasAttribute('open'), false, 'second click must close');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});

test('backdrop click and close button dismiss the dialog', () => {
    const dom = loadTipping();
    const { document, MouseEvent } = dom.window;
    const trigger = document.getElementById('tipping-trigger');
    const dialog = document.getElementById('tipping-dialog');

    trigger.click();
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert.equal(dialog.hasAttribute('open'), false, 'backdrop click must close');

    trigger.click();
    dialog.querySelector('[data-tipping-close]').click();
    assert.equal(dialog.hasAttribute('open'), false, 'close button must close');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});
