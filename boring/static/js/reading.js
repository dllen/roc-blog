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
    if (ascii.length > 0) return ascii.slice(0, 60);
    let h = 0;
    for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
    return 'h' + Math.abs(h).toString(36);
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
    const article = document.querySelector('article');
    if (!article) return;
    const headings = article.querySelectorAll('h2, h3, h4');
    if (headings.length === 0) return;

    headings.forEach(h => { if (!h.id) h.id = slugify(h.textContent); });

    const minLevel = Math.min(...Array.from(headings).map(h => +h.tagName[1]));
    const items = Array.from(headings).map(h => ({
      level: +h.tagName[1],
      text: h.textContent,
      id: h.id,
    }));

    function makeHtml(items) {
      return items.map(it => {
        const indent = (it.level - minLevel) * 12;
        return `<a href="#${it.id}" data-toc-id="${it.id}"
                  class="block py-1 text-slate-600 dark:text-slate-400
                         hover:text-amber-600 dark:hover:text-amber-400
                         border-l-2 border-transparent"
                  data-active-class="border-amber-400 text-amber-600 font-bold"
                  style="padding-left: ${indent}px;">${escapeHtml(it.text)}</a>`;
      }).join('');
    }
    const html = makeHtml(items);
    const list = document.getElementById('toc-list');
    const listMobile = document.getElementById('toc-list-mobile');
    if (list) list.innerHTML = html;
    if (listMobile) listMobile.innerHTML = html;

    const links = document.querySelectorAll('[data-toc-id]');
    const linkMap = new Map();
    links.forEach(l => linkMap.set(l.dataset.tocId, l));
    let activeId = null;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          const id = e.target.id;
          if (activeId && activeId !== id) {
            const prev = linkMap.get(activeId);
            if (prev) prev.removeAttribute('data-active');
          }
          const cur = linkMap.get(id);
          if (cur) cur.setAttribute('data-active', '');
          activeId = id;
        }
      });
    }, { rootMargin: '-30% 0% -60% 0%' });
    headings.forEach(h => io.observe(h));
  }

  // ── 3. Anchor links ─────────────────────────────────────
  function initAnchors() {
    const article = document.querySelector('article');
    if (!article) return;
    const headings = article.querySelectorAll('h2, h3, h4');
    headings.forEach(h => {
      const a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = '#';
      a.className = 'anchor-link opacity-0 group-hover:opacity-100 transition ' +
                    'ml-2 text-slate-400 hover:text-amber-600 no-underline';
      a.addEventListener('click', e => {
        e.preventDefault();
        const url = window.location.origin + window.location.pathname + '#' + h.id;
        copyToClipboard(url).then(ok => {
          const orig = a.textContent;
          a.textContent = ok ? 'Copied!' : 'Failed';
          setTimeout(() => { a.textContent = orig; }, 2000);
        });
        history.pushState(null, '', '#' + h.id);
      });
      // Wrap heading in a span so we can add the anchor link
      const wrapper = document.createElement('span');
      wrapper.className = 'group';
      h.parentNode.insertBefore(wrapper, h);
      wrapper.appendChild(h);
      wrapper.appendChild(a);
    });
  }

  // ── 4. Code copy ─────────────────────────────────────────
  function initCodeCopy() {
    const pres = document.querySelectorAll('article pre');
    pres.forEach(pre => {
      pre.style.position = 'relative';
      pre.classList.add('group');
      const btn = document.createElement('button');
      btn.textContent = 'Copy';
      btn.className = 'code-copy absolute top-2 right-2 px-2 py-1 text-xs ' +
                      'rounded bg-slate-700 text-slate-200 hover:bg-slate-600 ' +
                      'opacity-0 group-hover:opacity-100 transition z-10';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code');
        const text = code ? code.textContent : pre.textContent;
        copyToClipboard(text).then(ok => {
          btn.textContent = ok ? 'Copied ✓' : 'Failed';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
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
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }

  // ── boot ───────────────────────────────────────────────
  function boot() {
    initProgress();
    initToc();
    initAnchors();
    initCodeCopy();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
