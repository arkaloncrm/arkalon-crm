/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        arkalon: {
          navy: '#002B5C',
          blue: '#0073C6',
          lightblue: '#00AEEF',
          white: '#FFFFFF',
          offwhite: '#F5F7FA',
          grey: '#64748B',
          lightgrey: '#E2E8F0',
          success: '#16A34A',
          warning: '#D97706',
          danger: '#DC2626',
          purple: '#7C3AED',
        },
        // UI revamp token namespaces (additive — new names, no collisions).
        canvas: '#F4F7FB',
        surface: {
          DEFAULT: '#FFFFFF',
          subtle: '#F9FBFD',
          sunken: '#EEF3F9',
        },
        brand: {
          navy: '#002B5C',
          blue: '#0073C6',
          cyan: '#00AEEF',
        },
        bu: {
          asc: '#0073C6',
          'asc-bg': '#E7F1FB',
          ss: '#F5921E',
          'ss-bg': '#FDF0E1',
        },
        ink: {
          primary: '#0F1F33',
          body: '#334155',
          muted: '#64748B',
          faint: '#94A3B8',
          nav: '#C7DCF2',
        },
        line: {
          DEFAULT: '#E2E8F0',
          strong: '#CBD5E1',
        },
      },
      // Only the NEW 'card' key is added. The default shadow-md/shadow-lg and
      // the default rounded-* scale are intentionally left untouched so other
      // pages that rely on them are not restyled. Dashboard elevation/radius
      // beyond this is applied via CSS tokens (--shadow-*, --radius-*).
      boxShadow: {
        card: '0 1px 3px rgba(15,31,51,0.06), 0 1px 2px rgba(15,31,51,0.04)',
      },
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
        opensans: ['Open Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
