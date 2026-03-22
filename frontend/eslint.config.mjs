import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import hooksPlugin from "eslint-plugin-react-hooks";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  // Global ignores
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      "*.config.js",
      "*.config.ts",
      "*.config.mjs",
      "sentry.*.ts",
      "test_ws.js",
    ],
  },
  // TypeScript parsing for all TS/TSX files
  ...tseslint.configs.recommended,
  // Next.js + React rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react": reactPlugin,
      "react-hooks": hooksPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",

      // Relax some TS rules for existing codebase
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-require-imports": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
];

export default eslintConfig;
