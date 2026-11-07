// ESLint 9 flat config: TypeScript rules, React hooks rules, and accessibility
// rules for JSX (names on buttons, keyboard access, valid roles).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/icons/generated", "scripts", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // autoFocus on a field inside a dialog is what the user wants; plain page elements still count.
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
      // `const { drop: _, ...rest } = x` is the normal way to leave a field out.
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true, varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["vite.config.ts", "vitest.config.ts", "playwright.config.ts", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
);
