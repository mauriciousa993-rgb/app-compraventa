/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Horizon Autos: negro, azul electrico y cromo (tomada del logo)
        primary: {
          50: '#eaf4fd',
          100: '#cfe6fa',
          200: '#a3d0f3',
          300: '#6fb6e9',
          400: '#459ad1',
          500: '#2f80d9',
          600: '#2367b4',
          700: '#1b5091',
          800: '#163f72',
          900: '#112d52',
        },
        surface: {
          900: '#0b0e13',
          800: '#141820',
          700: '#1a1f29',
          600: '#222935',
        },
        ink: {
          50: '#f7f9fb',
          100: '#e3e8ef',
          200: '#b4bdca',
          300: '#8a93a3',
        },
        silver: '#c9d1d9',
        signal: '#54b3f0',
        alert: '#ff4d4f',
      },
    },
  },
  plugins: [],
}
