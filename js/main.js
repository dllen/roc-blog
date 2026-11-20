function persistTheme(isDark) {
    try {
        localStorage.setItem('is_darkmode_set', isDark);
    } catch {}
}

function syncThemeToggle(toggle, isDark) {
    toggle.setAttribute('aria-pressed', String(isDark));
    toggle.setAttribute('aria-label', isDark ? '启用浅色模式' : '启用深色模式');
}

function toggleDarkMode() {
    const e = document.getElementsByTagName('html')[0];
    e.classList.toggle('dark');
    const isDark = e.classList.contains('dark');
    persistTheme(isDark);
    var toggle = document.getElementById('darkmode-toggle');
    if (toggle) syncThemeToggle(toggle, isDark);
    toggle = document.getElementById('darkmode-toggle-dropdown');
    if (toggle) syncThemeToggle(toggle, isDark);
}

function toggleBackToTop() {
    const e = document.getElementById('back-to-top');
    if (!e) return;
    e.classList.toggle('hidden', window.scrollY === 0);
}

function backToTop() {
    window.scrollTo(0, 0);
}

function initDropdowns() {
    document.querySelectorAll('[data-dropdown]').forEach(function (dd) {
        var trigger = dd.querySelector('.site-dropdown__trigger');
        var panel = dd.querySelector('.site-dropdown__panel');
        if (!trigger || !panel) return;
        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = trigger.getAttribute('aria-expanded') === 'true';
            trigger.setAttribute('aria-expanded', String(!isOpen));
            if (!isOpen) {
                panel.setAttribute('data-open', '');
            } else {
                panel.removeAttribute('data-open');
            }
        });
    });
    document.addEventListener('click', function (e) {
        document.querySelectorAll('[data-dropdown]').forEach(function (dd) {
            if (dd.contains(e.target)) return;
            var trigger = dd.querySelector('.site-dropdown__trigger');
            var panel = dd.querySelector('.site-dropdown__panel');
            if (trigger && panel) {
                trigger.setAttribute('aria-expanded', 'false');
                panel.removeAttribute('data-open');
            }
        });
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('[data-dropdown]').forEach(function (dd) {
                var trigger = dd.querySelector('.site-dropdown__trigger');
                var panel = dd.querySelector('.site-dropdown__panel');
                if (trigger && panel) {
                    trigger.setAttribute('aria-expanded', 'false');
                    panel.removeAttribute('data-open');
                }
            });
        }
    });
}

function initMobileNav() {
    var toggle = document.getElementById('mobile-nav-toggle');
    var drawer = document.getElementById('site-mobile-drawer');
    var backdrop = document.getElementById('site-mobile-drawer-backdrop');
    if (!toggle || !drawer) return;

    var iconOpen = toggle.querySelector('[data-icon-open]');
    var iconClose = toggle.querySelector('[data-icon-close]');

    function setOpen(isOpen) {
        toggle.setAttribute('aria-expanded', String(isOpen));
        toggle.setAttribute('aria-label', isOpen ? '关闭导航' : '打开导航');
        if (isOpen) {
            drawer.removeAttribute('hidden');
            drawer.setAttribute('data-open', '');
            if (backdrop) backdrop.removeAttribute('hidden');
        } else {
            drawer.setAttribute('hidden', '');
            drawer.removeAttribute('data-open');
            if (backdrop) backdrop.setAttribute('hidden', '');
        }
        if (iconOpen) iconOpen.hidden = isOpen;
        if (iconClose) iconClose.hidden = !isOpen;
    }

    toggle.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    if (backdrop) {
        backdrop.addEventListener('click', function () {
            setOpen(false);
        });
    }

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            toggle.focus();
        }
    });

    // Close drawer after navigating to a drawer link (so the new page renders without it).
    drawer.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function () {
            setOpen(false);
        });
    });
}

function init() {
    var darkModeToggle = document.getElementById('darkmode-toggle');
    if (darkModeToggle) {
        syncThemeToggle(darkModeToggle, document.documentElement.classList.contains('dark'));
        darkModeToggle.addEventListener('click', toggleDarkMode);
    }

    var dropdownToggle = document.getElementById('darkmode-toggle-dropdown');
    if (dropdownToggle) {
        syncThemeToggle(dropdownToggle, document.documentElement.classList.contains('dark'));
        dropdownToggle.addEventListener('click', toggleDarkMode);
    }

    initDropdowns();
    initMobileNav();

    var backToTopButton = document.getElementById('back-to-top');
    if (backToTopButton) {
        backToTopButton.addEventListener('click', backToTop);
        window.addEventListener('scroll', toggleBackToTop, { passive: true });
        toggleBackToTop();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
