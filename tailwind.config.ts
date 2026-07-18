import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg: "var(--color-bg)",
        "bg-card": "var(--color-bg-card)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        border: "var(--color-border)",
        "border-muted": "var(--color-border-muted)",
        // Text
        ink: "var(--color-ink)",
        "ink-muted": "var(--color-ink-muted)",
        "ink-faint": "var(--color-ink-faint)",
        // Primary – Coral
        primary: {
          DEFAULT: "var(--color-primary)",
          container: "var(--color-primary-container)",
          soft: "var(--color-primary-soft)",
        },
        // Secondary – Teal
        secondary: {
          DEFAULT: "var(--color-secondary)",
          container: "var(--color-secondary-container)",
          soft: "var(--color-secondary-soft)",
        },
        // Tertiary – Gold
        tertiary: {
          DEFAULT: "var(--color-tertiary)",
          container: "var(--color-tertiary-container)",
          soft: "var(--color-tertiary-soft)",
        },
        // Semantic aliases (kept for existing code compatibility)
        amber: {
          DEFAULT: "var(--color-tertiary)",
          soft: "var(--color-tertiary-soft)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          soft: "var(--color-success-soft)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          soft: "var(--color-danger-soft)",
        },
        info: {
          DEFAULT: "var(--color-primary)",
          soft: "var(--color-primary-soft)",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["DM Sans", "ui-monospace", "monospace"],
      },
      fontSize: {
        "2xs": ["11px", { lineHeight: "1.4" }],
      },
      fontWeight: {
        medium: "500",
        bold: "700",
        extrabold: "800",
      },
      borderRadius: {
        sm:  "4px",
        DEFAULT: "4px",
        md:  "4px",
        lg:  "6px",
        xl:  "6px",
        full: "9999px",
      },
      boxShadow: {
        // Hard brutalist shadows — no blur
        "hard-1": "3px 3px 0 0 var(--color-border)",
        "hard-2": "4px 4px 0 0 var(--color-border)",
        "hard-3": "6px 6px 0 0 var(--color-border)",
        "hard-1-push": "1px 1px 0 0 var(--color-border)",
        "hard-2-push": "2px 2px 0 0 var(--color-border)",
        // Muted versions for non-interactive cards
        "hard-1-muted": "3px 3px 0 0 var(--color-border-muted)",
        "hard-2-muted": "4px 4px 0 0 var(--color-border-muted)",
      },
      letterSpacing: {
        tighter: "-0.02em",
        tight:   "-0.01em",
        wider:   "0.02em",
        widest:  "0.05em",
      },
    },
  },
  plugins: [],
};

export default config;
