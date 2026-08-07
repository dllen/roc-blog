import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const outputDirectory = new URL('../roc-blog/', import.meta.url);
const sourceStylesheet = new URL('../css/style.css', import.meta.url);

async function readOutput(path) {
    return readFile(new URL(path, outputDirectory), 'utf8');
}

async function loadOutput(path) {
    return new JSDOM(await readOutput(path));
}

async function findOutputHtmlPaths(directory = outputDirectory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const paths = [];

    for (const entry of entries) {
        const url = new URL(entry.name, directory);

        if (entry.isDirectory()) {
            url.pathname += '/';
            paths.push(...await findOutputHtmlPaths(url));
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
            paths.push(decodeURIComponent(url.pathname.slice(outputDirectory.pathname.length)));
        }
    }

    return paths;
}

async function findFirstHomepageArticle() {
    const { document } = (await loadOutput('index.html')).window;
    const siteUrl = new URL('https://scp.net.cn/');

    for (const link of document.querySelectorAll('main a[href]')) {
        const href = link.getAttribute('href');
        let url;

        try {
            url = new URL(href, siteUrl);
        } catch {
            continue;
        }

        if (url.origin !== siteUrl.origin || url.pathname === '/') {
            continue;
        }

        const pathname = decodeURIComponent(url.pathname);
        const outputPath = pathname.endsWith('.html')
            ? pathname.replace(/^\/+/, '')
            : `${pathname.replace(/^\/+|\/+$/g, '')}/index.html`;

        try {
            const dom = await loadOutput(outputPath);
            const metadata = [...dom.window.document.querySelectorAll('script[type="application/ld+json"]')]
                .map((script) => script.textContent)
                .find((content) => content.includes('BlogPosting'));

            if (metadata) {
                return { dom, html: await readOutput(outputPath), outputPath };
            }
        } catch {
            continue;
        }
    }

    assert.fail('homepage article output not found');
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

test('homepage exposes the responsive site navigation controls without missing icon assets', async () => {
    const { document } = (await loadOutput('index.html')).window;

    assert.ok(document.querySelector('[data-site-navigation]'));
    assert.ok(document.querySelector('[data-dropdown]'));
    assert.equal(document.querySelectorAll('#darkmode-toggle').length, 1);
    assert.ok(document.querySelector('a[href="/blog/atom.xml"][aria-label="RSS feed"]'));
    assert.equal(document.querySelector('[data-site-brand]')?.getAttribute('aria-current'), 'page');
    assert.equal(document.querySelector('link[href="/line-awesome/css/line-awesome.min.css"]'), null);
});

test('section navigation marks only the matching section as current', async () => {
    const { document } = (await loadOutput('blog/spring/index.html')).window;
    const links = [...document.querySelectorAll('[data-site-navigation] [data-dropdown] a[role="menuitem"]')];
    const currentLinks = links.filter((link) => link.getAttribute('aria-current') === 'page');

    assert.equal(currentLinks.length, 1);
    assert.equal(currentLinks[0].getAttribute('href'), '/blog/spring/');
    assert.ok(links.filter((link) => link !== currentLinks[0]).every((link) => !link.hasAttribute('aria-current')));
});

test('later section navigation marks weekly as current', async () => {
    const { document } = (await loadOutput('blog/weekly/index.html')).window;
    const links = [...document.querySelectorAll('[data-site-navigation] [data-dropdown] a[role="menuitem"]')];
    const currentLinks = links.filter((link) => link.getAttribute('aria-current') === 'page');

    assert.equal(currentLinks.length, 1);
    assert.equal(currentLinks[0].getAttribute('href'), '/blog/weekly/');
    assert.ok(links.filter((link) => link !== currentLinks[0]).every((link) => !link.hasAttribute('aria-current')));
});

test('section pagination uses canonical Zola URLs, one current page, and correct boundaries', async () => {
    const sectionOutputDirectory = new URL('../roc-blog/blog/page/', import.meta.url);
    const pageDirents = await readdir(sectionOutputDirectory, { withFileTypes: true });
    const pageNumbers = pageDirents
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map((entry) => Number(entry.name))
        .filter((number) => number > 1)
        .sort((a, b) => a - b);

    const pagePaths = [
        'blog/index.html',
        ...pageNumbers.map((number) => `blog/page/${number}/index.html`)
    ];
    const expectedPathnames = ['/blog/', ...pageNumbers.map((number) => `/blog/page/${number}/`)];

    for (const [pageOffset, outputPath] of pagePaths.entries()) {
        const { document } = (await loadOutput(outputPath)).window;
        const pagination = document.querySelector('.listing-pagination');
        const numberLinks = [...pagination.querySelectorAll('a:not([aria-label])')];
        const currentLinks = numberLinks.filter((link) => link.getAttribute('aria-current') === 'page');
        const previous = pagination.querySelector('a[aria-label="上一页"]');
        const next = pagination.querySelector('a[aria-label="下一页"]');

        const resolvePathname = (href) => new URL(href, `https://site-output.test${expectedPathnames[pageOffset]}`).pathname;

        assert.deepEqual(
            numberLinks.map((link) => resolvePathname(link.getAttribute('href'))),
            expectedPathnames,
            `${outputPath} numeric pagination URLs`
        );
        assert.equal(currentLinks.length, 1, `${outputPath} current numeric page count`);
        assert.equal(currentLinks[0].textContent.trim(), String(pageOffset + 1));

        if (pageOffset === 0) {
            assert.equal(previous, null);
        } else {
            assert.equal(resolvePathname(previous.getAttribute('href')), expectedPathnames[pageOffset - 1]);
        }

        if (pageOffset === pagePaths.length - 1) {
            assert.equal(next, null);
        } else {
            assert.equal(resolvePathname(next.getAttribute('href')), expectedPathnames[pageOffset + 1]);
        }
    }
});

test('homepage uses the shared editorial article list contract', async () => {
    const { document } = (await loadOutput('index.html')).window;
    const articleList = document.querySelector('[data-article-list]');

    assert.ok(articleList);
    assert.ok(articleList.querySelector('[data-article-row]'));
    assert.equal(document.body.textContent.includes('Views'), false);
    assert.equal(document.querySelector('[data-cover]'), null);
});

test('listing templates do not use desktop-first reverse mobile type classes', async () => {
    const templatesDirectory = new URL('../templates/', import.meta.url);
    const paths = ['index.html', 'section.html', 'taxonomy_list.html', 'taxonomy_single.html', '404.html'];
    const reverseMobileClasses = [
        'text-8xl xl:text-4xl',
        'text-6xl xl:text-2xl',
        'text-4xl xl:text-xl',
        'text-3xl xl:text-base',
        'text-2xl xl:text-sm'
    ];

    for (const path of paths) {
        const source = await readFile(new URL(path, templatesDirectory), 'utf8');
        for (const className of reverseMobileClasses) {
            assert.equal(source.includes(className), false, `${path} contains ${className}`);
        }
    }
});

test('homepage first article uses the editorial article content contract', async () => {
    const { dom, html } = await findFirstHomepageArticle();

    assert.ok(dom.window.document.querySelector('.article-content'));
    assert.doesNotMatch(html, /prose-headings:w-max/);
    assert.doesNotMatch(html, /prose-2xl xl:prose-base/);
});

test('rendered Markdown images use native lazy loading and async decoding', async () => {
    const expectedAlt = 'JVM 内存模型';
    const expectedSrc = '/jvm-memory-model-diagram.svg';
    let renderedImage;

    for (const outputPath of await findOutputHtmlPaths()) {
        const { document } = (await loadOutput(outputPath)).window;
        const image = document.querySelector(`.article-content img[alt="${expectedAlt}"][src="${expectedSrc}"]`);

        if (image) {
            renderedImage = image;
            break;
        }
    }

    assert.ok(renderedImage, 'known Markdown image not found in recursive site output');
    assert.equal(renderedImage.getAttribute('loading'), 'lazy');
    assert.equal(renderedImage.getAttribute('decoding'), 'async');
});

test('article desktop grid keeps the content track fluid within the shell', async () => {
    const css = await readFile(sourceStylesheet, 'utf8');

    assert.match(css, /\.article-shell\s*\{[^}]*max-width:\s*82\.5rem;/s);
    assert.match(css, /\.article-main\s*\{[^}]*max-width:\s*62\.5rem;/s);
    assert.match(
        css,
        /@media\s*\(min-width:\s*1280px\)[\s\S]*?\.article-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+21\.5625rem;[^}]*gap:\s*clamp\(3\.5rem,\s*5vw,\s*4\.5rem\);[^}]*justify-content:\s*center;/s
    );
    assert.doesNotMatch(css, /grid-template-columns:\s*minmax\(0,\s*62\.5rem\)\s+21\.5625rem;/);
});

