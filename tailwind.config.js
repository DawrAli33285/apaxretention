/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { display: ['Anton', 'Impact', 'Arial Narrow', 'sans-serif'], sans: ['Poppins', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'] },
      colors: {
        // The Apax Group: #233dff (primary), #12229d (secondary), #050a30 (navy)
        brand: { 50: '#eef0ff', 100: '#dce1ff', 200: '#b9c2ff', 300: '#8b98ff', 400: '#5a6bff', 500: '#233dff', 600: '#1b31e0', 700: '#12229d', 800: '#0c1866', 900: '#050a30' },
      },
    },
  },
  plugins: [],
};
