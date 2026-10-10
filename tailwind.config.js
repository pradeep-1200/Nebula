/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        space: {
          900: '#070913',
          800: '#0D1128',
          700: '#171D3D',
          600: '#232A54',
        },
        nebula: {
          pink: '#FF2E93',
          cyan: 'var(--accent-color, #00F0FF)',
          purple: '#8A2BE2'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
