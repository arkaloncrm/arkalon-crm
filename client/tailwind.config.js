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
      },
      fontFamily: {
        montserrat: ['Montserrat', 'sans-serif'],
        opensans: ['Open Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
