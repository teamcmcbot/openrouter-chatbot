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
      // Enforce no console usage globally in app code
      "no-console": ["error"],
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
