import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["jest.config.js", "jest.setup.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Start with warn to surface issues without breaking builds; allow warn/error for critical paths
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Allow console usage inside the logger implementation by design
  {
    files: ["lib/utils/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["tests/**", "scripts/**"],
    rules: {
      "no-console": "off",
    },
  },
];

export default eslintConfig;
