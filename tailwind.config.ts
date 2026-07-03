import type { Config } from "tailwindcss";

/**
 * Lottizen editorial design tokens. The core system lives as CSS custom
 * properties in app/globals.css; these expose the same tokens to Tailwind
 * utilities so any shadcn/ui component or ad-hoc class stays on-brand.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-warm": "var(--bg-warm)",
        surface: "var(--surface)",
        border: "var(--border)",
        "border-2": "var(--border-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        brand: "var(--brand)",
        "brand-deep": "var(--brand-deep)",
        "brand-soft": "var(--brand-soft)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
