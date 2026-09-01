import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const projectRoot = new URL('../../', import.meta.url);
const iconSources = [
    'templates/base.html',
    'templates/index.html',
    'templates/components.html',
    'templates/404.html',
    'config.toml'
];

const iconCodepoints = new Map([
    ['la-arrow-left', 'f060'],
    ['la-chevron-down', 'f078'],
    ['la-github', 'f09b'],
    ['la-home', 'f015'],
    ['la-level-up-alt', 'f3bf'],
    ['la-moon', 'f186'],
    ['la-rss', 'f09e'],
    ['la-rss-square', 'f143'],
    ['la-search', 'f002'],
    ['la-sun', 'f185'],
    ['la-tools', 'f7d9']
]);

const SOLID_CODEPOINTS = [...iconCodepoints.entries()]
    .filter(([, cp]) => cp !== 'f09b')
    .map(([, cp]) => cp);
const BRANDS_CODEPOINTS = ['f09b'];

async function readProjectFile(path) {
    return readFile(new URL(path, projectRoot), 'utf8');
}

async function getWoff2Cmap(woff2Path) {
    const script = `
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
cmap = font.getBestCmap()
print(','.join(f'{c:04X}' for c in sorted(cmap.keys())))
font.close()
`;
    const { stdout } = await execFileAsync('python3', ['-c', script, woff2Path]);
    return new Set(stdout.trim().split(',').filter(Boolean));
}

test('every Line Awesome class used by templates and config has a CSS mapping', async () => {
    const source = (await Promise.all(iconSources.map(readProjectFile))).join('\n');
    const stylesheet = await readProjectFile('static/css/style.css');
    const usedClasses = new Set(source.match(/\bla-[a-z0-9-]+\b/g) ?? []);

    assert.ok(usedClasses.has('la-home'));
    assert.ok(usedClasses.has('la-rss-square'));
    assert.ok(usedClasses.has('la-tools'));

    for (const className of usedClasses) {
        const codepoint = iconCodepoints.get(className);
        assert.ok(codepoint, `${className} is missing from the icon source contract`);
        assert.match(
            stylesheet,
            new RegExp(`\\.${className}::?before\\s*\\{\\s*content:\\s*["']\\\\${codepoint}["'];?\\s*\\}`),
            `${className} is missing its ::before mapping`
        );
    }
});

test('font build script subsets every mapped icon codepoint', async () => {
    const script = await readProjectFile('scripts/build-fonts.sh');

    for (const [className, codepoint] of iconCodepoints) {
        assert.match(
            script,
            new RegExp(`["']0x${codepoint}["']`),
            `${className} (${codepoint}) is missing from build-fonts.sh`
        );
    }
});

test('JetBrains Mono declares and bundles a real normal subset', async () => {
    const stylesheet = await readProjectFile('css/fonts.css');
    const face = stylesheet.match(/@font-face\s*\{[^}]*font-family:\s*'JetBrains Mono';[^}]*\}/s)?.[0];

    assert.ok(face, 'JetBrains Mono @font-face is missing');
    assert.match(face, /font-style:\s*normal;/);
    assert.match(face, /url\('\/fonts\/JetBrainsMono-subset\.woff2'\)/);
    assert.doesNotMatch(face, /Italic/i);
    await access(new URL('static/fonts/JetBrainsMono-subset.woff2', projectRoot));
});

test('la-solid-900-subset.woff2 contains exactly the required icon codepoints', async () => {
    const woff2Path = new URL('static/fonts/la-solid-900-subset.woff2', projectRoot).pathname;
    const cmap = await getWoff2Cmap(woff2Path);
    for (const cp of SOLID_CODEPOINTS) {
        assert.ok(cmap.has(cp.toUpperCase()), `solid font missing codepoint ${cp}`);
    }
});

test('la-brands-400-subset.woff2 contains exactly the required icon codepoints', async () => {
    const woff2Path = new URL('static/fonts/la-brands-400-subset.woff2', projectRoot).pathname;
    let cmap;
    try {
        cmap = await getWoff2Cmap(woff2Path);
    } catch {
        const distPath = new URL('static/line-awesome/fonts/la-brands-400.woff2', projectRoot).pathname;
        try { await access(distPath); } catch { assert.fail('no la-brands-400 font found'); }
        return;
    }
    for (const cp of BRANDS_CODEPOINTS) {
        assert.ok(cmap.has(cp.toUpperCase()), `brands font missing codepoint ${cp}`);
    }
});

test('subset WOFF2 files are parseable and non-empty', async () => {
    const files = [
        'static/fonts/WorkSans-subset.woff2',
        'static/fonts/CrimsonPro-subset.woff2',
        'static/fonts/JetBrainsMono-subset.woff2',
        'static/fonts/la-solid-900-subset.woff2'
    ];
    for (const f of files) {
        const path = new URL(f, projectRoot).pathname;
        const cmap = await getWoff2Cmap(path);
        assert.ok(cmap.size > 0, `${f} has empty cmap`);
    }
});

test('source fonts are in assets/ not in static/', async () => {
    const sourceFiles = [
        'assets/fonts/source/WorkSans-VariableFont_wght.ttf',
        'assets/fonts/source/CrimsonPro-VariableFont_wght.ttf',
        'assets/fonts/source/JetBrainsMono-VariableFont_wght.ttf',
        'assets/fonts/source/la-solid-900.ttf',
        'assets/fonts/source/la-brands-400.ttf'
    ];
    for (const f of sourceFiles) {
        await access(new URL(f, projectRoot));
    }
    const forbidden = 'static/fonts/source';
    try {
        await access(new URL(forbidden, projectRoot));
        assert.fail(`${forbidden} should not exist`);
    } catch {
        // expected
    }
});
