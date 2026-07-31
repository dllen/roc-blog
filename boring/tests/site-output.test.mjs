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
    const script = [...document.querySelectorAll('script')]
        .map((script) => script.textContent)
        .find((script) => script.includes('prefers-color-scheme: dark'));
    assert.ok(script, 'theme bootstrap script not found');
    return script;
}

function runThemeBootstrap(script, {
    storedTheme,
    systemDark,
    storageThrows = false,
    matchMediaMissing = false,
    matchMediaThrows = false,
    matchesThrows = false
}) {
    return new JSDOM(`<script>${script}</script>`, {
        runScripts: 'dangerously',
        url: 'https://scp.net.cn/',
        beforeParse(window) {
            if (matchMediaMissing) {
                window.matchMedia = undefined;
            } else if (matchMediaThrows) {
                window.matchMedia = () => {
                    throw new Error('Media query unavailable');
                };
            } else if (matchesThrows) {
                window.matchMedia = () => ({
                    get matches() {
                        throw new Error('Media query result unavailable');
                    }
                });
            } else {
                window.matchMedia = () => ({ matches: systemDark });
            }
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

test('theme bootstrap defaults to light when matchMedia is missing', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), {
        matchMediaMissing: true
    });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), false);
});

test('theme bootstrap defaults to light when matchMedia throws', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), {
        matchMediaThrows: true
    });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), false);
});

test('theme bootstrap defaults to light when the matchMedia matches getter throws', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), {
        matchesThrows: true
    });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), false);
});

test('theme bootstrap treats an invalid saved value as no preference', async () => {
    const dom = runThemeBootstrap(await readThemeBootstrap(), {
        storedTheme: 'invalid',
        systemDark: true
    });

    assert.equal(dom.window.document.documentElement.classList.contains('dark'), true);
});

test('homepage exposes the responsive site navigation controls', async () => {
    const { document } = (await loadOutput('index.html')).window;

    assert.ok(document.querySelector('[data-site-navigation]'));
    assert.ok(document.querySelector('[data-navigation-scroll]'));
    assert.equal(document.querySelectorAll('#darkmode-toggle').length, 1);
    assert.ok(document.querySelector('a[href="/blog/atom.xml"][aria-label="RSS feed"]'));
    assert.equal(document.querySelector('[data-site-brand]')?.getAttribute('aria-current'), 'page');
});

test('section navigation marks only the matching section as current', async () => {
    const { document } = (await loadOutput('blog/spring/index.html')).window;
    const links = [...document.querySelectorAll('[data-navigation-scroll] a')];
    const currentLinks = links.filter((link) => link.getAttribute('aria-current') === 'page');

    assert.equal(currentLinks.length, 1);
    assert.equal(currentLinks[0].getAttribute('href'), '/blog/spring/');
    assert.ok(links.filter((link) => link !== currentLinks[0]).every((link) => !link.hasAttribute('aria-current')));
});

test('later section navigation marks weekly as current', async () => {
    const { document } = (await loadOutput('blog/weekly/index.html')).window;
    const links = [...document.querySelectorAll('[data-navigation-scroll] a')];
    const currentLinks = links.filter((link) => link.getAttribute('aria-current') === 'page');

    assert.equal(currentLinks.length, 1);
    assert.equal(currentLinks[0].getAttribute('href'), '/blog/weekly/');
    assert.ok(links.filter((link) => link !== currentLinks[0]).every((link) => !link.hasAttribute('aria-current')));
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
