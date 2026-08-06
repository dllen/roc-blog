// vanilla JS search with Fuse.js. Loaded on base.html (all pages).
(function() {
  'use strict';

  var SEARCH_INDEX_URL = '/search_index.en.json';
  var index = null;
  var fuse = null;
  var overlay = null;
  var input = null;
  var results = null;
  var isOpen = false;
  var selectedIdx = -1;

  // ── DOM ──────────────────────────────────────────────
  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '搜索文章');
    overlay.innerHTML =
      '<div class="search-panel">' +
        '<div class="search-panel__header">' +
          '<div class="search-panel__input-wrapper">' +
            '<i class="las la-search search-panel__icon" aria-hidden="true"></i>' +
            '<input type="search" class="search-panel__input" placeholder="搜索文章标题或内容..." autocomplete="off">' +
            '<kbd class="search-panel__kbd">Esc</kbd>' +
          '</div>' +
        '</div>' +
        '<div class="search-panel__results" data-search-results></div>' +
        '<div class="search-panel__footer">' +
          '<span class="search-panel__hint"><kbd>↑</kbd><kbd>↓</kbd> 导航 <kbd>↵</kbd> 打开</span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    input = overlay.querySelector('.search-panel__input');
    results = overlay.querySelector('[data-search-results]');

    input.addEventListener('input', function() { doSearch(); });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) close();
    });
  }

  // ── Index loading ───────────────────────────────────
  function loadIndex() {
    if (index) return Promise.resolve(index);
    return fetch(SEARCH_INDEX_URL)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        index = data;
        return index;
      })
      .catch(function(err) {
        console.warn('Search index load failed:', err);
        if (results) {
          results.innerHTML = '<p class="search-panel__empty">搜索索引加载失败，请稍后重试</p>';
        }
        throw err;
      });
  }

  // ── Search ──────────────────────────────────────────
  function doSearch() {
    var q = input.value.trim();
    if (!q) {
      results.innerHTML = '';
      selectedIdx = -1;
      return;
    }
    if (!index) {
      loadIndex().then(function() { doSearch(); });
      return;
    }
    if (typeof Fuse === 'undefined') {
      results.innerHTML = '<p class="search-panel__empty">搜索组件加载中...</p>';
      return;
    }
    if (!fuse) {
      fuse = new Fuse(index, {
        keys: [
          { name: 'title', weight: 0.5 },
          { name: 'description', weight: 0.3 },
          { name: 'body', weight: 0.2 }
        ],
        threshold: 0.4,
        distance: 100,
        includeMatches: true,
        minMatchCharLength: 2,
        ignoreLocation: true
      });
    }

    var fuseResults = fuse.search(q).slice(0, 15);
    selectedIdx = -1;
    renderResults(fuseResults, q);
  }

  // ── Render ──────────────────────────────────────────
  function renderResults(fuseResults, q) {
    if (!fuseResults.length) {
      results.innerHTML = '<p class="search-panel__empty">没有找到与 "<strong>' +
        escapeHtml(q) + '</strong>" 相关的结果</p>';
      return;
    }
    var html = '';
    fuseResults.forEach(function(r, i) {
      var item = r.item;
      var title = item.title || 'Untitled';
      var desc = item.description || '';
      var url = item.url;

      // Extract snippet from body if we have matches
      var snippet = '';
      if (r.matches && r.matches.length) {
        var bodyMatch = r.matches.filter(function(m) { return m.key === 'body'; })[0];
        if (bodyMatch && bodyMatch.indices && bodyMatch.indices.length) {
          var start = Math.max(0, bodyMatch.indices[0][0] - 30);
          var end = Math.min((item.body || '').length, bodyMatch.indices[0][1] + 30);
          snippet = (start > 0 ? '...' : '') + (item.body || '').substring(start, end) + (end < (item.body || '').length ? '...' : '');
        }
      }
      if (!snippet && desc) snippet = desc;

      html +=
        '<a href="' + url + '" class="search-result" data-search-index="' + i + '">' +
          '<span class="search-result__title">' + highlightMatches(title, q) + '</span>' +
          (snippet ? '<span class="search-result__snippet">' + escapeHtml(snippet) + '</span>' : '') +
          '<span class="search-result__url">' + formatUrl(url) + '</span>' +
        '</a>';
    });
    results.innerHTML = html;
  }

  function highlightMatches(text, q) {
    if (!q) return escapeHtml(text);
    var escaped = escapeHtml(text);
    var words = q.trim().split(/\s+/);
    words.forEach(function(w) {
      var re = new RegExp('(' + escapeRegex(w) + ')', 'gi');
      escaped = escaped.replace(re, '<mark class="search-highlight">$1</mark>');
    });
    return escaped;
  }

  function formatUrl(url) {
    try {
      var u = new URL(url);
      var path = u.pathname.replace(/\/$/, '');
      return path || '/';
    } catch(e) {
      return url;
    }
  }

  // ── Keyboard navigation ─────────────────────────────
  function navigateResults(dir) {
    var items = results.querySelectorAll('.search-result');
    if (!items.length) { selectedIdx = -1; return; }
    if (dir === 'down') {
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
    } else {
      selectedIdx = Math.max(selectedIdx - 1, 0);
    }
    items.forEach(function(el, i) {
      el.classList.toggle('is-selected', i === selectedIdx);
    });
    var selected = items[selectedIdx];
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function openSelected() {
    var items = results.querySelectorAll('.search-result');
    if (selectedIdx >= 0 && selectedIdx < items.length) {
      var href = items[selectedIdx].getAttribute('href');
      if (href) window.location.href = href;
    }
  }

  // ── Open / Close ────────────────────────────────────
  function open() {
    if (isOpen) return;
    ensureOverlay();
    overlay.classList.add('is-open');
    input.value = '';
    results.innerHTML = '';
    selectedIdx = -1;
    isOpen = true;
    document.documentElement.style.overflow = 'hidden';
    loadIndex().catch(function(){});
    setTimeout(function() { input.focus(); }, 100);
  }

  function close() {
    if (!isOpen) return;
    overlay.classList.remove('is-open');
    isOpen = false;
    document.documentElement.style.overflow = '';
  }

  // ── Escape regex ────────────────────────────────────
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ── Utilities ────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // ── Global keyboard shortcut ─────────────────────────
  document.addEventListener('keydown', function(e) {
    if (!isOpen) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        open();
        return;
      }
      if (e.key === '/' && !isEditable(e.target)) {
        e.preventDefault();
        open();
        return;
      }
    } else {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateResults('down');
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateResults('up');
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        openSelected();
        return;
      }
    }
  });

  function isEditable(el) {
    if (!el || !el.tagName) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' ||
           el.isContentEditable ||
           el.getAttribute('role') === 'textbox';
  }

  // ── Public API ───────────────────────────────────────
  window.search = { open: open, close: close };

  // ── Wire up search trigger ───────────────────────────
  function initSearchTrigger() {
    var trigger = document.getElementById('search-trigger');
    if (trigger) {
      trigger.addEventListener('click', open);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initSearchTrigger();
    });
  } else {
    initSearchTrigger();
  }
})();
