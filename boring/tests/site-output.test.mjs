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

test('section navigation marks only the matching group as current', async () => {
    const { document } = (await loadOutput('blog/spring/index.html')).window;
    const topLevel = [
        ...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-nav__item, [data-site-navigation] [data-site-nav] button.site-nav__item'),
    ];
    const dropdownItems = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-dropdown__item')];

    const currentTopLevel = topLevel.filter((el) => el.getAttribute('aria-current') === 'page');
    const currentChildren = dropdownItems.filter((el) => el.getAttribute('aria-current') === 'page');

    assert.equal(currentTopLevel.length, 1, 'exactly one top-level nav entry must be marked current');
    assert.equal(currentChildren.length, 1, 'exactly one dropdown child must be marked current');
    assert.equal(currentChildren[0].getAttribute('href'), '/blog/spring/');
    assert.ok(
        topLevel.filter((el) => el !== currentTopLevel[0]).every((el) => !el.hasAttribute('aria-current')),
        'non-current top-level entries must not be marked current'
    );
    assert.ok(
        dropdownItems.filter((el) => el !== currentChildren[0]).every((el) => !el.hasAttribute('aria-current')),
        'non-current dropdown children must not be marked current'
    );
});

test('later section navigation marks weekly as current', async () => {
    const { document } = (await loadOutput('blog/weekly/index.html')).window;
    const topLevel = [
        ...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-nav__item, [data-site-navigation] [data-site-nav] button.site-nav__item'),
    ];
    const dropdownItems = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-dropdown__item')];

    const currentTopLevel = topLevel.filter((el) => el.getAttribute('aria-current') === 'page');
    const currentChildren = dropdownItems.filter((el) => el.getAttribute('aria-current') === 'page');

    assert.equal(currentTopLevel.length, 1);
    assert.equal(currentChildren.length, 1);
    assert.equal(currentChildren[0].getAttribute('href'), '/blog/weekly/');
    assert.ok(topLevel.filter((el) => el !== currentTopLevel[0]).every((el) => !el.hasAttribute('aria-current')));
    assert.ok(dropdownItems.filter((el) => el !== currentChildren[0]).every((el) => !el.hasAttribute('aria-current')));
});

test('homepage exposes the responsive site navigation controls without missing icon assets', async () => {
    const { document } = (await loadOutput('index.html')).window;

    assert.ok(document.querySelector('[data-site-navigation]'));
    assert.ok(document.querySelector('[data-site-nav]'));
    assert.equal(document.querySelectorAll('#darkmode-toggle').length, 1);
    assert.ok(document.querySelector('a[href="/blog/atom.xml"][aria-label="RSS feed"]'));
    assert.equal(document.querySelector('[data-site-brand]')?.getAttribute('aria-current'), 'page');
    assert.equal(document.querySelector('link[href="/line-awesome/css/line-awesome.min.css"]'), null);
    assert.ok(document.querySelector('#mobile-nav-toggle'), 'mobile nav toggle must exist');
    assert.ok(document.querySelector('#site-mobile-drawer'), 'mobile drawer must exist');
});

test('top-level nav groups collapse the previous flat list into 5 group triggers', async () => {
    const { document } = (await loadOutput('index.html')).window;
    const flatItems = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-nav__item')];
    const groupTriggers = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] button.site-nav__item')];
    const dropdownPanels = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] .site-dropdown__panel')];
    const dropdownItems = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-dropdown__item')];

    assert.equal(flatItems.length, 1, 'only the standalone 分类 link must remain a plain nav item');
    assert.equal(flatItems[0].getAttribute('href'), '/blog/sections/');
    assert.equal(groupTriggers.length, 4, 'four group triggers must be present (后端/AI/翻译/其他)');
    assert.equal(dropdownPanels.length, 4, 'each group must render a dropdown panel');
    assert.equal(dropdownItems.length, 19, 'all 19 grouped sections must be reachable as dropdown children');
    assert.equal(
        groupTriggers.every((el) => el.getAttribute('aria-expanded') === 'false'),
        true,
        'all group triggers must start collapsed'
    );
    assert.equal(
        groupTriggers.every((el) => el.getAttribute('aria-haspopup') === 'true'),
        true,
        'all group triggers must declare aria-haspopup'
    );
});

test('group triggers hide dropdown panels until clicked open', async () => {
    const { document } = (await loadOutput('index.html')).window;
    const panels = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] .site-dropdown__panel')];

    assert.equal(
        panels.every((panel) => !panel.hasAttribute('data-open')),
        true,
        'every dropdown panel must start without data-open'
    );
});

test('sections landing page does not link to itself', async () => {
    const { document } = (await loadOutput('blog/sections/index.html')).window;
    const sectionCards = [...document.querySelectorAll('a.section-card[href]')];
    const selfReferences = sectionCards.filter(
        (link) => link.getAttribute('href') === document.querySelector('link[rel="canonical"]')?.getAttribute('href')
            || link.getAttribute('href') === '/blog/sections/'
    );

    assert.equal(selfReferences.length, 0, 'sections landing must not contain a card linking back to itself');
});

test('sections landing exposes data-section slugs for future filtering', async () => {
    const { document } = (await loadOutput('blog/sections/index.html')).window;
    const sectionCards = [...document.querySelectorAll('a.section-card[href]')];

    assert.equal(sectionCards.length, 22, '22 non-self subsections must remain after the self-ref guard');

    const cardsWithDataSection = sectionCards.filter((card) => card.getAttribute('data-section'));
    assert.equal(cardsWithDataSection.length, sectionCards.length, 'every section card must declare data-section');

    const slugs = cardsWithDataSection.map((card) => card.getAttribute('data-section'));
    assert.ok(slugs.every((slug) => /^[a-z][a-z0-9-]*$/.test(slug)), 'data-section values must be kebab-case slugs');
    assert.equal(new Set(slugs).size, slugs.length, 'data-section values must be unique across cards');
    assert.ok(!slugs.includes('sections'), 'data-section values must omit the self-reference slug');
});

