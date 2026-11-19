import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Regla estricta 60/30/10
        midnight: {
          DEFAULT: '#0B1220', // 60% Primary Background
          deep: '#070C16',
          elevated: '#101A2E',
        },
        slateBlue: {
          DEFAULT: '#1B2940', // 30% Panels, Cards, Sidebar, Header
          hover: '#223452',
          border: '#2B3F60',
          muted: '#8FA3BF',
        },
        electricTeal: {
          DEFAULT: '#22D3C5', // 10% Primary Accent, Interactive, Highlights
          hover: '#1AB8AC',
          muted: 'rgba(34, 211, 197, 0.14)',
          glow: 'rgba(34, 211, 197, 0.35)',
        },
        platform: {
          youtube: '#FF3B30',
          tiktok: '#22D3C5',
          instagram: '#E1306C',
          facebook: '#1877F2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        tealGlow: '0 0 20px -4px rgba(34, 211, 197, 0.35)',
        card: '0 8px 30px rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
