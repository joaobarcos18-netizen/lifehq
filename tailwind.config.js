/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // "Personal HQ" palette — deep slate with an emerald/amber accent
        ink: {
          950: '#080b12',
          900: '#0d1119',
          800: '#141a26',
          700: '#1d2535',
          600: '#283145',
          500: '#3a455e'
        },
        grass: {
          400: '#7cc576',
          500: '#5aa84f',
          600: '#458a3c'
        },
        ember: {
          400: '#f4a64b',
          500: '#e8862b',
          600: '#c96d1a'
        },
        sky: {
          400: '#5bb8e6',
          500: '#369ad1'
        }
      },
      fontFamily: {
        display: ['"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Code"', '"Consolas"', 'monospace']
      },
      boxShadow: {
        panel: '0 10px 40px -12px rgba(0,0,0,0.55)',
        glow: '0 0 24px -4px rgba(124,197,118,0.45)'
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'drop-in': {
          '0%': { opacity: '0', transform: 'translateY(-18px) scale(0.96)' },
          '60%': { opacity: '1' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out both',
        'drop-in': 'drop-in 0.45s cubic-bezier(0.22,1,0.36,1) both'
      }
    }
  },
  plugins: []
}
