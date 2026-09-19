import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: { colors: { lime: '#d4fc64', ink: '#141612' }, fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Manrope', 'sans-serif'] } } },
  plugins: [],
} satisfies Config;
