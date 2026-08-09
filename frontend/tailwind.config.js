/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx,less}'],
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
