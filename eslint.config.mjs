import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "coverage/**",
      "__mocks__/**",
      "test-*.js",
      "test_*.js",
      "test-*.ts",
      "tests/rate-limiting-verification.js",
    ],
  },
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
      // Allow any types in test files and specific contexts
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }, // Allow console usage inside the logger implementation by design
  {
    files: ["lib/utils/logger.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: [
      "tests/**",
      "scripts/**",
      "**/*.test.{ts,tsx,js,jsx}",
      "**/*.spec.{ts,tsx,js,jsx}",
    ],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
  {
    files: ["contexts/**"],
    rules: {
      "no-console": "warn", // Allow console in context files but warn about it
    },
  },
];

export default eslintConfig;
