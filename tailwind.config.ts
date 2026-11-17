import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#f472b6',
          50: '#fdf4f8',
          100: '#fce7f3',
          500: '#f472b6',
          600: '#db2777',
        },
        secondary: {
          DEFAULT: '#67e8f9',
          50: '#ecfeff',
          100: '#cffafe',
          500: '#67e8f9',
          600: '#22d3ee',
        },
        peach: '#fed7aa',
        mint: '#a7f3d0',
        lavender: '#c4b5fd',
        'soft-bg': '#fff1f2',
        'panel-bg': '#fff7ed',
      },
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        display: ['Quicksand', 'Nunito', 'sans-serif'],
      },
      borderRadius: {
        '3xl': '24px',
      },
      boxShadow: {
        'soft': '0 10px 15px -3px rgb(249 115 182 / 0.1), 0 4px 6px -4px rgb(103 232 249 / 0.1)',
        'gentle': '0 4px 20px -2px rgb(0 0 0 / 0.06)',
      },
      keyframes: {
        'gentle-bounce': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'wiggle': {
          '0%, 100%': { transform: 'rotate(-3deg)' },
          '50%': { transform: 'rotate(3deg)' },
        },
      },
      animation: {
        'bounce-hover': 'gentle-bounce 0.3s ease-in-out',
        'float-slow': 'float 4s ease-in-out infinite',
        'wiggle-once': 'wiggle 0.6s ease-in-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
