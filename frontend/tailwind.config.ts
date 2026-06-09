import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ws: {
          dark: '#0e2731',
          teal: '#63c6b4',
          'teal-mid': '#1f8390',
          'teal-deep': '#15324c',
          ink: '#173a47',
          paper: '#f5f2ec',
          line: '#e4ddd0',
          muted: '#8a8475',
          card: '#ffffff',
        },
        agent: {
          ambition: '#DC2626',
          realism: '#2563EB',
          risk: '#D97706',
          opportunity: '#059669',
          growth: '#7C3AED',
          network: '#0891B2',
        },
      },
      fontFamily: {
        wordmark: ['var(--font-quicksand)', 'sans-serif'],
        mono: ['var(--font-space-mono)', 'ui-monospace', 'monospace'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 4px 24px -8px rgba(14, 39, 49, 0.12)',
        modal: '0 24px 64px -16px rgba(14, 39, 49, 0.28)',
      },
    },
  },
  plugins: [],
};

export default config;
