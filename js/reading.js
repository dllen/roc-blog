// vanilla JS, ~6KB. Loaded on page.html only.
// Public functions: initProgress, initToc, initAnchors, initCodeCopy.
(function() {
  'use strict';

  // ── utils ──────────────────────────────────────────────
  function slugify(text) {
    if (!text) return '';
    const ascii = String(text).toLowerCase()
      .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
    return ascii.slice(0, 60);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ── 1. Progress bar ──────────────────────────────────────
  function initProgress() {
    const bar = document.getElementById('reading-progress');
    if (!bar) return;
    let ticking = false;
    function update() {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      bar.style.width = pct + '%';
      ticking = false;
    }
    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // ── 2. TOC ───────────────────────────────────────────────
  function initToc() {
    const containers = document.querySelectorAll('[data-toc-container]');
    const article = document.querySelector('article');
    const headings = article ? article.querySelectorAll('h2, h3, h4') : [];
    if (headings.length === 0) {
      containers.forEach(container => { container.hidden = true; });
      return;
    }
    containers.forEach(container => { container.hidden = false; });

    const headingList = Array.from(headings);
    const explicitIdOwners = new Map();
    document.querySelectorAll('[id]').forEach(element => {
      const owners = explicitIdOwners.get(element.id) || [];
      owners.push(element);
      explicitIdOwners.set(element.id, owners);
    });
    const reservedIds = new Set(explicitIdOwners.keys());
    const usedIds = new Set();
    const seenExplicitHeadingIds = new Set();
    headingList.forEach(heading => {
      const explicitId = heading.id;
      const owners = explicitId ? explicitIdOwners.get(explicitId) || [] : [];
      const canKeepExplicitId = explicitId &&
        !seenExplicitHeadingIds.has(explicitId) &&
        owners.length === 1 &&
        owners[0] === heading;
      const base = explicitId || slugify(heading.textContent) || 'section';
      let id = base;
      if (!canKeepExplicitId || usedIds.has(id)) {
        let suffix = 2;
        while (reservedIds.has(id) || usedIds.has(id)) id = `${base}-${suffix++}`;
      }
      if (explicitId) seenExplicitHeadingIds.add(explicitId);
      heading.id = id;
      usedIds.add(id);
      reservedIds.add(id);
    });

    const minLevel = Math.min(...headingList.map(h => +h.tagName[1]));
    const items = headingList.map(h => ({
      level: +h.tagName[1],
      text: h.textContent,
      id: h.id,
    }));

    function makeHtml(items) {
      return items.map(it => {
        const offset = it.level - minLevel;
        return `<a href="#${escapeHtml(it.id)}" data-toc-id="${escapeHtml(it.id)}" data-toc-offset="${offset}">${escapeHtml(it.text)}</a>`;
      }).join('');
    }
    const html = makeHtml(items);
    const list = document.getElementById('toc-list');
    const listMobile = document.getElementById('toc-list-mobile');
    if (list) list.innerHTML = html;
    if (listMobile) listMobile.innerHTML = html;

    const linkMap = new Map();
    document.querySelectorAll('[data-toc-id]').forEach(link => {
      const id = link.dataset.tocId;
      const links = linkMap.get(id) || [];
      links.push(link);
      linkMap.set(id, links);
    });
    let activeId = null;
    function setActive(id) {
      if (activeId === id) return;
      if (activeId) {
        (linkMap.get(activeId) || []).forEach(link => {
          link.removeAttribute('data-active');
          link.removeAttribute('aria-current');
        });
      }
      (linkMap.get(id) || []).forEach(link => {
        link.setAttribute('data-active', '');
        link.setAttribute('aria-current', 'location');
      });
      activeId = id;
    }
    const mobileDetails = document.querySelector(
      'details.article-toc-mobile[data-toc-container="mobile"]'
    );
    const scheduleMobileOpen = mobileDetails
      ? (window.requestIdleCallback
          ? () => window.requestIdleCallback(() => { mobileDetails.open = true; }, { timeout: 800 })
          : () => setTimeout(() => { mobileDetails.open = true; }, 200))
      : null;
    const intersecting = new Set();
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) intersecting.add(entry.target);
        else intersecting.delete(entry.target);
      });
      for (let index = headingList.length - 1; index >= 0; index--) {
        if (intersecting.has(headingList[index])) {
          setActive(headingList[index].id);
          if (scheduleMobileOpen) scheduleMobileOpen();
          break;
        }
      }
    }, { rootMargin: '-30% 0% -60% 0%' });
    headingList.forEach(h => io.observe(h));
  }

  // ── 3. Anchor links ─────────────────────────────────────
  function initAnchors() {
    const article = document.querySelector('article');
    if (!article) return;
    const headings = article.querySelectorAll('h2, h3, h4');
    headings.forEach(h => {
      if (h.querySelector(':scope > .anchor-link')) return;
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = '#';
      a.className = 'anchor-link';
      a.setAttribute('aria-label', '复制 ' + h.textContent.trim() + ' 的链接');
      a.setAttribute('aria-live', 'polite');
      a.addEventListener('click', e => {
        e.preventDefault();
        const url = window.location.origin + window.location.pathname + '#' + h.id;
        copyToClipboard(url).then(ok => {
          const orig = a.textContent;
          a.textContent = ok ? '\u2713' : '\u2717';
          setTimeout(() => { a.textContent = orig; }, 1500);
        });
        history.pushState(null, '', '#' + h.id);
      });
      h.appendChild(a);
    });
  }

  // ── 4. Code copy ─────────────────────────────────────────
  function initCodeCopy() {
    const pres = document.querySelectorAll('article pre');
    pres.forEach(pre => {
      if (pre.querySelector(':scope > .code-copy')) return;
      try {
        if (getComputedStyle(pre).position === 'static') pre.style.position = 'relative';
      } catch (_) {
        pre.style.position = 'relative';
      }
      const originalText = pre.textContent;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.className = 'code-copy';
      btn.setAttribute('aria-label', '复制代码');
      btn.setAttribute('aria-live', 'polite');
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code');
        const text = code ? code.textContent : originalText;
        copyToClipboard(text).then(ok => {
          const orig = btn.textContent;
          btn.textContent = ok ? 'Copied ✓' : 'Failed';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        });
      });
      pre.appendChild(btn);
    });
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(() => true).catch(() => fallback(text));
    }
    return Promise.resolve(fallback(text));
  }
  function fallback(text) {
    const ta = document.createElement('textarea');
    try {
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }

  // ── 5. External article links ────────────────────────
  function initExternalLinks() {
    const content = document.querySelector('.article-content');
    if (!content) return;
    content.querySelectorAll('a[href^="http"]').forEach(link => {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    });
  }

  // ── 6. Related articles (fetches /related-index.json) ───
  function initRelated() {
    const container = document.querySelector('[data-related-container]');
    if (!container) return;
    const currentPermalink = container.getAttribute('data-current-permalink');
    const currentTags = (container.getAttribute('data-current-tags') || '')
      .split('|').filter(Boolean);
    const limit = parseInt(container.getAttribute('data-limit') || '3', 10);
    const list = container.querySelector('[data-related-list]');
    if (!list) return;

    fetch('/related-index.json', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('fetch failed')))
      .then(articles => {
        const scored = [];
        for (const a of articles) {
          if (a.permalink === currentPermalink) continue;
          const shared = (a.tags || []).filter(t => currentTags.includes(t)).length;
          if (shared > 0) {
            scored.push({ article: a, shared, date: a.date || '1970-01-01' });
          }
        }
        scored.sort((a, b) => {
          if (b.shared !== a.shared) return b.shared - a.shared;
          return b.date.localeCompare(a.date);
        });
        const top = scored.slice(0, limit);
        renderRelatedList(list, top);
      })
      .catch(err => {
        container.hidden = true;
        console.warn('related-index fetch failed:', err);
      });
  }

  function renderRelatedList(list, items) {
    if (items.length === 0) {
      list.innerHTML = '<p class="related-grid__empty">暂无相关文章。</p>';
      return;
    }
    list.innerHTML = items.map(({ article, shared }) =>
      `<a href="${escapeHtml(article.permalink)}" class="related-card">
         <div class="related-card__title">${escapeHtml(article.title)}</div>
         <div class="related-card__meta">${escapeHtml(article.date)} · 共享 ${shared} 标签</div>
       </a>`
    ).join('');
  }

  // ── boot ───────────────────────────────────────────────
  let booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    initProgress();
    initToc();
    initAnchors();
    initCodeCopy();
    initExternalLinks();
    initRelated();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
