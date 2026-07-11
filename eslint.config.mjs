export default [
  {
    ignores: ["node_modules/**", "dist/**", "output/**", ".wrangler/**", ".codex-local/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    rules: {
      "no-debugger": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-unreachable": "error",
      "no-constant-condition": ["error", { "checkLoops": false }]
    }
  }
];
