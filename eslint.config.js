import tseslint from "typescript-eslint";

// Installed typescript-eslint 8.74.0 exports config() and configs.recommended.
// config() is marked deprecated in its types in favor of ESLint defineConfig,
// which this installed eslint package does not export. config() is the API the types document.
export default tseslint.config(
  {
    ignores: ["node_modules/**", "private/**", "data/**", "site/**"],
  },
  tseslint.configs.recommended,
);