test('real article uses the wide article layout with responsive table of contents', async () => {
    const { dom } = await findFirstHomepageArticle();
    const { document } = dom.window;

    assert.ok(document.querySelector('[data-article-layout]'));
    assert.ok(document.querySelector('[data-article-main]'));
    assert.ok(document.querySelector('[data-toc-container="desktop"]'));
    assert.ok(document.querySelector('[data-toc-container="mobile"]'));
    assert.equal(document.querySelector('[data-empty-rail]'), null);
});

test('homepage WebSite metadata does not advertise search', async () => {
    const html = await readOutput('index.html');

    assert.doesNotMatch(html, /SearchAction/);
    assert.doesNotMatch(html, /\/search\?q=/);
});

test('source fonts only reference bundled assets', async () => {
    const css = await readFile(new URL('../css/fonts.css', import.meta.url), 'utf8');
    const fontDirectory = new URL('../static/fonts/', import.meta.url);
    const fontFiles = await readdir(fontDirectory);
    const referencedFonts = [...css.matchAll(/url\('\/fonts\/([^']+)'\)/g)].map((match) => match[1]);

    assert.ok(referencedFonts.length > 0);
    for (const font of referencedFonts) {
        assert.ok(fontFiles.includes(font), `${font} is referenced but not bundled`);
    }
});

for (const path of ['index.html', '404.html']) {
    test(`${path} has one main landmark and one footer landmark`, async () => {
        const { document } = (await loadOutput(path)).window;

        assert.equal(document.querySelectorAll('main').length, 1);
        assert.equal(document.querySelectorAll('footer').length, 1);
    });
}
