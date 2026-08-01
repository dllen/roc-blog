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
    if (darkModeToggle) syncThemeToggle(darkModeToggle, isDark);
}

function toggleBackToTop() {
    const e = document.getElementById('back-to-top');
    if (!e) return;
    e.classList.toggle('hidden', window.scrollY === 0);
}

function backToTop() {
    window.scrollTo(0, 0);
}

const darkModeToggle = document.getElementById('darkmode-toggle');
if (darkModeToggle) {
    syncThemeToggle(darkModeToggle, document.documentElement.classList.contains('dark'));
    darkModeToggle.addEventListener('click', toggleDarkMode);
}

const dropdownToggle = document.getElementById('darkmode-toggle-dropdown');
if (dropdownToggle) {
    syncThemeToggle(dropdownToggle, document.documentElement.classList.contains('dark'));
    dropdownToggle.addEventListener('click', toggleDarkMode);
}

function initDropdowns() {
    document.querySelectorAll('[data-dropdown]').forEach(function (dd) {
        var trigger = dd.querySelector('[data-dropdown] .site-dropdown__trigger, .site-dropdown__trigger');
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
initDropdowns();

const backToTopButton = document.getElementById('back-to-top');
if (backToTopButton) {
    backToTopButton.addEventListener('click', backToTop);
    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    toggleBackToTop();
}
