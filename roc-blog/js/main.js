function enableDarkMode() {
    const e = document.getElementsByTagName('html')[0];
    e.classList.add('dark');
    localStorage.setItem('is_darkmode_set', e.classList.contains('dark'));
}

function toggleDarkMode() {
    const e = document.getElementsByTagName('html')[0];
    e.classList.toggle('dark');
    localStorage.setItem('is_darkmode_set', e.classList.contains('dark'));
}

function toggleBackToTop() {
    const e = document.getElementById('back-to-top');
    if (!e) return;
    e.classList.toggle('hidden', window.scrollY === 0);
}

function backToTop() {
    window.scrollTo(0, 0);
}

if (localStorage.getItem('is_darkmode_set') === 'true') enableDarkMode();

const darkModeToggle = document.getElementById('darkmode-toggle');
if (darkModeToggle) {
    darkModeToggle.addEventListener('click', toggleDarkMode);
}

const backToTopButton = document.getElementById('back-to-top');
if (backToTopButton) {
    backToTopButton.addEventListener('click', backToTop);
    window.addEventListener('scroll', toggleBackToTop);
}

