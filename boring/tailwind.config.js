const defaultTheme = require('tailwindcss/defaultTheme')

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./templates/**/*.html", "./theme/**/*.html"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        editorial: {
          background: '#FBFAF7',
          surface: '#F5F2EC',
          card: '#FFFFFF',
          border: '#E7E2D9',
          primary: '#A16207',
          secondary: '#78716C',
          text: '#1C1917',
          muted: '#78716C',
          success: '#16803C',
          warning: '#B45309',
          danger: '#B42318',
        },
      },
    },
    fontFamily: {
      serif: ['"Crimson Pro"', '"PingFang SC"', '"Hiragino Sans GB"', ...defaultTheme.fontFamily.serif],
      sans: ['"Work Sans"', 'Inter', '"PingFang SC"', ...defaultTheme.fontFamily.sans],
      mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
    }
  },
  variants: {},
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
