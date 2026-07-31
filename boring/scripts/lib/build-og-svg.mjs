// Pure function: build OG SVG string from frontmatter + colors.
const WIDTH = 1200;
const HEIGHT = 630;

export function buildOgSvg(meta, colors) {
  const color = colors[meta.section] || colors._fallback || '#52525b';
  const title = escapeXml(truncate(meta.title, 60));
  const subtitle = escapeXml(truncate(meta.description, 80));
  const date = escapeXml(meta.date || '');
  const site = escapeXml(meta.siteName || '');
  const section = escapeXml(meta.sectionTitle || meta.section.toUpperCase());
  const seq = escapeXml(String(meta.sequence || ''));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>
  <rect x="0" y="0" width="${WIDTH}" height="8" fill="${color}"/>
  <text x="64" y="120" font-family="Work Sans, sans-serif" font-size="28" fill="${color}" letter-spacing="2">${section} · ${seq}</text>
  <text x="64" y="220" font-family="Crimson Pro, serif" font-size="64" font-weight="600" fill="#f1f5f9">${title}</text>
  <text x="64" y="320" font-family="Work Sans, sans-serif" font-size="28" fill="#cbd5e1">${subtitle}</text>
  <text x="64" y="560" font-family="Work Sans, sans-serif" font-size="24" fill="#94a3b8">${site}</text>
  <text x="${WIDTH - 64}" y="560" font-family="Work Sans, sans-serif" font-size="24" fill="#94a3b8" text-anchor="end">${date}</text>
</svg>
`;
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
