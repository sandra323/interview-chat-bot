/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx,less}',
    // Streamdown 在其 dist 包中提供 Tailwind 工具类（monorepo 中已 hoist）
    '../node_modules/streamdown/dist/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        userBubble: 'var(--color-user-bubble)',
        aiBubble: 'var(--color-ai-bubble)',
        error: 'var(--color-error)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        textPrimary: 'var(--color-text-primary)',
        textSecondary: 'var(--color-text-secondary)',
      },
    },
  },
  plugins: [],
};
