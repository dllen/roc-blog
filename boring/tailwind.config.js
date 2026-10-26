/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./templates/**/*.html", "./theme/**/*.html"],
  safelist: [
    'lab',
    'las',
    'la-arrow-left',
    'la-github',
    'la-home',
    'la-level-up-alt',
    'la-moon',
    'la-rss',
    'la-rss-square',
    'la-search',
    'la-sun',
    'la-tools',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        editorial: {
          background: 'var(--color-paper)',
          surface: 'var(--color-paper-2)',
          card: 'var(--color-paper-3)',
          border: 'var(--color-rule)',
          primary: 'var(--color-accent)',
          secondary: 'var(--color-ink-2)',
          text: 'var(--color-ink)',
          muted: 'var(--color-muted)',
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          danger: 'var(--color-error)',
        },
      },
    },
    fontFamily: {
      serif: ['var(--font-display)'],
      sans: ['var(--font-body)'],
      mono: ['var(--font-mono)'],
    }
  },
  variants: {},
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