test('paper-reading landing exposes data-section=paper-reading on every article card', async () => {
    const { document } = (await loadOutput('blog/paper-reading/index.html')).window;
    const sectionCards = [...document.querySelectorAll('a.section-card[href]')]
        .filter((link) => new URL(link.getAttribute('href'), document.baseURI).pathname.startsWith('/blog/paper-reading/'));

    assert.equal(sectionCards.length, 30);
    assert.ok(
        sectionCards.every((card) => card.getAttribute('data-section') === 'paper-reading'),
        'every paper-reading article card must declare data-section=paper-reading'
    );
});

test('paper-reading landing renders 30 article cards across 3 collapsible groups', async () => {
    const { document } = (await loadOutput('blog/paper-reading/index.html')).window;

    assert.equal(
        document.querySelector('h1.article-title')?.textContent?.trim(),
        '通俗易懂讲论文',
        'paper-reading landing must show series title as article hero'
    );

    const groups = [...document.querySelectorAll('details.paper-group')];
    assert.equal(groups.length, 3, 'paper-reading landing must expose exactly 3 paper-group collapsibles');

    const findGroup = (needle) => groups.find((g) => g.querySelector('.paper-group__title')?.textContent?.includes(needle));
    const methodologyGroup = findGroup('方法论');
    const classicGroup = findGroup('经典论文详细版');
    const recentGroup = findGroup('近期 LLM/Agent 论文');

    assert.ok(methodologyGroup?.hasAttribute('open'), 'methodology group must default to open');
    assert.ok(!classicGroup?.hasAttribute('open'), 'classic group must default to closed');
    assert.ok(!recentGroup?.hasAttribute('open'), 'recent group must default to closed');

    assert.equal(methodologyGroup.querySelectorAll('a.section-card[href]').length, 1, 'methodology group must list 1 paper');
    assert.equal(classicGroup.querySelectorAll('a.section-card[href]').length, 8, 'classic group must list 8 papers');
    assert.equal(recentGroup.querySelectorAll('a.section-card[href]').length, 21, 'recent group must list 21 papers');

    const totalCards = [...document.querySelectorAll('a.section-card[href]')]
        .filter((link) => new URL(link.getAttribute('href'), document.baseURI).pathname.startsWith('/blog/paper-reading/'))
        .length;
    assert.equal(totalCards, 30, 'paper-reading landing must list exactly 30 article cards in total');
});

test('paper-reading sample article is reachable with rendered content', async () => {
    const { document } = (await loadOutput('blog/paper-reading/transformer-explained-in-detail/index.html')).window;

    assert.ok(document.querySelector('main#main-content'), 'article page must have main landmark');
    assert.ok(
        document.querySelector('article.article-main h1.article-title')?.textContent?.includes('Transformer'),
        'article title must include the paper name'
    );
    assert.equal(
        document.querySelector('meta[property="og:type"]')?.getAttribute('content'),
        'article',
        'paper-reading articles must declare og:type=article for rich social previews'
    );
});

test('paper-reading is registered in the global site navigation as a dropdown child', async () => {
    const { document } = (await loadOutput('index.html')).window;
    const dropdownItems = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-dropdown__item')];
    const paperReadingLink = dropdownItems.find((link) => link.getAttribute('href') === '/blog/paper-reading/');

    assert.ok(paperReadingLink, 'homepage nav must include paper-reading as a dropdown item');
    assert.equal(paperReadingLink.textContent.trim(), '论文阅读');
});

test('section navigation marks paper-reading group as current on its own page', async () => {
    const { document } = (await loadOutput('blog/paper-reading/index.html')).window;
    const topLevel = [
        ...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-nav__item, [data-site-navigation] [data-site-nav] button.site-nav__item'),
    ];
    const dropdownItems = [...document.querySelectorAll('[data-site-navigation] [data-site-nav] a.site-dropdown__item')];

    const currentTopLevel = topLevel.filter((el) => el.getAttribute('aria-current') === 'page');
    const currentChildren = dropdownItems.filter((el) => el.getAttribute('aria-current') === 'page');

    assert.equal(currentTopLevel.length, 1, 'exactly one group trigger must be marked current');
    assert.equal(currentChildren.length, 1, 'exactly one dropdown child must be marked current');
    assert.equal(currentChildren[0].getAttribute('href'), '/blog/paper-reading/');
    assert.ok(topLevel.filter((el) => el !== currentTopLevel[0]).every((el) => !el.hasAttribute('aria-current')));
    assert.ok(dropdownItems.filter((el) => el !== currentChildren[0]).every((el) => !el.hasAttribute('aria-current')));
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

    assert.match(css, /\.article-shell\s*\{[^}]*max-width:\s*var\(--site-shell\);/s);
    assert.match(css, /\.article-main\s*\{[^}]*max-width:\s*62\.5rem;/s);
    assert.match(
        css,
        /@media\s*\(min-width:\s*1280px\)[\s\S]*?\.article-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+clamp\(15\.5rem,\s*16vw,\s*17rem\);[^}]*gap:\s*clamp\(2rem,\s*3vw,\s*3rem\);[^}]*justify-content:\s*center;/s
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
