import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      "node_modules/",
      "**/node_modules/",
      "dist/",
      "**/dist/",
      ".turbo/",
      ".worktrees/",
      "**/references/agentskills/",
    ],
  },
];
