/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('./tailwind-preset.cjs')],
  darkMode: 'class',
  content: [
    './popup.html',
    './sidepanel.html',
    './src/**/*.{ts,tsx}',
    './src/components/primitives/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      keyframes: { shimmer: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } } },
      animation: { shimmer: 'shimmer 1.6s ease-in-out infinite' },
    },
  },
  plugins: [],
};
