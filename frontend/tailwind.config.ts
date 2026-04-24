import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'bg-primary': '#0A0E1A',
        'bg-secondary': '#111827',
        'bg-tertiary': '#1C2333',
        'bg-elevated': '#1E2A3E',
        'border-subtle': '#2A3550',
        'border-default': '#3B4D6B',
        'border-strong': '#4B6090',
        'brand-blue': '#3B82F6',
        'brand-glow': '#60A5FA',
        'brand-cyan': '#06B6D4',
        gain: '#10B981',
        'gain-subtle': '#064E3B',
        loss: '#EF4444',
        'loss-subtle': '#450A0A',
        neutral: '#F59E0B',
        'neutral-subtle': '#451A03',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
export default config
