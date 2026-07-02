import type { Config } from "tailwindcss";

/**
 * Lottizen design tokens.
 * The core visual system lives as CSS custom properties in app/globals.css
 * (ported verbatim from the v5 design). Here we expose those tokens to
 * Tailwind utilities so shadcn/ui components and ad-hoc classes stay on-brand.
 */
const config: Config = {
  darkMode: ["selector", '[data-theme="night"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "var(--cream)",
        "cream-warm": "var(--cream-warm)",
        "cream-deep": "var(--cream-deep)",
        paper: "var(--paper)",
        orange: "var(--orange)",
        "orange-deep": "var(--orange-deep)",
        "orange-glow": "var(--orange-glow)",
        gold: "var(--gold)",
        "gold-soft": "var(--gold-soft)",
        foil: "var(--foil)",
        "foil-deep": "var(--foil-deep)",
        ink: "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        "ink-dim": "var(--ink-dim)",
        line: "var(--line)",
        "line-strong": "var(--line-strong)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        serif: ["var(--font-serif)", "serif"],
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        card: "4px 4px 0 var(--ink)",
        "card-lg": "8px 8px 0 var(--ink)",
        "card-hover": "8px 8px 0 var(--orange)",
      },
      keyframes: {
        reveal: {
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        reveal: "reveal 1s cubic-bezier(0.2,0.8,0.2,1) forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
