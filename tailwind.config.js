/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        verde: { DEFAULT: '#0B2E26', 2: '#145C46', claro: '#A8E6C1', glow: '#6EE7B7', suave: '#B7F5D3' },
        escuro: '#07110E',
        painel: '#0C1A15',
        fundo: '#F5F7F4',
        grafite: '#1F2937',
        cinza: '#98A29B',
      },
      fontFamily: {
        titulo: ['Manrope', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(110,231,183,0.18), 0 8px 32px -8px rgba(110,231,183,0.25)',
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset',
      },
    },
  },
  plugins: [],
}
