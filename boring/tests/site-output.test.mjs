import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const outputDirectory = new URL('../roc-blog/', import.meta.url);

async function readOutput(path) {
    return readFile(new URL(path, outputDirectory), 'utf8');
}

async function loadOutput(path) {
    return new JSDOM(await readOutput(path));
}

async function readThemeBootstrap() {
    const { document } = (await loadOutput('index.html')).window;
    return [...document.querySelectorAll('script')]
        .map((script) => script.textContent)
        .find((script) => script.includes('prefers-color-scheme: dark'));
}

function runThemeBootstrap(script, { storedTheme, systemDark, storageThrows = false }) {
    return new JSDOM(`<script>${script}</script>`, {
        runScripts: 'dangerously',
        url: 'https://scp.net.cn/',
        beforeParse(window) {
            window.matchMedia = () => ({ matches: systemDark });
            if (storageThrows) {
                Object.defineProperty(window, 'localStorage', {
                    get() {
                        throw new Error('Storage unavailable');
                    }
                });
            } else if (storedTheme !== undefined) {
                window.localStorage.setItem('is_darkmode_set', storedTheme);
            }
        }
    });
}

test('homepage declares the Chinese language and exact viewport contract', async () => {
    const { document } = (await loadOutput('index.html')).window;

    assert.equal(document.documentElement.lang, 'zh-CN');
    assert.equal(
        document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
        'width=device-width,initial-scale=1'
    );
});

test('theme bootstrap precedes the primary stylesheet and reads the saved preference', async () => {
    const html = await readOutput('index.html');
    const stylesheetPosition = html.indexOf('/css/style.css');
    const bootstrapPosition = html.indexOf('prefers-color-scheme: dark');

    assert.notEqual(bootstrapPosition, -1);
    assert.ok(bootstrapPosition < stylesheetPosition);
    assert.match(html.slice(bootstrapPosition, stylesheetPosition), /is_darkmode_set/);
});

test('theme bootstrap gives an explicit light preference priority over a dark system preference', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), {
        storedTheme: 'false',
        systemDark: true
    });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), false);
});

test('theme bootstrap uses the system preference when no saved preference exists', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), { systemDark: true });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), true);
});

test('theme bootstrap falls back to the system preference when storage is unavailable', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), {
        systemDark: true,
        storageThrows: true
    });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), true);
});

test('homepage WebSite metadata does not advertise search', async () => {
    const html = await readOutput('index.html');

    assert.doesNotMatch(html, /SearchAction/);
    assert.doesNotMatch(html, /\/search\?q=/);
});

for (const path of ['index.html', '404.html']) {
    test(`${path} has one main landmark and one footer landmark`, async () => {
        const { document } = (await loadOutput(path)).window;

        assert.equal(document.querySelectorAll('main').length, 1);
        assert.equal(document.querySelectorAll('footer').length, 1);
    });
}
