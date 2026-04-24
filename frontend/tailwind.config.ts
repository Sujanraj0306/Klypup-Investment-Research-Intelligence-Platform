import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Theme-aware tokens driven by CSS variables in src/index.css.
        // Flipping [data-theme="light"|"dark"] on <html> re-colors everything.
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'bg-elevated': 'var(--bg-elevated)',
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        // Brand + semantic colors stay constant across themes.
        'brand-blue': '#3B82F6',
        'brand-glow': '#60A5FA',
        'brand-cyan': '#06B6D4',
        gain: '#10B981',
        'gain-subtle': 'rgba(16, 185, 129, 0.18)',
        loss: '#EF4444',
        'loss-subtle': 'rgba(239, 68, 68, 0.18)',
        neutral: '#F59E0B',
        'neutral-subtle': 'rgba(245, 158, 11, 0.18)',
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
