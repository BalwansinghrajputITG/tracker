/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      /* ── Semantic color tokens ─────────────────────────────── */
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        secondary: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        success: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        danger: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        neutral: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },

      /* ── Spacing tokens ────────────────────────────────────── */
      spacing: {
        'page':    '1.5rem',   // 24px — outer page padding
        'card':    '1.25rem',  // 20px — card internal padding
        'section': '1rem',     // 16px — section gaps
        'element': '0.5rem',   //  8px — spacing between small elements
      },

      /* ── Border-radius tokens ──────────────────────────────── */
      borderRadius: {
        'sm':  '0.375rem',  //  6px
        'md':  '0.5rem',    //  8px
        'lg':  '0.75rem',   // 12px
        'xl':  '1rem',      // 16px
        '2xl': '1.25rem',   // 20px
        '3xl': '1.5rem',    // 24px
      },

      /* ── Shadow tokens ─────────────────────────────────────── */
      boxShadow: {
        'sm':  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        'md':  '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
        'lg':  '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
        'xl':  '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.04)',
        'modal': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      },

      /* ── Z-index scale ──────────────────────────────────────── */
      zIndex: {
        'dropdown': '50',
        'sticky':   '60',
        'modal':    '70',
        'toast':    '80',
      },

      /* ── Existing tokens ────────────────────────────────────── */
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms')({
      strategy: 'class',  // opt-in via `form-input`, `form-select`, etc. — won't break existing styles
    }),
    require('@tailwindcss/typography'),
  ],
}
