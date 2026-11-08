/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        verde: { DEFAULT: '#0B2E26', 2: '#145C46', claro: '#A8E6C1', glow: '#6EE7B7' },
        fundo: '#F6F7F5',
        grafite: '#1F2937',
        cinza: '#98A29B',
      },
      fontFamily: {
        titulo: ['Montserrat', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: { card: '0 1px 2px rgba(11,46,38,0.06), 0 4px 16px rgba(11,46,38,0.05)' },
    },
  },
  plugins: [],
}
