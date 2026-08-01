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

const backToTopButton = document.getElementById('back-to-top');
if (backToTopButton) {
    backToTopButton.addEventListener('click', backToTop);
    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    toggleBackToTop();
}
