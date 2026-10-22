/** Shared Tailwind preset for the CodeGuard dashboard and Chrome extension. */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#2563EB', 50: '#EFF6FF', 100: '#DBEAFE', 400: '#60A5FA', 500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 900: '#1E3A8A' },
        ink: { DEFAULT: '#0B1020', 900: '#0B1020', 800: '#111833', 700: '#1A2342', 600: '#273259', 500: '#3A4672' },
        sev: { critical: '#DC2626', high: '#EA580C', medium: '#CA8A04', low: '#2563EB', info: '#64748B', resolved: '#16A34A' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
};
