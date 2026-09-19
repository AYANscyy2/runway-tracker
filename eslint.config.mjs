import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships flat configs directly — no FlatCompat needed.
export default [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "tests/.build/**", "scripts/**", "sql/**"] },
  {
    rules: {
      // Drizzle's update payloads are genuinely dynamic; the alternative is a
      // cast per field, which hides more than it catches.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
