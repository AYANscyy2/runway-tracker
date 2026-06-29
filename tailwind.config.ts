import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#14161B",
        surface: "#1B1E25",
        "surface-2": "#232730",
        border: "#2A2E37",
        ink: "#ECE9E2",
        "ink-muted": "#8B8E98",
        amber: {
          DEFAULT: "#E2A33B",
          soft: "rgba(226,163,59,0.14)",
        },
        success: {
          DEFAULT: "#5FB88A",
          soft: "rgba(95,184,138,0.14)",
        },
        danger: {
          DEFAULT: "#D2604C",
          soft: "rgba(210,96,76,0.14)",
        },
        info: {
          DEFAULT: "#6E93C4",
          soft: "rgba(110,147,196,0.14)",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SF Mono",
          "JetBrains Mono",
          "Cascadia Code",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
      },
    },
  },
  plugins: [],
};

export default config;
